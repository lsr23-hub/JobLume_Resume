import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 测试环境是 node，没有 localStorage，而 persist 在**模块初始化阶段**就会读一次
 * storage。`vi.hoisted` 保证这段跑在下面的 import 之前 —— 普通顶层代码不行。
 */
const { memory } = vi.hoisted(() => {
  const memory = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
    clear: () => memory.clear(),
  };
  return { memory };
});

import { useCareerProfileStore } from "./useCareerProfileStore";
import { useJobTargetStore } from "./useJobTargetStore";
import type { AnalysisCache, MatchAnalysis } from "@/types/jobTarget";

const analysis = (modelId: string) =>
  ({ items: {}, rankedIds: [], topN: 5, summary: {}, modelId }) as unknown as MatchAnalysis;
const cache = (fp: string) => ({ contentFingerprint: fp }) as unknown as AnalysisCache;

const store = () => useJobTargetStore.getState();
const bucketIds = (userId: string) => Object.keys(store().targetsByUser[userId] ?? {});
/** 盘上真实存下来的东西（`partialize` 的产物），不是内存里的别名 */
const persisted = () => JSON.parse(memory.get("job-target-storage") ?? "{}").state ?? {};

const addTarget = (company = "示例公司") =>
  store().addTarget({ company, position: "前端", jdRaw: "JD" });

describe("岗位按用户隔离：别名与分桶始终一致", () => {
  beforeEach(() => {
    useCareerProfileStore.setState({ profiles: {}, currentUserId: null, profile: null });
    useJobTargetStore.setState({ targetsByUser: {}, targets: {} });
    memory.clear();
  });

  it("addTarget 之后别名与当前用户的桶同时有它，并且**落盘**", () => {
    const uid = useCareerProfileStore.getState().createUser();
    const id = addTarget();

    expect(Object.keys(store().targets)).toEqual([id]);
    expect(bucketIds(uid)).toEqual([id]);
    expect(Object.keys(persisted().targetsByUser[uid] ?? {})).toEqual([id]);
  });

  it("持久化切片只有 targetsByUser，别名不进盘", () => {
    useCareerProfileStore.getState().createUser();
    addTarget();
    expect(Object.keys(persisted())).toEqual(["targetsByUser"]);
  });

  it("没有当前用户时整个 no-op —— 不能只写别名，那会刷新即丢", () => {
    const id = addTarget();

    expect(id).toBeTruthy();
    expect(store().targets).toEqual({});
    expect(store().targetsByUser).toEqual({});
    expect(persisted().targetsByUser).toBeUndefined();
  });

  it("两个用户各存一份，互不可见", () => {
    const jia = useCareerProfileStore.getState().createUser();
    const jiaTarget = addTarget("甲的公司");

    const yi = useCareerProfileStore.getState().createUser();
    expect(store().targets).toEqual({}); // 乙名下还没有岗位
    const yiTarget = addTarget("乙的公司");

    // 切回甲：看到的只有甲那一条
    store().setActiveUser(jia);
    expect(Object.keys(store().targets)).toEqual([jiaTarget]);
    store().setActiveUser(yi);
    expect(Object.keys(store().targets)).toEqual([yiTarget]);
    expect(bucketIds(jia)).toEqual([jiaTarget]);
    expect(bucketIds(yi)).toEqual([yiTarget]);
  });

  it("切用户会把上一个人的岗位从别名里换掉", () => {
    const jia = useCareerProfileStore.getState().createUser();
    addTarget("甲的公司");
    const yi = useCareerProfileStore.getState().createUser();
    const yiTarget = addTarget("乙的公司");

    store().setActiveUser(jia);
    expect(store().targets[yiTarget]).toBeUndefined();
    expect(Object.values(store().targets)[0].company).toBe("甲的公司");
  });

  it("setAnalysis 写在当前用户那一份上", () => {
    useCareerProfileStore.getState().createUser();
    const id = addTarget();
    store().setAnalysis(id, analysis("m1"), cache("fp1"));

    expect(store().targets[id].matchAnalysis?.modelId).toBe("m1");
    expect(store().targets[id].analysisCache?.contentFingerprint).toBe("fp1");
  });

  it("purgeUser 清掉那个用户的桶，别人的不动", () => {
    const jia = useCareerProfileStore.getState().createUser();
    const jiaTarget = addTarget("甲的公司");
    const yi = useCareerProfileStore.getState().createUser();
    const yiTarget = addTarget("乙的公司");

    // 真的切回甲（走档案 store，订阅会把别名跟着换过来）再删乙 ——
    // 删的不是当前用户，别名不该被动
    useCareerProfileStore.getState().setCurrentUser(jia);
    expect(Object.keys(store().targets)).toEqual([jiaTarget]);
    store().purgeUser(yi);

    expect(bucketIds(yi)).toEqual([]);
    expect(bucketIds(jia)).toEqual([jiaTarget]);
    expect(Object.keys(store().targets)).toEqual([jiaTarget]);
    expect(store().targets[yiTarget]).toBeUndefined();
  });

  it("删的正是当前用户时，别名一并清空（不留指向已删数据的残影）", () => {
    const jia = useCareerProfileStore.getState().createUser();
    addTarget("甲的公司");

    store().purgeUser(jia);

    expect(store().targets).toEqual({});
    expect(store().targetsByUser).toEqual({});
  });

  it("replaceTargets 走收口：桶与别名一起换，且落盘", () => {
    const uid = useCareerProfileStore.getState().createUser();
    addTarget("旧的");
    store().replaceTargets({ t9: { id: "t9", company: "导入的", position: "后端", jdRaw: "JD", matchAnalysis: null, analysisCache: null, createdAt: "t", updatedAt: "t" } });

    expect(Object.keys(store().targets)).toEqual(["t9"]);
    expect(bucketIds(uid)).toEqual(["t9"]);
    expect(Object.keys(persisted().targetsByUser[uid] ?? {})).toEqual(["t9"]);
  });

  it("updateTarget / removeTarget 也都同步到桶", () => {
    const uid = useCareerProfileStore.getState().createUser();
    const id = addTarget();

    store().updateTarget(id, { company: "改过的" });
    expect(store().targetsByUser[uid][id].company).toBe("改过的");

    store().removeTarget(id);
    expect(store().targetsByUser[uid][id]).toBeUndefined();
    expect(Object.keys(store().targets)).toEqual([]);
  });
});
