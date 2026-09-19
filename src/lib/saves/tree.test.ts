import { describe, expect, it } from "vitest";
import { isEmptySnapshot, parseSaveTreeResponse } from "./tree";
import type { CareerProfile } from "@/types/profile";
import type { ResumeData } from "@/types/resume";
import type { JobTarget } from "@/types/jobTarget";

const profile = (name: string) => ({ basic: { name }, entities: {} } as unknown as CareerProfile);
const resume = (id: string) => ({ id, title: id } as unknown as ResumeData);
const target = (id: string) =>
  ({ id, company: id, matchAnalysis: null, analysisCache: null } as unknown as JobTarget);

const response = (users: Record<string, unknown>, root = "/repo/saves") => ({
  ok: true,
  root,
  users,
});

describe("解析 GET /api/saves 的响应", () => {
  it("正常一棵树：每个用户一份快照", () => {
    const out = parseSaveTreeResponse(
      response({
        ua: { profile: profile("甲"), resumes: { r1: resume("r1") }, targets: { t1: target("t1") }, problems: [] },
        ub: { profile: profile("乙"), resumes: {}, targets: {}, problems: [] },
      })
    );

    expect(Object.keys(out.users).sort()).toEqual(["ua", "ub"]);
    expect(out.users.ua.snapshot.profile?.basic.name).toBe("甲");
    expect(Object.keys(out.users.ua.snapshot.resumes)).toEqual(["r1"]);
    expect(Object.keys(out.users.ua.snapshot.targets)).toEqual(["t1"]);
    expect(out.root).toBe("/repo/saves");
  });

  it("空存档：没有用户，root 仍然带回来（界面要显示数据存在哪）", () => {
    expect(parseSaveTreeResponse(response({}))).toEqual({ root: "/repo/saves", users: {} });
  });

  it("**形状不对的条目被丢掉，但要出现在 problems 里** —— 静默丢弃等于数据凭空消失", () => {
    const out = parseSaveTreeResponse(
      response({
        ua: {
          profile: profile("甲"),
          resumes: { r1: resume("r1"), bad: 42, alsoBad: { title: "没有 id" } },
          targets: { t1: target("t1"), badJd: "不是对象" },
          problems: [],
        },
      })
    );

    expect(Object.keys(out.users.ua.snapshot.resumes)).toEqual(["r1"]);
    expect(Object.keys(out.users.ua.snapshot.targets)).toEqual(["t1"]);
    expect(out.users.ua.problems).toEqual(["jd:badJd", "resume:alsoBad", "resume:bad"]);
  });

  it("档案坏了 → profile 为 null 且记进 problems", () => {
    const out = parseSaveTreeResponse(response({ ua: { profile: { 没有basic: true }, resumes: {}, targets: {} } }));
    expect(out.users.ua.snapshot.profile).toBeNull();
    expect(out.users.ua.problems).toContain("profile");
  });

  it("档案本来就是 null（新用户）不算 problem", () => {
    const out = parseSaveTreeResponse(response({ ua: { profile: null, resumes: {}, targets: {} } }));
    expect(out.users.ua.snapshot.profile).toBeNull();
    expect(out.users.ua.problems).toEqual([]);
  });

  it("服务端报的 problems 原样带过来，并和客户端发现的一起排序", () => {
    const out = parseSaveTreeResponse(
      response({ ua: { profile: null, resumes: { zz: 1 }, targets: {}, problems: ["resume:aa"] } })
    );
    expect(out.users.ua.problems).toEqual(["resume:aa", "resume:zz"]);
  });

  it("整份响应不成形状（404 的 JSON、网络中间层塞的东西）→ 空树，不抛", () => {
    for (const bad of [null, undefined, "字符串", 42, {}, { ok: false }, { ok: true, users: "不是对象" }]) {
      expect(parseSaveTreeResponse(bad)).toEqual({ root: "", users: {} });
    }
  });

  it("用户值是坏形状的直接跳过那一个用户，不连累别人", () => {
    const out = parseSaveTreeResponse(response({ ua: "坏了", ub: { profile: null, resumes: {}, targets: {} } }));
    expect(Object.keys(out.users)).toEqual(["ub"]);
  });

  it("缺 kind 字段时给空表，不是 undefined", () => {
    const out = parseSaveTreeResponse(response({ ua: { profile: null } }));
    expect(out.users.ua.snapshot.resumes).toEqual({});
    expect(out.users.ua.snapshot.targets).toEqual({});
  });
});

describe("isEmptySnapshot", () => {
  it("三样都空才算空", () => {
    expect(isEmptySnapshot({ profile: null, resumes: {}, targets: {} })).toBe(true);
    expect(isEmptySnapshot({ profile: profile("甲"), resumes: {}, targets: {} })).toBe(false);
    expect(isEmptySnapshot({ profile: null, resumes: { r1: resume("r1") }, targets: {} })).toBe(false);
    expect(isEmptySnapshot({ profile: null, resumes: {}, targets: { t1: target("t1") } })).toBe(false);
  });
});
