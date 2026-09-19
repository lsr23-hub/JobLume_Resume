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
import { useResumeStore } from "./useResumeStore";
import type { ResumeData } from "@/types/resume";

const resume = (id: string): ResumeData => ({ id, title: id } as unknown as ResumeData);

/** 盘上真实存下来的东西（`partialize` 的产物），不是内存里的别名 */
const persisted = (): { byUser: Record<string, Record<string, ResumeData>> } =>
  JSON.parse(memory.get("resume-storage") ?? "{}").state ?? { byUser: {} };

describe("备份导入的简历落地", () => {
  beforeEach(() => {
    useCareerProfileStore.setState({ profiles: {}, currentUserId: null, profile: null });
    useResumeStore.setState({ byUser: {}, activeByUser: {}, resumes: {}, activeResumeId: null, activeResume: null });
    memory.clear();
  });

  it("replaceResumes 把导入的简历写进当前用户的桶，并且**落盘**", () => {
    const uid = useCareerProfileStore.getState().createUser();
    useResumeStore.getState().replaceResumes({ r1: resume("r1"), r2: resume("r2") });

    expect(Object.keys(useResumeStore.getState().resumes)).toEqual(["r1", "r2"]);
    // 这一步是这次修复的要点：别名对了不够，byUser 也必须对，否则刷新就没了
    expect(Object.keys(persisted().byUser[uid] ?? {})).toEqual(["r1", "r2"]);
  });

  it("换掉整张表后，指向已消失简历的 activeResumeId 会被清掉", () => {
    useCareerProfileStore.getState().createUser();
    useResumeStore.setState({ resumes: { old: resume("old") }, activeResumeId: "old" });
    useResumeStore.getState().replaceResumes({ r1: resume("r1") });

    expect(useResumeStore.getState().activeResumeId).toBeNull();
    expect(useResumeStore.getState().activeResume).toBeNull();
  });

  it("新表里仍然有那一份时，activeResumeId 保持不变", () => {
    useCareerProfileStore.getState().createUser();
    useResumeStore.setState({ resumes: { keep: resume("keep") }, activeResumeId: "keep" });
    useResumeStore.getState().replaceResumes({ keep: resume("keep"), extra: resume("extra") });

    expect(useResumeStore.getState().activeResumeId).toBe("keep");
    expect(useResumeStore.getState().activeResume?.id).toBe("keep");
  });

  it("没有当前用户时是 no-op —— 不能写进一个谁也读不到的别名", () => {
    useResumeStore.getState().replaceResumes({ r1: resume("r1") });

    expect(useResumeStore.getState().resumes).toEqual({});
    expect(persisted().byUser).toEqual({});
  });
});
