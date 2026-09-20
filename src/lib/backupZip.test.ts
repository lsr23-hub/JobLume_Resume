import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { BACKUP_APP_ID, BACKUP_VERSION, type BackupPayload } from "./backup";
import { BACKUP_JSON, MANIFEST_JSON, buildBackupZip, parseBackupZip } from "./backupZip";

const payload = (over: Partial<BackupPayload> = {}): BackupPayload => ({
  app: BACKUP_APP_ID,
  version: BACKUP_VERSION,
  exportedAt: "2026-09-20T00:00:00.000Z",
  profile: null,
  resumes: [],
  targets: [],
  ...over,
});

const bytes = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, n]);

describe("全库备份打包成 zip", () => {
  it("打包再解开，数据与图片原样回来（往返）", () => {
    const data = payload({
      profile: { version: 1, basic: { name: "甲", photo: "img_p.jpg" } } as never,
      resumes: [{ id: "r1", basic: { photo: "img_r.png" } } as never],
    });
    const images = { "img_p.jpg": bytes(1), "img_r.png": bytes(2) };

    const { bytes: zipped, manifest } = buildBackupZip({ payload: data, images });
    const parsed = parseBackupZip(zipped);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.payload).toEqual(data);
    expect(Object.keys(parsed.images).sort()).toEqual(["img_p.jpg", "img_r.png"]);
    expect(Array.from(parsed.images["img_p.jpg"])).toEqual([0xff, 0xd8, 0xff, 1]);
    expect(manifest).toEqual({
      app: BACKUP_APP_ID,
      kind: "zip",
      version: BACKUP_VERSION,
      exportedAt: data.exportedAt,
      counts: { resumes: 1, targets: 0, images: 2 },
    });
  });

  it("zip 里有那三个位置（人要能打开看）", () => {
    const { bytes: zipped } = buildBackupZip({
      payload: payload(),
      images: { "img_a.jpg": bytes(1) },
    });
    const { unzipSync } = require("fflate") as typeof import("fflate");
    // 注意按字母序写：收到的那边 .sort() 过，而 toEqual 会比较数组顺序
    expect(Object.keys(unzipSync(zipped)).sort()).toEqual([
      BACKUP_JSON,
      "images/img_a.jpg",
      MANIFEST_JSON,
    ]);
  });

  it("**名字不合法的图片不装**（一个被改过的调用方塞不进任意路径）", () => {
    const { bytes: zipped } = buildBackupZip({
      payload: payload(),
      images: {
        "img_ok.jpg": bytes(1),
        "../evil.jpg": bytes(2),
        "avatar.png": bytes(3),
        "img_bad.svg": bytes(4),
      },
    });
    const { unzipSync } = require("fflate") as typeof import("fflate");
    expect(Object.keys(unzipSync(zipped)).sort()).toEqual([
      BACKUP_JSON,
      "images/img_ok.jpg",
      MANIFEST_JSON,
    ]);
  });

  it("没有图片也能打包", () => {
    const { bytes: zipped, manifest } = buildBackupZip({ payload: payload(), images: {} });
    expect(manifest.counts.images).toBe(0);
    const parsed = parseBackupZip(zipped);
    expect(parsed.ok && Object.keys(parsed.images)).toEqual([]);
  });
});

describe("解开备份 zip", () => {
  it("不是 zip → 明确报错（不是抛异常）", () => {
    const parsed = parseBackupZip(strToU8("这不是 zip，只是一段文字"));
    expect(parsed).toEqual({ ok: false, error: "文件不是合法的 zip" });
  });

  it("zip 里没有 backup.json → 明确报错", () => {
    const zipped = zipSync({ "readme.txt": strToU8("hi") });
    expect(parseBackupZip(zipped)).toEqual({ ok: false, error: "zip 里没有 backup.json" });
  });

  it("backup.json 不是本工具的备份 → 复用 parseBackup 的判据", () => {
    const zipped = zipSync({ [BACKUP_JSON]: strToU8(JSON.stringify({ app: "别的工具" })) });
    const parsed = parseBackupZip(zipped);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/不是本工具/);
  });

  it("**版本比本程序新 → 拒绝**（复用 parseBackup 的判据）", () => {
    const zipped = zipSync({
      [BACKUP_JSON]: strToU8(JSON.stringify({ ...payload(), version: BACKUP_VERSION + 1 })),
    });
    const parsed = parseBackupZip(zipped);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/版本/);
  });

  it("**没在 images/ 下的图片不收**，名字不合法的也不收", () => {
    const zipped = zipSync({
      [BACKUP_JSON]: strToU8(JSON.stringify(payload())),
      "images/img_ok.jpg": bytes(1),
      "img_root.jpg": bytes(2),
      "images/notanimage.png": bytes(3),
      "images/img_bad.svg": bytes(4),
    });
    const parsed = parseBackupZip(zipped);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(Object.keys(parsed.images)).toEqual(["img_ok.jpg"]);
  });

  it("清单坏了不影响数据（它只是给人看的）", () => {
    const zipped = zipSync({
      [BACKUP_JSON]: strToU8(JSON.stringify(payload())),
      [MANIFEST_JSON]: strToU8("{ 不是 JSON"),
    });
    const parsed = parseBackupZip(zipped);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.manifest).toBeNull();
  });

  it("**没有清单也能解**（别人手工打的包、或删掉了清单）", () => {
    const zipped = zipSync({ [BACKUP_JSON]: strToU8(JSON.stringify(payload())) });
    const parsed = parseBackupZip(zipped);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.manifest).toBeNull();
  });
});
