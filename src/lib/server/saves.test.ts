import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  BASELINE_FILENAME,
  SAVES_SCHEMA_VERSION,
  applySaveOps,
  baselinePath,
  emptyBaseline,
  isSaveOp,
  isSafeSegment,
  listSaveIds,
  listUserIds,
  readBaseline,
  readSaveFile,
  readSaveTree,
  recordKey,
  writeBaseline,
  removeSaveFile,
  removeUserDir,
  resolveSavePath,
  savesEnabled,
  writeSaveFile,
} from "./saves";
import { contentHash } from "@/lib/saves/hash";

const ROOT = "/repo";
const UID = "3f2a1b4c-5d6e-7f80-9a0b-1c2d3e4f5a6b";

describe("存档路径解析", () => {
  it("按 (userId, kind, id) 落到 saves/<userId>/ 下", () => {
    expect(resolveSavePath(ROOT, UID, "profile")).toBe(
      path.resolve("/repo/saves", UID, "profile.json")
    );
    expect(resolveSavePath(ROOT, UID, "resume", "r1")).toBe(
      path.resolve("/repo/saves", UID, "resumes", "r1.json")
    );
    expect(resolveSavePath(ROOT, UID, "jd", "t1")).toBe(
      path.resolve("/repo/saves", UID, "jds", "t1.json")
    );
  });

  it("**用 id 辨别用户**：姓名不进路径，改了名字路径不变", () => {
    // 路径里除了 userId 没有别的身份信息 —— 这正是「姓名不作为唯一标识」的落地
    expect(resolveSavePath(ROOT, UID, "profile")).not.toContain("甲同学");
  });

  it.each([
    "..",
    "../..",
    "../../etc",
    "a/b",
    "a\\b",
    ".hidden",
    "",
    " ",
    "-leading-dash",
    "a".repeat(65),
  ])("拒绝非法 userId：%s", (bad) => {
    expect(() => resolveSavePath(ROOT, bad, "profile")).toThrow();
  });

  it.each(["..", "../x", "a/b", ".", ""])("拒绝非法 id：%s", (bad) => {
    expect(() => resolveSavePath(ROOT, UID, "resume", bad)).toThrow();
  });

  it("非字符串输入一律拒绝（不依赖调用方传对类型）", () => {
    for (const bad of [undefined, null, 42, {}, [], true]) {
      expect(() => resolveSavePath(ROOT, bad, "profile")).toThrow();
      expect(() => resolveSavePath(ROOT, UID, "jd", bad)).toThrow();
    }
  });

  it("profile 不接受 id —— 一个用户只有一份档案", () => {
    expect(() => resolveSavePath(ROOT, UID, "profile", "extra")).toThrow();
  });

  it("解析结果永远在 saves/ 之内", () => {
    const savesRoot = path.resolve(ROOT, "saves");
    for (const kind of ["profile", "resume", "jd"] as const) {
      const p = resolveSavePath(ROOT, UID, kind, kind === "profile" ? undefined : "x1");
      expect(path.relative(savesRoot, p).startsWith("..")).toBe(false);
    }
  });

  it("isSafeSegment 只放行 uuid 那一类字符", () => {
    expect(isSafeSegment(UID)).toBe(true);
    expect(isSafeSegment("abc_DEF-123")).toBe(true);
    expect(isSafeSegment("a.b")).toBe(false);
    expect(isSafeSegment("名字")).toBe(false);
  });
});

// ─────────────────────────── 读取侧（对着真目录） ───────────────────────────

