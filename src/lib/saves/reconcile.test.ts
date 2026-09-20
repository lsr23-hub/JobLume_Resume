import { describe, expect, it } from "vitest";
import { contentHash } from "./hash";
import { emptyBaseline, recordKey, type Baseline } from "./baseline";
import { reconcile } from "./reconcile";
import type { SavableSnapshot } from "./session";

/** 只填被测逻辑会碰的字段 —— 对账只做哈希，不读任何字段 */
const snap = (over: Partial<SavableSnapshot> = {}): SavableSnapshot => ({
  profile: null,
  resumes: {},
  targets: {},
  ...over,
});

const baselineOf = async (
  entries: Array<{ kind: "profile" | "resume" | "jd"; id?: string; data: unknown }>
): Promise<Baseline> => {
  const records: Record<string, string> = {};
  for (const e of entries) records[recordKey(e.kind, e.id)] = await contentHash(e.data);
  return { schemaVersion: 2, records };
};

const RESUME = "resume:r1";
const PROFILE = "profile";

describe("启动对账：三方比对", () => {
  it("① 两边一致、基线也一致 → 什么都不做", async () => {
    const data = { id: "r1", v: 1 };
    const out = await reconcile({
      local: snap({ resumes: { r1: data } }),
      disk: snap({ resumes: { r1: data } }),
      baseline: await baselineOf([{ kind: "resume", id: "r1", data }]),
    });

    expect(out).toEqual({ pull: [], push: [], conflicts: [], settled: [] });
  });

  it("①' 两边一致但基线过期 → 只记 settled（不传输）", async () => {
    const data = { id: "r1", v: 2 };
    const out = await reconcile({
      local: snap({ resumes: { r1: data } }),
      disk: snap({ resumes: { r1: data } }),
      baseline: await baselineOf([{ kind: "resume", id: "r1", data: { id: "r1", v: 1 } }]),
    });

    expect(out.settled).toEqual([RESUME]);
    expect(out.pull).toEqual([]);
    expect(out.push).toEqual([]);
  });

  it("② 本地没动、磁盘变了 → **拉回来**（手改文件生效）", async () => {
    const before = { id: "r1", v: 1 };
    const handEdited = { id: "r1", v: 99 };
    const out = await reconcile({
      local: snap({ resumes: { r1: before } }),
      disk: snap({ resumes: { r1: handEdited } }),
      baseline: await baselineOf([{ kind: "resume", id: "r1", data: before }]),
    });

    expect(out.pull).toEqual([{ key: RESUME, kind: "resume", id: "r1", data: handEdited }]);
    expect(out.push).toEqual([]);
  });

  it("③ 磁盘没动、本地变了 → 推上去", async () => {
    const before = { id: "r1", v: 1 };
    const edited = { id: "r1", v: 2 };
    const out = await reconcile({
      local: snap({ resumes: { r1: edited } }),
      disk: snap({ resumes: { r1: before } }),
      baseline: await baselineOf([{ kind: "resume", id: "r1", data: before }]),
    });

    expect(out.push).toEqual([{ op: "write", kind: "resume", id: "r1", data: edited }]);
    expect(out.pull).toEqual([]);
  });

  it("④ 两边都改了且不一样 → **冲突，两边都不动**", async () => {
    const before = { id: "r1", v: 1 };
    const out = await reconcile({
      local: snap({ resumes: { r1: { id: "r1", v: 2 } } }),
      disk: snap({ resumes: { r1: { id: "r1", v: 3 } } }),
      baseline: await baselineOf([{ kind: "resume", id: "r1", data: before }]),
    });

    expect(out.conflicts).toEqual([{ key: RESUME, kind: "resume", id: "r1" }]);
    expect(out.pull).toEqual([]);
    expect(out.push).toEqual([]);
  });

  it("⑤ 本地没有、磁盘有（基线也认）→ 拉回来 —— 清缓存后的恢复就靠这条", async () => {
    const data = { id: "r1", v: 1 };
    const out = await reconcile({
      local: snap(),
      disk: snap({ resumes: { r1: data } }),
      baseline: await baselineOf([{ kind: "resume", id: "r1", data }]),
    });

    expect(out.pull).toEqual([{ key: RESUME, kind: "resume", id: "r1", data }]);
  });

  it("⑤' 本地没有、磁盘有、而基线不认识它 → 也拉回来（磁盘是唯一的副本）", async () => {
    const data = { id: "r1", v: 1 };
    const out = await reconcile({
      local: snap(),
      disk: snap({ resumes: { r1: data } }),
      baseline: emptyBaseline(),
    });

    expect(out.pull).toEqual([{ key: RESUME, kind: "resume", id: "r1", data }]);
  });

  it("⑥ 本地有、磁盘没有（文件被手删了）→ **推回去**，不静默销毁本地那份", async () => {
    const data = { id: "r1", v: 1 };
    const out = await reconcile({
      local: snap({ resumes: { r1: data } }),
      disk: snap(),
      baseline: await baselineOf([{ kind: "resume", id: "r1", data }]),
    });

    expect(out.push).toEqual([{ op: "write", kind: "resume", id: "r1", data }]);
    expect(out.pull).toEqual([]);
    expect(out.conflicts).toEqual([]);
  });

  it("⑦ 两边都没有、基线里还留着 → settled（基线条目该清掉）", async () => {
    const gone = { id: "r1", v: 1 };
    const out = await reconcile({
      local: snap(),
      disk: snap(),
      baseline: await baselineOf([{ kind: "resume", id: "r1", data: gone }]),
    });

    expect(out.settled).toEqual([RESUME]);
  });

  it("认不出的基线键跳过（基线可以被手改）", async () => {
    const out = await reconcile({
      local: snap(),
      disk: snap(),
      baseline: { schemaVersion: 2, records: { "nonsense:1": "x", "resume:": "y", profile: "z" } },
    });

    // 只有合法的那个键产生了结论（本地没有、磁盘没有、基线有 → settled）
    expect(out.settled).toEqual([PROFILE]);
  });

  it("三种 kind 各走各的（profile 不带 id）", async () => {
    const profile = { basic: { name: "甲" } };
    const jd = { id: "t1" };
    const out = await reconcile({
      local: snap({ targets: { t1: jd } }),
      disk: snap({ profile }),
      baseline: emptyBaseline(),
    });

    expect(out.pull.map((p) => p.key)).toEqual([PROFILE]);
    expect(out.push.map((p) => ("id" in p ? p.id : undefined))).toEqual(["t1"]);
  });

  it("一条记录坏掉不影响别的（逐键独立）", async () => {
    const ok = { id: "ok" };
    const out = await reconcile({
      local: snap({ resumes: { ok, bad: { id: "bad", v: 2 } } }),
      disk: snap({ resumes: { ok, bad: { id: "bad", v: 3 } } }),
      baseline: await baselineOf([
        { kind: "resume", id: "ok", data: ok },
        { kind: "resume", id: "bad", data: { id: "bad", v: 1 } },
      ]),
    });

    expect(out.conflicts.map((c) => c.id)).toEqual(["bad"]);
    expect(out.push).toEqual([]);
    expect(out.settled).toEqual([]);
  });
});
