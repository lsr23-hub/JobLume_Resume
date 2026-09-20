import { describe, expect, it } from "vitest";
import { emptyBaseline, recordKey } from "./baseline";
import { contentHash } from "./hash";
import { collectDirty, type SavableSnapshot } from "./session";

/** 只填被测逻辑会碰的字段 —— collectDirty 只做哈希，不读任何字段 */
const snapshot = (over: Partial<SavableSnapshot> = {}): SavableSnapshot => ({
  profile: null,
  resumes: {},
  targets: {},
  ...over,
});

/** 造一份「这些内容已经落过盘」的基线 */
const baselineOf = async (
  entries: Array<{ kind: "profile" | "resume" | "jd"; id?: string; data: unknown }>
) => {
  const records: Record<string, string> = {};
  for (const e of entries) records[recordKey(e.kind, e.id)] = await contentHash(e.data);
  return { schemaVersion: 2, records };
};

const keysOf = (ops: Array<{ kind: string; id?: string }>) =>
  ops.map((o) => recordKey(o.kind, o.id)).sort();

describe("算哪些改动还没落盘", () => {
  it("空基线 + 有数据 → 全部要写", async () => {
    const ops = await collectDirty(
      snapshot({ profile: { basic: { name: "甲" } }, resumes: { r1: { id: "r1" } } }),
      emptyBaseline()
    );

    expect(ops.map((o) => o.op)).toEqual(["write", "write"]);
    expect(keysOf(ops)).toEqual(["profile", "resume:r1"]);
  });

  it("**与基线一致的一条都不写** —— 点保存不重写整棵树就靠这条", async () => {
    const profile = { basic: { name: "甲" } };
    const resumes = { r1: { id: "r1", v: 1 } };
    const baseline = await baselineOf([
      { kind: "profile", data: profile },
      { kind: "resume", id: "r1", data: resumes.r1 },
    ]);

    expect(await collectDirty(snapshot({ profile, resumes }), baseline)).toEqual([]);
  });

  it("只有变了的那条要写（不是整棵树）", async () => {
    const profile = { basic: { name: "甲" } };
    const r1 = { id: "r1", v: 1 };
    const r2 = { id: "r2", v: 1 };
    const baseline = await baselineOf([
      { kind: "profile", data: profile },
      { kind: "resume", id: "r1", data: r1 },
      { kind: "resume", id: "r2", data: r2 },
    ]);

    // 只动 r2
    const ops = await collectDirty(
      snapshot({ profile, resumes: { r1, r2: { id: "r2", v: 2 } } }),
      baseline
    );

    expect(keysOf(ops)).toEqual(["resume:r2"]);
    expect(ops[0]).toMatchObject({ op: "write", kind: "resume", id: "r2" });
  });

  it("**键序变了但内容相同 → 不写**（手改文件重排版不该被当成改动）", async () => {
    const a = { x: 1, y: { p: 1, q: 2 } };
    const b = { y: { q: 2, p: 1 }, x: 1 };
    const baseline = await baselineOf([{ kind: "profile", data: a }]);

    expect(await collectDirty(snapshot({ profile: b }), baseline)).toEqual([]);
  });

  it("基线里有、本地没有 → 产生删除（本地删掉了，磁盘上那份也要删）", async () => {
    const gone = { id: "r9", v: 1 };
    const baseline = await baselineOf([{ kind: "resume", id: "r9", data: gone }]);

    const ops = await collectDirty(snapshot(), baseline);
    expect(ops).toEqual([{ op: "delete", kind: "resume", id: "r9" }]);
  });

  it("本地删了档案 → 删的是不带 id 的那条", async () => {
    const baseline = await baselineOf([{ kind: "profile", data: { basic: {} } }]);
    expect(await collectDirty(snapshot(), baseline)).toEqual([{ op: "delete", kind: "profile", id: undefined }]);
  });

  it("**认不出的基线键跳过**（基线可以被手改，不能凭它拼路径）", async () => {
    const baseline = {
      schemaVersion: 2,
      records: { "nonsense:1": "x", "resume:": "x", resume: "x", "resume:ok": "y" },
    };

    const ops = await collectDirty(snapshot({ resumes: { ok: { id: "ok" } } }), baseline);

    // 只有合规的那条进了比较（内容与 'y' 不同 → 写），另外三个怪键既不删也不写
    expect(keysOf(ops)).toEqual(["resume:ok"]);
    expect(ops[0].op).toBe("write");
  });

  it("岗位也走同一条路（jd 前缀）", async () => {
    const t1 = { id: "t1" };
    const baseline = await baselineOf([{ kind: "jd", id: "t1", data: t1 }]);
    expect(await collectDirty(snapshot({ targets: { t1: { id: "t1", v: 2 } } }), baseline)).toEqual([
      { op: "write", kind: "jd", id: "t1", data: { id: "t1", v: 2 } },
    ]);
  });

  it("空快照 + 空基线 → 一个 op 都没有", async () => {
    expect(await collectDirty(snapshot(), emptyBaseline())).toEqual([]);
  });
});
