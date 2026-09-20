import { contentHash } from "./hash";
import {
  emptyBaseline,
  parseBaseline,
  parseRecordKey,
  recordKey,
  type Baseline,
} from "./baseline";
import type { MirrorOp } from "./mirror";

/**
 * 「哪些改动还没落盘」—— 保存会话的**纯逻辑**部分。
 *
 * 判据是**内容哈希**，不是引用相等（那是旧的防抖镜像用的），也不是时间戳：
 *
 * - 引用相等只在一次会话内成立，刷新之后无从比较
 * - 时间戳不可靠（三个 store 的 `updatedAt` 都会被视图操作 bump，见
 *   `plan/saves-design.md` 的论证）
 * - 内容哈希是唯一能跨刷新、跨机器、跨"手改文件"都成立的判据
 *
 * 哈希由前后端**共用同一份实现**（`./hash`），而基线由服务端在写盘成功后回传 ——
 * 所以这里的比较是"客户端算的当前内容" vs "服务端上次写下去的内容"，两边同一个算法。
 */

/**
 * `collectDirty` 只要**能被哈希的东西** —— 它一个字段都不读。
 *
 * 所以这里刻意用宽松形状，而不是 `UserSnapshot`：调用方照样传 `UserSnapshot`
 * （结构兼容），而测试不必为了一份完整档案去凑二十个无关字段。这个签名同时把
 * 「本函数与数据形状无关」这件事写进了类型里。
 */
export interface SavableSnapshot {
  profile: unknown;
  resumes: Record<string, unknown>;
  targets: Record<string, unknown>;
}

/**
 * 算出这一轮该写哪些、该删哪些。
 *
 * **只算本地 → 磁盘这一个方向。** 反方向（磁盘上有、本地没有，要不要拉回来）属于
 * 启动对账，见 `plan/saves-design.md` §4 的 S4 —— 那一步要处理"两边都改了"的冲突，
 * 而这里只回答"我这边有什么没存"。
 *
 * 返回的是可以直接丢给批量端点 `POST /api/saves { ops }` 的形状。
 */
export const collectDirty = async (
  snapshot: SavableSnapshot,
  baseline: Baseline
): Promise<MirrorOp[]> => {
  const ops: MirrorOp[] = [];
  /** 本地有的键。用来区分「本地删掉了」与「基线里本来就没有」 */
  const localKeys = new Set<string>();

  const consider = async (
    kind: "profile" | "resume" | "jd",
    id: string | undefined,
    data: unknown
  ) => {
    const key = recordKey(kind, id);
    localKeys.add(key);
    // 与基线一致 → 这条已经落过盘了，不用再写。
    // 这一句是"点保存不该重写整棵树"的全部秘密
    if ((await contentHash(data)) === baseline.records[key]) return;
    ops.push({ op: "write", kind, id, data });
  };

  if (snapshot.profile) await consider("profile", undefined, snapshot.profile);
  for (const [id, data] of Object.entries(snapshot.resumes)) await consider("resume", id, data);
  for (const [id, data] of Object.entries(snapshot.targets)) await consider("jd", id, data);

  // 基线里有、本地没有 → 用户在本地删掉了它，磁盘上那份也得跟着消失。
  // 认不出的键跳过：基线文件是可以被手改的，凭它拼路径等于凭手改的内容去删文件。
  for (const key of Object.keys(baseline.records)) {
    if (localKeys.has(key)) continue;
    const parsed = parseRecordKey(key);
    if (!parsed) continue;
    ops.push({ op: "delete", kind: parsed.kind, id: parsed.id });
  }

  return ops;
};

// ─────────────────────────── 会话状态 ───────────────────────────

/**
 * 磁盘存档可不可用。
 *
 * - `loading`：还没问到（首屏那一瞬间）
 * - `ready`：拿到了基线，可以正常判断「哪些改动没落盘」
 * - `local-only`：问不到（静态部署没有这个端点、服务端挂了）——
 *   此时**不显示"未保存"**：没有地方可保存，"未保存"就是个没有意义的数字
 */
export type SessionPhase = "loading" | "ready" | "local-only";

export interface SessionState {
  phase: SessionPhase;
  /** 还没落盘的条目（点保存时提交的就是它们） */
  dirtyOps: MirrorOp[];
  saving: boolean;
  lastSavedAt: number | null;
  error: string | null;
}

const INITIAL_SESSION: SessionState = {
  phase: "loading",
  dirtyOps: [],
  saving: false,
  lastSavedAt: null,
  error: null,
};

let state: SessionState = INITIAL_SESSION;
const listeners = new Set<() => void>();