describe("读取", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "joblume-saves-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  /** 直接往磁盘上铺一份存档，不走 writeSaveFile —— 测的是「读别人写的东西」 */
  const lay = async (userId: string, rel: string, body: unknown) => {
    const full = path.join(root, "saves", userId, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, JSON.stringify(body), "utf8");
  };

  it("readSaveFile：文件不存在给 null，内容坏了**抛错**（不是给 null）", async () => {
    expect(await readSaveFile(root, UID, "profile")).toBeNull();

    await lay(UID, "profile.json", { basic: { name: "甲" } });
    expect(await readSaveFile(root, UID, "profile")).toEqual({ basic: { name: "甲" } });

    // 写了一半 / 手改坏了：必须抛，让调用方记进 problems 并跳过这个文件。
    // 给 null 会被当成「没有这份数据」，后续写回时就把它覆盖掉了。
    const full = path.join(root, "saves", UID, "profile.json");
    await fs.writeFile(full, "{ 不是 JSON", "utf8");
    await expect(readSaveFile(root, UID, "profile")).rejects.toThrow();
  });

  it("listSaveIds：只认 <合法片段>.json，别的文件一律忽略", async () => {
    await lay(UID, "resumes/r1.json", { id: "r1" });
    await lay(UID, "resumes/r2.json", { id: "r2" });
    await fs.writeFile(path.join(root, "saves", UID, "resumes", ".DS_Store"), "x");
    await fs.writeFile(path.join(root, "saves", UID, "resumes", "r1.json.bak"), "x");
    await fs.writeFile(path.join(root, "saves", UID, "resumes", "带中文.json"), "x");

    expect(await listSaveIds(root, UID, "resume")).toEqual(["r1", "r2"]);
  });

  it("listSaveIds：目录不存在给空数组，不抛", async () => {
    expect(await listSaveIds(root, UID, "jd")).toEqual([]);
  });

  it("listUserIds：只认合法目录名，且排序稳定", async () => {
    await lay("bbb", "profile.json", {});
    await lay("aaa", "profile.json", {});
    await fs.mkdir(path.join(root, "saves", ".hidden"), { recursive: true });
    await fs.writeFile(path.join(root, "saves", "note.txt"), "x");

    expect(await listUserIds(root)).toEqual(["aaa", "bbb"]);
  });

  it("listUserIds：saves/ 还不存在时给空数组", async () => {
    expect(await listUserIds(root)).toEqual([]);
  });

  it("readSaveTree：一份坏文件记进 problems，**不挡住其余条目**", async () => {
    await lay(UID, "profile.json", { basic: { name: "甲" } });
    await lay(UID, "resumes/r1.json", { id: "r1" });
    await fs.writeFile(path.join(root, "saves", UID, "resumes", "r2.json"), "{ 坏的", "utf8");

    const tree = await readSaveTree(root, UID);
    expect(tree.profile).toEqual({ basic: { name: "甲" } });
    expect(Object.keys(tree.resumes)).toEqual(["r1"]);
    expect(tree.problems).toEqual(["resume:r2"]);
    expect(tree.targets).toEqual({});
  });

  it("readSaveTree：空目录给一棵空树，不抛", async () => {
    expect(await readSaveTree(root, "nobody")).toEqual({
      profile: null,
      resumes: {},
      targets: {},
      // 基线跟着数据一起回传：客户端靠它算「哪些改动还没落盘」
      baseline: { schemaVersion: SAVES_SCHEMA_VERSION, records: {} },
      problems: [],
    });
  });

  it.each(["..", "../..", "a/b", ".hidden", "", 42, null])(
    "读取函数对非法 userId 一律抛错：%s",
    async (bad) => {
      await expect(readSaveTree(root, bad)).rejects.toThrow();
      await expect(listSaveIds(root, bad, "resume")).rejects.toThrow();
    }
  );

  it("removeUserDir：整个目录消失，别的用户不动", async () => {
    await lay(UID, "profile.json", {});
    await lay(UID, "resumes/r1.json", { id: "r1" });
    await lay("other", "profile.json", {});

    await removeUserDir(root, UID);

    expect(await listUserIds(root)).toEqual(["other"]);
    expect(await readSaveFile(root, UID, "profile")).toBeNull();
  });

  it("removeUserDir：目录不存在也算成功（幂等）", async () => {
    await expect(removeUserDir(root, "nobody")).resolves.toBeTruthy();
  });

  it.each(["..", "../..", "../../etc", "a/b", "a\\b", ".hidden", "", 42, null, {}])(
    "removeUserDir 拒绝一切越界输入：%s",
    async (bad) => {
      await expect(removeUserDir(root, bad)).rejects.toThrow();
    }
  );
});

// ─────────────────────────── 写入侧的「写前备份」 ───────────────────────────

