import { describe, expect, it } from "vitest";
import type { ResumeData } from "@/types/resume";
import { BACKUP_APP_ID, buildBackup, buildProfileArchive, estimateBackupSize, mergeById, ownerSlug, parseBackup, parseProfileArchive, stripResumeCredentials, summarizeBackup, type BackupPayload } from "./backup";

const NOW = "2026-01-01T00:00:00.000Z";

const makePayload = (over: Partial<BackupPayload> = {}): BackupPayload => ({
  app: BACKUP_APP_ID,
  version: 1,
  exportedAt: NOW,
  profile: null,
  resumes: [],
  targets: [],
  ...over,
});

describe("buildBackup", () => {
  it("把 Record 形式的集合转为数组", () => {
    const payload = buildBackup({
      profile: null,
      resumes: { r1: { id: "r1", title: "A" } as never, r2: { id: "r2", title: "B" } as never },
      targets: { t1: { id: "t1", company: "X" } as never },
      now: NOW,
    });

    expect(payload.app).toBe(BACKUP_APP_ID);
    expect(payload.exportedAt).toBe(NOW);
    expect(payload.resumes.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
    expect(payload.targets.map((t) => t.id)).toEqual(["t1"]);
  });
});

describe("stripResumeCredentials", () => {
  const withToken = (over: Record<string, unknown> = {}) =>
    ({
      id: "r1",
      title: "简历",
      basic: {
        name: "张三",
        githubKey: "ghp_secret",
        githubUseName: "zhangsan",
        githubContributionsVisible: true,
      },
      ...over,
    }) as unknown as ResumeData;

  it("摘掉 GitHub token", () => {
    expect(stripResumeCredentials(withToken()).basic.githubKey).toBe("");
  });

  it("同组件的其它字段原样保留 —— 摘多了会让贡献图配置一起丢", () => {
    const out = stripResumeCredentials(withToken());
    expect(out.basic.name).toBe("张三");
    expect(out.basic.githubUseName).toBe("zhangsan");
    expect(out.basic.githubContributionsVisible).toBe(true);
  });

  it("不改原对象（导出是只读操作，不能顺手改掉 store 里的数据）", () => {
    const original = withToken();
    stripResumeCredentials(original);
    expect(original.basic.githubKey).toBe("ghp_secret");
  });

  it("简历的其它部分不被动到", () => {
    const out = stripResumeCredentials(withToken({ title: "我的简历" }));
    expect(out.title).toBe("我的简历");
    expect(out.id).toBe("r1");
  });
});

describe("buildBackup 摘凭据", () => {
  it("备份里的简历也不带 token —— 备份文件同样会被下载与云同步", () => {
    const payload = buildBackup({
      profile: null,
      resumes: {
        r1: {
          id: "r1",
          title: "A",
          basic: { githubKey: "ghp_secret", name: "张三" },
        } as unknown as ResumeData,
      },
      targets: {},
      now: NOW,
    });

    expect(payload.resumes[0].basic.githubKey).toBe("");
    expect(payload.resumes[0].basic.name).toBe("张三");
  });

  it("存档镜像那条路径不受影响 —— 摘了会让贡献日历当场失效", async () => {
    // 防回归：stripResumeCredentials 只该用在导出路径。
    // 存档镜像走的是 lib/saves/mirror.ts 的 diffSnapshot，不经过 buildBackup。
    const mirror = await import("./saves/mirror");
    const snapshot = { profile: null, resumes: { r1: { id: "r1", basic: { githubKey: "ghp_secret" } } }, targets: {} };
    const ops = mirror.diffSnapshot(mirror.EMPTY_SNAPSHOT, snapshot as never);
    const written = ops.find((o) => o.kind === "resume");
    expect(written).toBeDefined();
    expect((written as never as { data: { basic: { githubKey: string } } }).data.basic.githubKey).toBe("ghp_secret");
  });
});

describe("parseBackup", () => {
  const valid = JSON.stringify(makePayload());

  it("解析合法备份", () => {
    const result = parseBackup(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.version).toBe(1);
  });

  it("拒绝非法 JSON", () => {
    const r = parseBackup("{ 不是 json");
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain("JSON");
  });

  it("拒绝非本工具的备份", () => {
    const r = parseBackup(JSON.stringify({ app: "other-tool", version: 1, resumes: [], targets: [] }));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain("本工具");
  });

  it("拒绝更高版本的备份 —— 避免用旧结构覆盖新数据", () => {
    const r = parseBackup(JSON.stringify(makePayload({ version: 99 })));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain("版本");
  });

  it("拒绝缺少集合的备份", () => {
    const r = parseBackup(JSON.stringify({ app: BACKUP_APP_ID, version: 1 }));
    expect(r).toMatchObject({ ok: false });
  });

  it("接受 profile 为 null（只备份过简历的情况）", () => {
    const r = parseBackup(JSON.stringify(makePayload({ profile: null })));
    expect(r.ok).toBe(true);
  });

  it("profile 不是对象时拒绝", () => {
    const r = parseBackup(JSON.stringify({ ...makePayload(), profile: "字符串" }));
    expect(r).toMatchObject({ ok: false });
  });

  it("数组不是数组时拒绝", () => {
    const r = parseBackup(JSON.stringify({ ...makePayload(), resumes: {} }));
    expect(r).toMatchObject({ ok: false });
  });

  it("缺失 exportedAt 时给出空串而非 undefined", () => {
    const r = parseBackup(JSON.stringify({ app: BACKUP_APP_ID, version: 1, resumes: [], targets: [] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.exportedAt).toBe("");
  });
});

describe("mergeById", () => {
  it("只收下 id 不冲突的条目", () => {
    const existing = { a: { id: "a", v: 1 } };
    const incoming = [{ id: "a", v: 999 }, { id: "b", v: 2 }, { id: "c", v: 3 }];

    const result = mergeById(existing, incoming);
    expect(result.added).toBe(2);
    expect(result.skipped).toBe(1);
    expect(Object.keys(result.merged).sort()).toEqual(["a", "b", "c"]);
    // 已存在的条目不被覆盖
    expect(result.merged.a.v).toBe(1);
  });

  it("全冲突时一个也不加", () => {
    const r = mergeById({ a: { id: "a" } }, [{ id: "a" }]);
    expect(r).toMatchObject({ added: 0, skipped: 1 });
  });

  it("空输入不崩溃", () => {
    expect(mergeById({}, [])).toMatchObject({ added: 0, skipped: 0 });
  });

  it("跳过缺少 id 的脏数据", () => {
    const r = mergeById({}, [{ id: "" }, { id: "ok" }] as Array<{ id: string }>);
    expect(r).toMatchObject({ added: 1, skipped: 1 });
  });
});

describe("summarizeBackup", () => {
  it("统计各集合数量", () => {
    const s = summarizeBackup(
      makePayload({
        profile: { entities: { e1: {}, e2: {} } } as never,
        resumes: [{ id: "r1" } as never],
        targets: [{ id: "t1" } as never, { id: "t2" } as never],
      })
    );

    expect(s).toMatchObject({ hasProfile: true, entityCount: 2, resumeCount: 1, targetCount: 2 });
  });

  it("无 profile 时 entityCount 为 0", () => {
    expect(summarizeBackup(makePayload()).entityCount).toBe(0);
  });
});

describe("estimateBackupSize", () => {
  it("返回字节数", () => {
    expect(estimateBackupSize(makePayload())).toBeGreaterThan(0);
  });
});

describe("备份的归属标记", () => {
  const profile = {
    version: 1,
    basic: { name: "甲同学" },
    entities: { e1: {} },
    meta: { createdAt: "t", updatedAt: "t", lastBackupAt: null },
  } as never;

  it("姓名同时写进文件内容与文件名", () => {
    const payload = buildBackup({
      profile,
      resumes: {},
      targets: {},
      now: "2026-09-19T00:00:00.000Z",
      ownerName: "甲同学",
    });
    expect(payload.profileOwner).toBe("甲同学");
    expect(summarizeBackup(payload).ownerName).toBe("甲同学");
  });

  it("没传姓名时不写这个字段（老备份就是这种，必须继续能读）", () => {
    const payload = buildBackup({ profile, resumes: {}, targets: {}, now: "t" });
    expect(payload.profileOwner).toBeUndefined();
    expect(summarizeBackup(payload).ownerName).toBeUndefined();
  });

  it("profile 档案格式同样带上，且能读回来", () => {
    const archive = buildProfileArchive(profile, "t", "甲同学");
    expect(archive.profileOwner).toBe("甲同学");
    const parsed = parseProfileArchive(JSON.stringify(archive));
    expect(parsed.ok && parsed.ownerName).toBe("甲同学");
  });

  it("老文件没有 profileOwner 时解析不报错", () => {
    const parsed = parseProfileArchive(
      JSON.stringify({ app: BACKUP_APP_ID, kind: "profile", version: 1, exportedAt: "t", profile })
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.ownerName).toBeUndefined();
  });

  it("文件名 slug 去掉路径分隔符等非法字符，中文原样保留", () => {
    expect(ownerSlug("甲同学")).toBe("甲同学");
    expect(ownerSlug("Zhang San")).toBe("ZhangSan");
    expect(ownerSlug("a/b:c*d?e")).toBe("abcde");
    expect(ownerSlug("")).toBe("unnamed");
    expect(ownerSlug(undefined)).toBe("unnamed");
    expect(ownerSlug("很长".repeat(20)).length).toBe(16);
  });
});
