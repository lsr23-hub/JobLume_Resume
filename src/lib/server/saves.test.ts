import { describe, expect, it } from "vitest";
import path from "node:path";
import { isSafeSegment, resolveSavePath } from "./saves";

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
