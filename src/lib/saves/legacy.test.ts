import { beforeEach, describe, expect, it, vi } from "vitest";

const { memory } = vi.hoisted(() => {
  const memory = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => void memory.set(k, v),
      removeItem: (k: string) => void memory.delete(k),
      clear: () => memory.clear(),
    },
  };
  return { memory };
});

import {
  LEGACY_KEYS,
  clearLegacyKeys,
  readLegacyBlobs,
  shouldAdoptLegacy,
  snapshotFromLegacy,
} from "./legacy";
import type { UserSnapshot } from "./mirror";

/** 旧 blob 的外壳：`{ state, version }` */
const blob = (state: unknown, version: number) => JSON.stringify({ state, version });

const profile = (name: string) => ({ basic: { name }, entities: {} });
const resume = (id: string) => ({ id, title: id });
const target = (id: string) => ({ id, company: id, matchAnalysis: null, analysisCache: null });

const empty = (): UserSnapshot => ({ profile: null, resumes: {}, targets: {} });

describe("从旧 localStorage 捞数据", () => {
  beforeEach(() => memory.clear());

  it("v1（当前形状）：按用户分好的档案/简历/岗位合到一起", () => {
    const out = snapshotFromLegacy({
      profile: blob({ profiles: { ua: profile("甲") }, currentUserId: "ua" }, 1),
      resume: blob({ byUser: { ua: { r1: resume("r1") } }, activeByUser: { ua: "r1" } }, 1),
      targets: blob({ targetsByUser: { ua: { t1: target("t1") } } }, 2),
      });

    expect(out.currentUserId).toBe("ua");
    expect(out.users.ua.profile?.basic.name).toBe("甲");
    expect(Object.keys(out.users.ua.resumes)).toEqual(["r1"]);
    expect(Object.keys(out.users.ua.targets)).toEqual(["t1"]);
  });

  it("v0（更早的形状）：单份档案/扁平简历/单槽分析，全都归到 LEGACY_USER_ID", () => {
    const out = snapshotFromLegacy({
      profile: blob({ profile: { basic: { name: "老用户" }, entities: {} } }, 0),
      resume: blob({ resumes: { r1: resume("r1") }, activeResumeId: "r1" }, 0),
      targets: blob(
        { targets: { t1: { id: "t1", company: "旧岗位", matchAnalysis: { items: {}, rankedIds: [], summary: {} } } } },
        0
      ),
    });

    const ids = Object.keys(out.users);
    expect(ids).toEqual(["legacy-default"]);
    expect(out.currentUserId).toBe("legacy-default");
    expect(out.users["legacy-default"].profile?.basic.name).toBe("老用户");
    expect(Object.keys(out.users["legacy-default"].resumes)).toEqual(["r1"]);
    expect(out.users["legacy-default"].targets.t1.matchAnalysis).toBeTruthy();
  });

  it("三个来源的用户取并集 —— 有的用户只有简历", () => {
    const out = snapshotFromLegacy({
      profile: blob({ profiles: { ua: profile("甲") }, currentUserId: "ua" }, 1),
      resume: blob({ byUser: { ub: { r1: resume("r1") } }, activeByUser: {} }, 1),
      targets: blob({ targetsByUser: {} }, 2),
    });

    expect(Object.keys(out.users).sort()).toEqual(["ua", "ub"]);
    expect(out.users.ub.profile).toBeNull();
    expect(Object.keys(out.users.ub.resumes)).toEqual(["r1"]);
    expect(out.users.ub.targets).toEqual({});
  });

  it("坏 blob / 空 blob / 没有 state 外壳的，都当成没有 —— 不抛", () => {
    expect(snapshotFromLegacy({ profile: "{ 坏的", resume: null, targets: "" })).toEqual({
      users: {},
      currentUserId: null,
    });
    // 手写的（没有 { state } 外壳）也认
    const out = snapshotFromLegacy({
      profile: JSON.stringify({ profiles: { ua: profile("甲") }, currentUserId: "ua" }),
      resume: null,
      targets: null,
    });
    expect(out.users.ua.profile?.basic.name).toBe("甲");
  });

  it("形状不对的条目被归一化器丢掉，其余保住", () => {
    const out = snapshotFromLegacy({
      profile: blob({ profiles: { ua: profile("甲"), bad: 42 }, currentUserId: "ua" }, 1),
      resume: blob({ byUser: { ua: { r1: resume("r1"), bad: "不是对象" } }, activeByUser: {} }, 1),
      targets: blob({ targetsByUser: {} }, 2),
    });

    expect(Object.keys(out.users)).toEqual(["ua"]);
    expect(Object.keys(out.users.ua.resumes)).toEqual(["r1"]);
  });
});

describe("采纳规则", () => {
  it("**只在磁盘上什么都没有时才采纳** —— 磁盘是真相源，它已有内容说明早就搬过去了", () => {
    const legacy = { ...empty(), profile: { basic: { name: "甲" } } } as unknown as UserSnapshot;

    expect(shouldAdoptLegacy(empty(), legacy)).toBe(true);
    // 磁盘上已经有档案了 → 不采纳本地旧副本
    expect(shouldAdoptLegacy(legacy, legacy)).toBe(false);
    expect(shouldAdoptLegacy({ ...empty(), resumes: { r1: {} as never } }, legacy)).toBe(false);
  });

  it("遗留那份是空的 → 没什么可采纳的", () => {
    expect(shouldAdoptLegacy(empty(), empty())).toBe(false);
  });
});

describe("旧 key 的读写与清理", () => {
  beforeEach(() => memory.clear());

  it("readLegacyBlobs 按三个 key 取", () => {
    memory.set(LEGACY_KEYS.profile, "P");
    memory.set(LEGACY_KEYS.targets, "T");
    expect(readLegacyBlobs()).toEqual({ profile: "P", resume: null, targets: "T" });
  });

  it("clearLegacyKeys 把三个都删掉（写盘成功之后才该调用）", () => {
    for (const k of Object.values(LEGACY_KEYS)) memory.set(k, "x");
    clearLegacyKeys();
    expect(readLegacyBlobs()).toEqual({ profile: null, resume: null, targets: null });
  });
});
