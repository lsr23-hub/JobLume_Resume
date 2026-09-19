import { beforeEach, describe, expect, it, vi } from "vitest";

const { memory } = vi.hoisted(() => {
  const memory = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => void memory.set(k, v),
      removeItem: (k: string) => void memory.delete(k),
      key: (i: number) => Array.from(memory.keys())[i] ?? null,
      get length() {
        return memory.size;
      },
      clear: () => memory.clear(),
    },
  };
  return { memory };
});

import {
  JOURNAL_KEY_PREFIX,
  MAX_JOURNAL_BYTES,
  clearJournal,
  decodeJournal,
  journalKey,
  journalUserIds,
  readJournal,
  writeJournal,
} from "./journal";
import type { MirrorOp } from "./mirror";

const write = (id: string, data: unknown = { id }): MirrorOp => ({
  op: "write",
  kind: "resume",
  id,
  data,
});
const del = (id: string): MirrorOp => ({ op: "delete", kind: "resume", id });

const opsOf = (userId: string) => readJournal(userId);

describe("journal 编解码", () => {
  beforeEach(() => memory.clear());

  it("往返：写进去读出来是同几条", () => {
    expect(writeJournal("u1", [write("r1"), del("r2")])).toEqual({ persisted: true });
    expect(opsOf("u1")).toEqual([write("r1"), del("r2")]);
  });

  it("空列表也要能编解码（写完就清空的稳态）", () => {
    expect(decodeJournal("[]")).toEqual([]);
  });

  it("**坏 JSON 返回空数组而不是抛** —— 启动路径不该被一条坏日志卡住", () => {
    for (const bad of ["", "{", "null", "不是 JSON", '{"a":1}']) {
      expect(decodeJournal(bad)).toEqual([]);
    }
    expect(decodeJournal(null)).toEqual([]);
    expect(decodeJournal(undefined)).toEqual([]);
  });

  it("丢掉形状不对的条目，保住其余的", () => {
    const text = JSON.stringify([
      { op: "write", kind: "resume", id: "r1", data: { id: "r1" } },
      { op: "write", kind: "resume", id: "缺 data" },
      { op: "莫名其妙" },
      null,
      42,
      { op: "delete", kind: "jd", id: "t1" },
    ]);
    expect(decodeJournal(text)).toEqual([
      { op: "write", kind: "resume", id: "r1", data: { id: "r1" } },
      { op: "delete", kind: "jd", id: "t1" },
    ]);
  });

  it("delete 不需要 data，write 必须有 data（哪怕是 null 之外的值）", () => {
    expect(decodeJournal(JSON.stringify([{ op: "delete", kind: "resume", id: "r1" }]))).toHaveLength(1);
    expect(decodeJournal(JSON.stringify([{ op: "write", kind: "resume", id: "r1" }]))).toHaveLength(0);
  });

  it("超限时**不持久化**，而不是截断 —— 截出来的 op 不再是那条改动", () => {
    const huge = write("r1", { blob: "x".repeat(MAX_JOURNAL_BYTES) });
    expect(writeJournal("u1", [huge])).toEqual({ persisted: false, reason: "too-large" });
    expect(opsOf("u1")).toEqual([]);
  });

  it("配额满了也不抛，如实报告没存下", () => {
    const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(writeJournal("u1", [write("r1")])).toEqual({ persisted: false, reason: "quota" });
    spy.mockRestore();
  });

  it("clearJournal 之后读回空数组；清不存在的 key 也不抛", () => {
    writeJournal("u1", [write("r1")]);
    clearJournal("u1");
    expect(opsOf("u1")).toEqual([]);
    expect(() => clearJournal("nobody")).not.toThrow();
  });

  it("按用户分开，互不干扰", () => {
    writeJournal("u1", [write("r1")]);
    writeJournal("u2", [write("r2")]);
    expect(opsOf("u1")).toEqual([write("r1")]);
    expect(opsOf("u2")).toEqual([write("r2")]);
  });

  it("journalUserIds 列出还有未落盘改动的用户（供界面提示）", () => {
    writeJournal("u2", [write("r1")]);
    writeJournal("u1", [del("r1")]);
    expect(journalUserIds()).toEqual(["u1", "u2"]);
    expect(journalKey("u1")).toBe(`${JOURNAL_KEY_PREFIX}u1`);
  });
});