export const getSession = (): SessionState => state;

export const subscribeSession = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 逐字段比较 —— `useSyncExternalStore` 要求引用稳定，见 `syncStatus` 那套的同一个理由 */
const sameSession = (a: SessionState, b: SessionState): boolean =>
  a.phase === b.phase &&
  a.dirtyOps === b.dirtyOps &&
  a.saving === b.saving &&
  a.lastSavedAt === b.lastSavedAt &&
  a.error === b.error;

const setSession = (patch: Partial<SessionState>): void => {
  const next = { ...state, ...patch };
  if (sameSession(next, state)) return;
  state = next;
  for (const listener of Array.from(listeners)) listener();
};

/** 只有测试用 */
export const resetSession = (): void => {
  setSession(INITIAL_SESSION);
  baselines.clear();
  activeUserId = null;
  inFlight = null;
};

// ─────────────────────────── 会话动作 ───────────────────────────

/** 每个用户一份基线缓存。基线的权威在磁盘，这里只是本会话的副本 */
const baselines = new Map<string, Baseline>();

let activeUserId: string | null = null;
/** 正在飞的那次保存。`discardUser` 要等它落地，否则会与删目录互相追赶 */
let inFlight: Promise<void> | null = null;
let started = false;

export interface SessionDeps {
  /** 读当前用户 id */
  readUserId: () => string | null;
  /** 读某个用户的数据快照 */
  readSnapshot: (userId: string) => SavableSnapshot;
}

let deps: SessionDeps | null = null;

/** 当前用户的基线。还没取到就给空基线 —— 空基线意味着"什么都不知道已同步" */
const baselineOf = (userId: string): Baseline => baselines.get(userId) ?? emptyBaseline();

/**
 * 重新算脏集。**只有当前用户**：别的用户的改动要等他被切回来才谈得上。
 *
 * 这是纯读操作（哈希 + 比较），不发请求 —— 所以可以随便调，包括防抖调用。
 */
export const refreshDirty = async (): Promise<void> => {
  if (!deps) return;
  const userId = deps.readUserId();
  if (!userId || userId !== activeUserId) return;
  if (state.phase !== "ready") return;

  const ops = await collectDirty(deps.readSnapshot(userId), baselineOf(userId));
  setSession({ dirtyOps: ops });
};