describe("写前备份 .bak", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "joblume-saves-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const bakOf = (userId: string, rel: string) =>
    path.join(root, "saves", userId, `${rel}.bak`);

  it("首次写入不产生 .bak —— 没有上一版可备", async () => {
    await writeSaveFile(root, UID, "profile", undefined, { basic: { name: "甲" } });
    await expect(fs.access(bakOf(UID, "profile.json"))).rejects.toThrow();
  });

  it("第二次写入：.bak 里是**上一版**，当前文件是新内容", async () => {
    await writeSaveFile(root, UID, "profile", undefined, { basic: { name: "第一版" } });
    await writeSaveFile(root, UID, "profile", undefined, { basic: { name: "第二版" } });

    expect(await readSaveFile(root, UID, "profile")).toEqual({ basic: { name: "第二版" } });
    const bak = JSON.parse(await fs.readFile(bakOf(UID, "profile.json"), "utf8"));
    expect(bak).toEqual({ basic: { name: "第一版" } });
  });

  it("只留一代：第三次写入后 .bak 是第二版，不是第一版", async () => {
    for (const name of ["一", "二", "三"]) {
      await writeSaveFile(root, UID, "profile", undefined, { basic: { name } });
    }
    const bak = JSON.parse(await fs.readFile(bakOf(UID, "profile.json"), "utf8"));
    expect(bak.basic.name).toBe("二");
  });

  it("简历 / 岗位各自有自己的 .bak", async () => {
    await writeSaveFile(root, UID, "resume", "r1", { id: "r1", title: "旧" });
    await writeSaveFile(root, UID, "resume", "r1", { id: "r1", title: "新" });
    await writeSaveFile(root, UID, "jd", "t1", { id: "t1", company: "甲" });

    const bak = JSON.parse(await fs.readFile(bakOf(UID, "resumes/r1.json"), "utf8"));
    expect(bak.title).toBe("旧");
    await expect(fs.access(bakOf(UID, "jds/t1.json"))).rejects.toThrow();
  });

  it("**.bak 不会被当成一份存档读出来** —— 否则界面上会多出幽灵条目", async () => {
    await writeSaveFile(root, UID, "resume", "r1", { id: "r1", title: "旧" });
    await writeSaveFile(root, UID, "resume", "r1", { id: "r1", title: "新" });

    expect(await listSaveIds(root, UID, "resume")).toEqual(["r1"]);
    const tree = await readSaveTree(root, UID);
    expect(Object.keys(tree.resumes)).toEqual(["r1"]);
    expect(tree.problems).toEqual([]);
  });

  /**
   * 这条钉的是「首屏全量重写」的**危害**。客户端每次打开页面都会把该用户的全部文件
   * 重算一遍 diff（基线从空开始），如果照写不误，`.bak` 每次都被替换成同一份内容 ——
   * 那它就再也救不了「上一次写坏了」，成了一枚永远等于当前版本的摆设。
   */
  it("内容与磁盘上一字不差时：不写、也不动 `.bak`", async () => {
    await writeSaveFile(root, UID, "profile", undefined, { v: 1 });
    await writeSaveFile(root, UID, "profile", undefined, { v: 2 });
    const full = path.resolve(root, "saves", UID, "profile.json");

    const bakBefore = await fs.readFile(`${full}.bak`, "utf8");
    expect(bakBefore).toContain('"v": 1');

    // 再写一次与当前内容完全相同的
    expect(await writeSaveFile(root, UID, "profile", undefined, { v: 2 })).toBe(full);

    // `.bak` 仍然是一代之前那一版 —— 没有被同内容顶掉
    expect(await fs.readFile(`${full}.bak`, "utf8")).toBe(bakBefore);
    expect(JSON.parse(await fs.readFile(full, "utf8"))).toEqual({ v: 2 });
  });

  it("内容**变了**就得照常写，并且照样留 `.bak`（跳过写入不能跳过保护）", async () => {
    await writeSaveFile(root, UID, "profile", undefined, { v: 1 });
    await writeSaveFile(root, UID, "profile", undefined, { v: 2 });
    const full = path.resolve(root, "saves", UID, "profile.json");

    await writeSaveFile(root, UID, "profile", undefined, { v: 3 });

    expect(JSON.parse(await fs.readFile(full, "utf8"))).toEqual({ v: 3 });
    expect(await fs.readFile(`${full}.bak`, "utf8")).toContain('"v": 2');
  });

  it("删除是显式动作：.json 与 .bak 一起清掉，不留「删了还在」的副本", async () => {
    await writeSaveFile(root, UID, "resume", "r1", { id: "r1", title: "旧" });
    await writeSaveFile(root, UID, "resume", "r1", { id: "r1", title: "新" });
    await removeSaveFile(root, UID, "resume", "r1");

    await expect(fs.access(path.join(root, "saves", UID, "resumes", "r1.json"))).rejects.toThrow();
    await expect(fs.access(bakOf(UID, "resumes/r1.json"))).rejects.toThrow();
  });

  it("removeUserDir 一把带走，包括所有 .bak", async () => {
    await writeSaveFile(root, UID, "profile", undefined, { basic: { name: "一" } });
    await writeSaveFile(root, UID, "profile", undefined, { basic: { name: "二" } });
    await removeUserDir(root, UID);
    expect(await listUserIds(root)).toEqual([]);
  });
});

