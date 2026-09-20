import { describe, expect, it } from "vitest";
import { HASH_HEX_LENGTH, contentHash, stableStringify } from "./hash";

describe("stableStringify", () => {
  it("**键序不影响结果**：这正是它存在的理由", () => {
    const a = { name: "甲", age: 1, nested: { x: 1, y: 2 } };
    const b = { nested: { y: 2, x: 1 }, age: 1, name: "甲" };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("**数组顺序影响结果**：数组是有序的，排序会改变语义", () => {
    expect(stableStringify([1, 2, 3])).not.toBe(stableStringify([3, 2, 1]));
  });

  it("内容变了，结果就变", () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: "1" }));
    // 注意 `{ a: 1, b: undefined }` 与 `{ a: 1 }` **内容相同**（undefined 的键被丢掉，
    // 与 JSON.stringify 一致）—— 这是要的行为：JSON 往返一次不该被判成"变了"。
    // 所以这里用 null 来证明"多一个键就是不同内容"。
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 1, b: null }));
  });

  it("与 JSON.stringify 对齐：对象里 undefined 的键丢掉，数组里变成 null", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(JSON.stringify({ a: 1, b: undefined }));
    expect(stableStringify([1, undefined])).toBe(JSON.stringify([1, undefined]));
  });

  it("非有限数字与 JSON.stringify 一致（都变 null）", () => {
    expect(stableStringify({ a: NaN })).toBe(JSON.stringify({ a: NaN }));
    expect(stableStringify({ a: Infinity })).toBe(JSON.stringify({ a: Infinity }));
  });

  it("有 toJSON 的对象按 toJSON 走，不被当成空对象", () => {
    const date = new Date("2026-09-20T00:00:00.000Z");
    expect(stableStringify({ at: date })).toBe(JSON.stringify({ at: date }));
    expect(stableStringify({ at: date })).not.toBe('{"at":{}}');
  });

  it("标量与 null", () => {
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify("甲")).toBe('"甲"');
    expect(stableStringify(0)).toBe("0");
    expect(stableStringify(false)).toBe("false");
  });

  it("深层嵌套里也按键排序", () => {
    expect(stableStringify({ z: [{ b: 1, a: 2 }] })).toBe('{"z":[{"a":2,"b":1}]}');
  });
});

describe("contentHash", () => {
  it("同一个值两次哈希相同（确定）", async () => {
    const value = { id: "r1", basic: { name: "甲" }, list: [1, 2] };
    expect(await contentHash(value)).toBe(await contentHash(value));
  });

  it("键序不同但内容相同 → 哈希相同（否则手改文件会假冲突）", async () => {
    expect(await contentHash({ a: 1, b: 2 })).toBe(await contentHash({ b: 2, a: 1 }));
  });

  it("内容不同 → 哈希不同", async () => {
    expect(await contentHash({ a: 1 })).not.toBe(await contentHash({ a: 2 }));
  });

  it(`输出 ${HASH_HEX_LENGTH} 位小写 hex`, async () => {
    const hash = await contentHash({ a: 1 });
    expect(hash).toHaveLength(HASH_HEX_LENGTH);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("空对象与空数组各有自己的哈希（不会被混为一谈）", async () => {
    expect(await contentHash({})).not.toBe(await contentHash([]));
    expect(await contentHash({})).not.toBe(await contentHash(null));
  });
});