/** 取基线。失败（或端点不存在）→ `local-only`，界面上不再谈"未保存" */
const loadBaseline = async (userId: string): Promise<void> => {
  try {
    const res = await fetch(`/api/saves?userId=${encodeURIComponent(userId)}`);
    // 404 = 本次部署没有磁盘存档。与 `syncStatus` 那套一样，这是**正常部署形态**，
    // 不是故障：不重试、不报错，只是没有地方可存
    if (res.status === 404) {
      setSession({ phase: "local-only", dirtyOps: [], error: null });
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const payload = (await res.json()) as { ok?: boolean; users?: Record<string, unknown> };
    const raw = payload.users?.[userId];
    const parsed = parseBaseline((raw as { baseline?: unknown } | undefined)?.baseline);
    baselines.set(userId, parsed);
    setSession({ phase: "ready", error: null });
    await refreshDirty();
  } catch (error) {
    setSession({
      phase: "local-only",
      dirtyOps: [],
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * 把当前用户的待写条目提交上去。
 *
 * **提交前重算一次**：脏集是防抖刷新的，用户点保存时它可能落后几百毫秒 ——
 * 而"点了保存却没存上最后一次改动"是最不能接受的一种错。
 */
const runSave = async (): Promise<boolean> => {
  if (!deps || state.phase !== "ready" || state.saving) return false;
  const userId = deps.readUserId();
  if (!userId || userId !== activeUserId) return false;

  await refreshDirty();
  const ops = state.dirtyOps;
  if (ops.length === 0) {
    // 没有待写的也算成功：用户想确认"已经存好了"，那就给他这个确认
    setSession({ lastSavedAt: Date.now(), error: null });
    return true;
  }

  setSession({ saving: true, error: null });
  try {
    const res = await fetch("/api/saves", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, ops }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(detail.slice(0, 200) || `HTTP ${res.status}`);
    }

    const payload = (await res.json()) as { baseline?: unknown };
    // 服务端回传的基线是**权威**：它算的是真正写下去的那份内容
    baselines.set(userId, parseBaseline(payload.baseline));
    await refreshDirty();
    setSession({ saving: false, lastSavedAt: Date.now(), error: null });
    return true;
  } catch (error) {
    // 失败的条目**留在脏集里** —— 用户看得见"还有 N 处没存"，可以再点一次。
    // 脏集是从数据现算的，不依赖任何队列，所以这里不需要"放回队列"这种动作
    setSession({
      saving: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

/**
 * 页面隐藏 / 关闭时的尽力一刷。
 *
 * 用 `sendBeacon`：它在页面卸载后仍会送达，而且**不需要等待**。这正是批量 ops 端点
 * 存在的理由之一 —— `sendBeacon` 发不了 DELETE 方法，而删除也在 ops 里。
 *
 * 提交不成功也不补救：脏集是从数据现算的，下次打开会重新算出来，
 * 不会因为这次没送出去就丢。
 */
const flushOnHide = (): void => {
  if (!deps || state.phase !== "ready" || state.dirtyOps.length === 0) return;
  const userId = deps.readUserId();
  if (!userId) return;

  const body = JSON.stringify({ userId, ops: state.dirtyOps });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/saves", new Blob([body], { type: "application/json" }));
  }
};

/** 有未落盘改动时挂 `beforeunload`（原生确认框，文案与按钮由浏览器定，改不了） */
export const hasUnsavedChanges = (): boolean => state.dirtyOps.length > 0;

/**
 * 现在有几处没落盘 —— **先重算再回答**。
 *
 * 不能直接读 `state.dirtyOps`：那是防抖刷新的，用户"打完字立刻点返回"时它还落后
 * 几百毫秒，于是这里会说"没有未保存"，而后台确实有。那正是这个判定最该准的时候。
 *
 * `local-only`（没有地方可存）返回 0 —— 谈不上"没存上"。
 */
export const checkUnsaved = async (): Promise<number> => {
  if (state.phase !== "ready") return 0;
  await refreshDirty();
  return state.dirtyOps.length;
};

/**
 * 能不能安全地离开（切用户 / 关编辑器）：要么没有未落盘的改动，要么已经存成功。
 *
 * 给"离开"这类动作用 —— 返回 false 时调用方**应当取消这次离开**，
 * 否则改动会跟着落到别的用户名下，而用户以为已经存好了。
 */
export const canLeave = async (): Promise<boolean> => {
  if (state.phase !== "ready") return true;
  await refreshDirty();
  if (state.dirtyOps.length === 0) return true;
  return save();
};

/**
 * 启动会话：取基线 → 算脏集 → 挂卸载兜底。**幂等**。
 *
 * 依赖以参数传入而不是 import 三个 store：这样本模块不碰 store，
 * `collectDirty` 那一半也能脱离浏览器直接测。
 */
export const startSession = (sessionDeps: SessionDeps): void => {
  deps = sessionDeps;
  if (started || typeof window === "undefined") return;
  started = true;

  activeUserId = sessionDeps.readUserId();
  if (activeUserId) void loadBaseline(activeUserId);

  window.addEventListener("pagehide", flushOnHide);
  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedChanges()) return;
    // 浏览器只让我们"请求确认"，文案与按钮都是它定的（规范禁止自定义）
    event.preventDefault();
    event.returnValue = "";
    flushOnHide();
  });
};

/** 当前用户换了（或首次确定）：装新用户的基线并重算脏集 */
export const switchTo = async (userId: string | null): Promise<void> => {
  activeUserId = userId;
  // 一律先回 `loading`：此时"能不能存"还不知道。**不要**用 `local-only` ——
  // 界面把那读成「本次部署没有磁盘存档」，而没有当前用户只是"还没选人"
  setSession({ dirtyOps: [], error: null, phase: "loading" });
  if (userId) await loadBaseline(userId);
};

/**
 * 把一个用户从会话里摘掉（删用户时用）：等正在飞的保存落地，再清掉他的基线缓存。
 *
 * **必须先等**：删磁盘目录与那次保存会互相追赶 —— 先删后写就把目录写回来了。
 * 实测见过这个顺序：`DELETE 200` 之后 186ms 追来一个 `POST 200`。
 */
export const discardUser = async (userId: string): Promise<void> => {
  await inFlight?.catch(() => {
    // 那批失败了也无所谓：下面就把这个用户的痕迹清掉
  });
  baselines.delete(userId);
  if (activeUserId === userId) {
    activeUserId = null;
    setSession({ dirtyOps: [], phase: "loading" });
  }
};

/** 包一层，把飞行中的那次记下来 —— `discardUser` 需要等它落地 */
export const save = async (): Promise<boolean> => {
  const run = runSave();
  inFlight = run.then(
    () => undefined,
    () => undefined
  );
  return run;
};