describe("端点开关", () => {
  const original = process.env.SAVES_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.SAVES_ENABLED;
    else process.env.SAVES_ENABLED = original;
  });

  it("只认 \"1\" —— 没设、空串、\"true\"、\"0\" 都算关", () => {
    for (const v of [undefined, "", "true", "0", "yes"]) {
      if (v === undefined) delete process.env.SAVES_ENABLED;
      else process.env.SAVES_ENABLED = v;
      expect(savesEnabled()).toBe(false);
    }
    process.env.SAVES_ENABLED = "1";
    expect(savesEnabled()).toBe(true);
  });
});

describe("同步基线", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "joblume-saves-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("没有基线文件 → 空基线（还没写过盘，或是从没有基线的版本升上来的目录）", async () => {
    expect(await readBaseline(root, UID)).toEqual({
      schemaVersion: SAVES_SCHEMA_VERSION,
      records: {},
    });
  });

  it("写进去再读回来，版本被规整成当前版本", async () => {
    await writeBaseline(root, UID, { schemaVersion: 1, records: { profile: "abc" } });
    expect(await readBaseline(root, UID)).toEqual({
      schemaVersion: SAVES_SCHEMA_VERSION,
      records: { profile: "abc" },
    });
  });

  it("记录键的形状：profile 无 id，其余带 kind 前缀", () => {
    expect(recordKey("profile")).toBe("profile");
    expect(recordKey("resume", "r1")).toBe("resume:r1");
    expect(recordKey("jd", "t1")).toBe("jd:t1");
  });

  it("基线不是合法 JSON → 抛错", async () => {
    const full = baselinePath(root, UID);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, "{ 不是 JSON", "utf8");
    await expect(readBaseline(root, UID)).rejects.toThrow(/不是合法 JSON/);
  });

  it("**版本比本程序新 → 抛错**（拒绝读写，而不是猜着读）", async () => {
    const full = baselinePath(root, UID);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(
      full,
      JSON.stringify({ schemaVersion: SAVES_SCHEMA_VERSION + 1, records: {} }),
      "utf8"
    );
    await expect(readBaseline(root, UID)).rejects.toThrow(/高于本程序支持/);
  });

  /**
   * 这条钉的是「错误分类」：路由按 `[saves]` 前缀把错误分成调用方的错（400）与
   * 环境的错（500）。基线坏了属于**服务端自己的状态问题**，带上那个前缀会让它被
   * 报成 400，把排查方向指错 —— 所以断言里必须没有它。
   */
  it("基线的错误消息**不带 `[saves]` 前缀**（否则会被路由报成 400）", async () => {
    const full = baselinePath(root, UID);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, "{}", "utf8");

    // 捕获而不是 `.rejects`：这里要断言的是消息**内容**，不只是「抛了」
    let message = "";
    try {
      await readBaseline(root, UID);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/schemaVersion/);
    expect(message).not.toContain("[saves]");
  });

  it("**基线文件本身不被当成一份存档**", async () => {
    await writeBaseline(root, UID, emptyBaseline());

    expect(await listSaveIds(root, UID, "resume")).toEqual([]);
    expect(await listSaveIds(root, UID, "jd")).toEqual([]);
    expect(await readSaveTree(root, UID)).toEqual({
      profile: null,
      resumes: {},
      targets: {},
      // 基线跟着数据一起回传：客户端靠它算「哪些改动还没落盘」
      baseline: { schemaVersion: SAVES_SCHEMA_VERSION, records: {} },
      problems: [],
    });
    // 但目录本身仍然是一个用户 —— 它出现在磁盘上了
    expect(await listUserIds(root)).toEqual([UID]);
  });
});

