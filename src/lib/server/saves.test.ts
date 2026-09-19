import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  isSafeSegment,
  listSaveIds,
  listUserIds,
  readSaveFile,
  readSaveTree,
  removeUserDir,
  resolveSavePath,
  savesEnabled,
} from "./saves";

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
