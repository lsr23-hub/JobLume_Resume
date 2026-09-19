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
import { LEGACY_USER_ID } from "./userScope";

/** 每个用例都从干净状态起步 —— store 是模块级单例 */
const reset = () => {
  useCareerProfileStore.setState({ profiles: {}, currentUserId: null, profile: null });
  memory.clear();
};

const nameOf = (userId: string) =>
  useCareerProfileStore.getState().profiles[userId]?.basic.name;

describe("多用户作用域", () => {
  beforeEach(reset);

  it("没选用户时 ensureProfile 返回 null，且**不创建**幽灵档案", () => {
    expect(useCareerProfileStore.getState().ensureProfile()).toBeNull();
    expect(useCareerProfileStore.getState().profiles).toEqual({});
  });

  it("没选用户时写操作一律 no-op（不是抛错，也不是写进 profiles[null]）", () => {
    const api = useCareerProfileStore.getState();
    api.updateBasic({ name: "张三" });
    api.setCertificateText("CET-6");
    api.addSkillGroup({ name: "语言", content: "英语" });

    const after = useCareerProfileStore.getState();
    expect(after.profiles).toEqual({});
    expect(after.profile).toBeNull();
    // 关键：不能出现字面量 "null" 这个键
    expect(Object.keys(after.profiles)).not.toContain("null");
    expect(after.addEntity({ sectionId: "experience" })).toBe("");
  });

  it("createUser 建立档案并设为当前；任何写入都同步刷新 profile 别名", () => {
    const id = useCareerProfileStore.getState().createUser();
    expect(useCareerProfileStore.getState().currentUserId).toBe(id);
    expect(useCareerProfileStore.getState().profile).toBe(
      useCareerProfileStore.getState().profiles[id]
    );

    useCareerProfileStore.getState().updateBasic({ name: "张三" });
    expect(useCareerProfileStore.getState().profile!.basic.name).toBe("张三");
    // 别名必须与切片同源，而不是各存一份
    expect(useCareerProfileStore.getState().profile).toBe(
      useCareerProfileStore.getState().profiles[id]
    );

    const entityId = useCareerProfileStore.getState().addEntity({
      sectionId: "experience",
      title: "示例科技",
    });
    expect(entityId).toBeTruthy();
    expect(useCareerProfileStore.getState().profile!.entities[entityId]).toBeTruthy();
  });

  it("切用户时 profile 别名跟着换，两个用户的数据互不可见", () => {
    const a = useCareerProfileStore.getState().createUser();
    useCareerProfileStore.getState().updateBasic({ name: "甲" });
    const b = useCareerProfileStore.getState().createUser();
    useCareerProfileStore.getState().updateBasic({ name: "乙" });

    expect(useCareerProfileStore.getState().profile!.basic.name).toBe("乙");
    expect(nameOf(a)).toBe("甲");

    useCareerProfileStore.getState().setCurrentUser(a);
    expect(useCareerProfileStore.getState().profile!.basic.name).toBe("甲");
    expect(useCareerProfileStore.getState().profile!.entities).toEqual({});
  });

  it("切到不存在的用户 id 会被夹成 null，避免悬空引用", () => {
    useCareerProfileStore.getState().createUser();
    useCareerProfileStore.getState().setCurrentUser("不存在");
    expect(useCareerProfileStore.getState().currentUserId).toBeNull();
    expect(useCareerProfileStore.getState().profile).toBeNull();
  });

  it("删掉当前用户 → currentUserId 置空（回到选择弹窗），另一个用户完好", () => {
    const a = useCareerProfileStore.getState().createUser();
    useCareerProfileStore.getState().updateBasic({ name: "甲" });
    const b = useCareerProfileStore.getState().createUser();
    useCareerProfileStore.getState().updateBasic({ name: "乙" });

    useCareerProfileStore.getState().removeUser(b);
    expect(useCareerProfileStore.getState().currentUserId).toBeNull();
    expect(useCareerProfileStore.getState().profile).toBeNull();
    expect(nameOf(a)).toBe("甲");
    expect(nameOf(b)).toBeUndefined();
  });

  it("touchProfile 换新引用但内容不变 —— SaveBar 依赖这个语义", () => {
    useCareerProfileStore.getState().createUser();
    useCareerProfileStore.getState().updateBasic({ name: "甲" });
    const before = useCareerProfileStore.getState().profile!;

    useCareerProfileStore.getState().touchProfile();
    const after = useCareerProfileStore.getState().profile!;

    expect(after).not.toBe(before);
    expect(after).toEqual(before);
  });

  it("惰性字段迁移仍会跑：老档案补上 preset 自定义字段", () => {
    const id = "u1";
    useCareerProfileStore.setState({
      profiles: {
        [id]: {
          version: 1,
          basic: { name: "老档案", customFields: [] },
          entities: {},
          sectionOrder: [],
          skillGroups: [],
          certificateText: "",
          languageText: "",
          selfEvaluationContent: "",
          meta: { createdAt: "t", updatedAt: "t", lastBackupAt: null },
        },
      } as never,
      currentUserId: id,
      profile: null,
    });

    const synced = useCareerProfileStore.getState().ensureProfile()!;
    expect(synced.basic.customFields.length).toBeGreaterThan(0);
    // 迁移结果必须落盘到该用户名下，且别名同步
    expect(useCareerProfileStore.getState().profiles[id].basic.customFields.length)
      .toBeGreaterThan(0);
    expect(useCareerProfileStore.getState().profile).toBe(synced);
  });

  it("LEGACY_USER_ID 只是迁移用的固定字面量，不参与运行期逻辑", () => {
    expect(LEGACY_USER_ID).toBe("legacy-default");
    expect(useCareerProfileStore.getState().profiles[LEGACY_USER_ID]).toBeUndefined();
  });
});