describe("批量 op", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "joblume-saves-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("一次写多条：逐条给结果，基线记住它们", async () => {
    const { results, baseline } = await applySaveOps(root, UID, [
      { op: "write", kind: "profile", data: { basic: { name: "甲" } } },
      { op: "write", kind: "resume", id: "r1", data: { id: "r1" } },
      { op: "write", kind: "jd", id: "t1", data: { id: "t1" } },
    ]);

    expect(results.map((r) => [r.key, r.ok])).toEqual([
      ["profile", true],
      ["resume:r1", true],
      ["jd:t1", true],
    ]);
    expect(Object.keys(baseline.records).sort()).toEqual(["jd:t1", "profile", "resume:r1"]);
    expect(await readBaseline(root, UID)).toEqual(baseline);
    expect(await readSaveFile(root, UID, "resume", "r1")).toEqual({ id: "r1" });
  });

  /**
   * 往返不变量：客户端会拿「从磁盘读回来的内容」重算哈希与基线比。如果这两者
   * 算不出同一个值，客户端会永远判脏、永远在同步。
   */
  it("**回传的哈希 == 从磁盘读回来的内容算出的哈希**", async () => {
    const data = {
      id: "r1",
      z: 1,
      nested: { b: [1, 2, undefined], c: null },
      at: "2026-09-20T00:00:00.000Z",
    };
    const { results } = await applySaveOps(root, UID, [
      { op: "write", kind: "resume", id: "r1", data },
    ]);

    const onDisk = await readSaveFile(root, UID, "resume", "r1");
    expect(await contentHash(onDisk)).toBe(results[0].hash);
  });

  it("删除：内容文件、`.bak`、基线条目一起消失", async () => {
    await applySaveOps(root, UID, [
      { op: "write", kind: "resume", id: "r1", data: { id: "r1", v: 1 } },
    ]);
    // 再写一次制造 .bak
    await applySaveOps(root, UID, [
      { op: "write", kind: "resume", id: "r1", data: { id: "r1", v: 2 } },
    ]);
    const full = path.resolve(root, "saves", UID, "resumes", "r1.json");
    expect(await fs.readFile(`${full}.bak`, "utf8")).toContain('"v": 1');

    const { results, baseline } = await applySaveOps(root, UID, [
      { op: "delete", kind: "resume", id: "r1" },
    ]);

    expect(results[0]).toEqual({ key: "resume:r1", ok: true });
    expect(baseline.records["resume:r1"]).toBeUndefined();
    expect(await readSaveFile(root, UID, "resume", "r1")).toBeNull();
    await expect(fs.access(`${full}.bak`)).rejects.toThrow();
  });

  it("部分失败：坏的那条只影响自己，好的照常落盘，基线不记失败那条", async () => {
    const { results, baseline } = await applySaveOps(root, UID, [
      // profile 不接受 id —— 这条必定失败
      { op: "write", kind: "profile", id: "r1", data: { basic: { name: "甲" } } },
      { op: "write", kind: "resume", id: "r1", data: { id: "r1" } },
    ]);

    expect(results[0].ok).toBe(false);
    expect(results[0].error).toMatch(/^\[saves\]/);
    expect(results[1].ok).toBe(true);

    // 好的那条真的落盘了，且被记进基线
    expect(await readSaveFile(root, UID, "resume", "r1")).toEqual({ id: "r1" });
    expect(Object.keys(baseline.records)).toEqual(["resume:r1"]);
    // 失败的 profile 没有被写出去
    expect(await readSaveFile(root, UID, "profile")).toBeNull();
  });

  it("整批都失败 → 仍然回结果，但**不写基线**", async () => {
    const { results, baseline } = await applySaveOps(root, UID, [
      { op: "write", kind: "profile", id: "x", data: {} },
    ]);

    expect(results[0].ok).toBe(false);
    expect(baseline.records).toEqual({});
    // 磁盘上不该凭空出现一个基线文件
    await expect(fs.access(baselinePath(root, UID))).rejects.toThrow();
  });

  it("先写后删同一批：以最后一个 op 为准", async () => {
    const { results, baseline } = await applySaveOps(root, UID, [
      { op: "write", kind: "jd", id: "t1", data: { id: "t1" } },
      { op: "delete", kind: "jd", id: "t1" },
    ]);

    expect(results.map((r) => r.ok)).toEqual([true, true]);
    expect(baseline.records["jd:t1"]).toBeUndefined();
    expect(await readSaveFile(root, UID, "jd", "t1")).toBeNull();
  });

  it("userId 非法 → 整批拒绝（不逐条失败）", async () => {
    await expect(
      applySaveOps(root, "../etc", [{ op: "write", kind: "profile", data: {} }])
    ).rejects.toThrow(/^\[saves\]/);
  });

  it("删除不存在的条目也算成功（幂等）", async () => {
    const { results } = await applySaveOps(root, UID, [
      { op: "delete", kind: "resume", id: "nope" },
    ]);
    expect(results[0]).toEqual({ key: "resume:nope", ok: true });
  });

  /**
   * 这一条对应一次**真实事故**：旧客户端每个文件发一个请求，首屏全量同步时 N 个
   * 请求同时到同一个用户。没有串行化时，N 个请求各自「读基线 → 改 → 写回」，
   * 结果是丢更新 + 两次 `writeFile` 交错把基线写坏（真实用户目录里出现过合法 JSON
   * 后面跟着一段哈希碎片的文件，那个用户从此每次写盘都 500）。
   */
  it("并发写同一个用户：基线不丢条目、也不损坏", async () => {
    const ops = Array.from({ length: 8 }, (_, i) => ({
      op: "write" as const,
      kind: "resume" as const,
      id: `r${i}`,
      data: { id: `r${i}` },
    }));

    // 完全并发，不 await 中间结果
    await Promise.all(ops.map((op) => applySaveOps(root, UID, [op])));

    // 文件坏了的话 readBaseline 会抛错 —— 这一步本身就是断言
    const baseline = await readBaseline(root, UID);
    expect(Object.keys(baseline.records).sort()).toEqual(ops.map((o) => `resume:${o.id}`).sort());

    for (const op of ops) {
      expect(await readSaveFile(root, UID, "resume", op.id)).toEqual({ id: op.id });
    }
  });

  it("写盘不留 .tmp（rename 之后临时文件不该还在）", async () => {
    await applySaveOps(root, UID, [
      { op: "write", kind: "profile", data: { a: 1 } },
      { op: "write", kind: "resume", id: "r1", data: { id: "r1" } },
    ]);

    const userDir = path.resolve(root, "saves", UID);
    expect((await fs.readdir(userDir)).filter((n) => n.endsWith(".tmp"))).toEqual([]);
    expect((await fs.readdir(path.join(userDir, "resumes"))).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("isSaveOp 拒绝形状不对的条目", () => {
    expect(isSaveOp({ op: "write", kind: "resume", id: "r1", data: {} })).toBe(true);
    expect(isSaveOp({ op: "delete", kind: "resume", id: "r1" })).toBe(true);
    // 写却没带 data
    expect(isSaveOp({ op: "write", kind: "resume", id: "r1" })).toBe(false);
    // 未知 kind / 未知 op / id 类型不对 / 不是对象
    expect(isSaveOp({ op: "write", kind: "nope", data: {} })).toBe(false);
    expect(isSaveOp({ op: "drop", kind: "resume" })).toBe(false);
    expect(isSaveOp({ op: "delete", kind: "resume", id: 42 })).toBe(false);
    expect(isSaveOp(null)).toBe(false);
  });
});
