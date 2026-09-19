import { describe, expect, it } from "vitest";
import {
  EMPTY_SNAPSHOT,
  diffSnapshot,
  mergePending,
  mirrorKey,
  type MirrorOp,
  type UserSnapshot,
} from "./mirror";
import type { CareerProfile } from "@/types/profile";
import type { ResumeData } from "@/types/resume";
import type { JobTarget } from "@/types/jobTarget";

const profile = (name: string) => ({ basic: { name } } as unknown as CareerProfile);
const resume = (id: string) => ({ id, title: id } as unknown as ResumeData);
const target = (id: string) => ({ id, company: id } as unknown as JobTarget);

const snap = (over: Partial<UserSnapshot> = {}): UserSnapshot => ({
  ...EMPTY_SNAPSHOT,
  ...over,
});

/** 把 op 压成好读的字符串，断言起来比逐个字段比更清楚 */
const shape = (ops: MirrorOp[]) =>
  ops.map((o) => `${o.op} ${o.kind}${o.id ? ` ${o.id}` : ""}`);

describe("镜像差分", () => {
  it("首次同步：三个切片里的东西全部要写出去", () => {
    const ops = diffSnapshot(
      EMPTY_SNAPSHOT,
      snap({ profile: profile("甲"), resumes: { r1: resume("r1") }, targets: { t1: target("t1") } })
    );
    expect(shape(ops)).toEqual(["write profile", "write resume r1", "write jd t1"]);
  });

  it("引用没变 → 一个 op 都不产生（这是「只同步变动的文件」的根据）", () => {
    const s = snap({ profile: profile("甲"), resumes: { r1: resume("r1") }, targets: { t1: target("t1") } });
    expect(diffSnapshot(s, s)).toEqual([]);
  });

  it("改了一条简历 → 只写那一条，别的连碰都不碰", () => {
    const r1 = resume("r1");
    const r2 = resume("r2");
    const prev = snap({ profile: profile("甲"), resumes: { r1, r2 } });
    // store 的写法：变动的那条换新对象，其余保持同一个引用
    const next = snap({ profile: prev.profile, resumes: { r1, r2: { ...r2, title: "改过" } } });

    const ops = diffSnapshot(prev, next);
    expect(shape(ops)).toEqual(["write resume r2"]);
    expect((ops[0] as { data: unknown }).data).toBe(next.resumes.r2);
  });

  it("删掉一条简历 → 出一条 delete，磁盘上的旧文件才会跟着消失", () => {
    const prev = snap({ resumes: { r1: resume("r1"), r2: resume("r2") } });
    const next = snap({ resumes: { r1: prev.resumes.r1 } });

    expect(shape(diffSnapshot(prev, next))).toEqual(["delete resume r2"]);
  });

  it("档案被清空（换用户 / 删用户）→ delete profile，而不是写一个 null 进去", () => {
    const prev = snap({ profile: profile("甲") });
    expect(shape(diffSnapshot(prev, snap({ profile: null })))).toEqual(["delete profile"]);
  });

  it("三类互不干扰：改简历不会顺手重写档案与岗位", () => {
    const p = profile("甲");
    const t1 = target("t1");
    const prev = snap({ profile: p, resumes: { r1: resume("r1") }, targets: { t1 } });
    const next = snap({ profile: p, resumes: { r1: { ...prev.resumes.r1, title: "改了" } }, targets: { t1 } });

    expect(shape(diffSnapshot(prev, next))).toEqual(["write resume r1"]);
  });

  it("岗位走 jd 这个 kind（目录是 jds/）", () => {
    const ops = diffSnapshot(EMPTY_SNAPSHOT, snap({ targets: { t1: target("t1") } }));
    expect(ops[0]).toMatchObject({ op: "write", kind: "jd", id: "t1" });
  });

  it("同一个用户的整套数据换掉：新增的写、消失的删，一次算清", () => {
    const prev = snap({ resumes: { r1: resume("r1"), r2: resume("r2") } });
    const next = snap({ resumes: { r2: prev.resumes.r2, r3: resume("r3") } });

    expect(shape(diffSnapshot(prev, next)).sort()).toEqual(["delete resume r1", "write resume r3"]);
  });
});

describe("攒批去重", () => {
  it("同一个文件在防抖窗口里改多次，只留最后那一次", () => {
    const pending = mergePending(new Map(), [
      { op: "write", kind: "resume", id: "r1", data: resume("v1") },
    ]);
    const merged = mergePending(pending, [
      { op: "write", kind: "resume", id: "r1", data: resume("v2") },
      { op: "write", kind: "resume", id: "r2", data: resume("r2") },
    ]);

    expect(merged.size).toBe(2);
    expect(merged.get("resume:r1")).toMatchObject({ data: { title: "v2" } });
  });

  it("先写后删（新建又删掉）→ 最终只剩 delete，不会白写一次", () => {
    const pending = mergePending(new Map(), [
      { op: "write", kind: "jd", id: "t1", data: target("t1") },
    ]);
    const merged = mergePending(pending, [{ op: "delete", kind: "jd", id: "t1" }]);

    expect(merged.size).toBe(1);
    expect(merged.get("jd:t1")?.op).toBe("delete");
  });

  it("key 把 profile 与带 id 的条目分开，不会互相顶掉", () => {
    expect(mirrorKey({ op: "write", kind: "profile", data: null })).toBe("profile:");
    expect(mirrorKey({ op: "delete", kind: "resume", id: "r1" })).toBe("resume:r1");
  });
});
