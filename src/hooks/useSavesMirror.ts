import { useEffect } from "react";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { useJobTargetStore } from "@/store/useJobTargetStore";
import { useResumeStore } from "@/store/useResumeStore";
import {
  EMPTY_SNAPSHOT,
  diffSnapshot,
  mergePending,
  type MirrorOp,
  type UserSnapshot,
} from "@/lib/saves/mirror";
import { setSyncStatus } from "@/lib/saves/syncStatus";

/**
 * 把改动防抖镜像到磁盘上的 `saves/<userId>/`。
 *
 * ⚠️ **这是当前机制，S3 会把它换成「手动保存 + 五个明确时机」**
 * （见 `plan/saves-design.md`）。触发方式会变，但 diff / 队列 / 重试这几层的语义不变，
 * 所以现在改的是**可见性**，不是模型。
 *
 * 现状：真相源是浏览器，这里只做**单向**镜像 —— 请求失败不影响应用继续用
 * （所以全程不弹 toast）。但它**不再静默**：状态推给 `lib/saves/syncStatus.ts`，
 * `SaveBar` 上看得见。
 *
 * 为什么是订阅 store 而不是包一层 action：三个 store 的写入路径太多了
 * （简历 35 个 action、档案十几个），挨个包会漏。订阅是结构上不会漏的做法。
 *
 * 注意**编辑器（`/app/workbench/$id`）不在 `DashboardLayout` 之下**，所以这个
 * hook 挂了两个地方：`dashboard/client.tsx` 与 `workbench/[id]/page.tsx`。
 * `start()` 有幂等守卫，挂两次不会订阅两遍。
 */

/** 防抖窗口。与编辑器写文件的 1500ms 同一个手感 */
const DEBOUNCE_MS = 1500;

/** 连续失败到这个次数就停止自动重试。**但仍会在界面上说出来**，且可手动重试 */
const MAX_FAILURES = 3;

/**
 * 已经镜像过的快照，按 userId 分。
 *
 * 放模块作用域而不是 `useRef`：组件重挂载（切板块、进编辑器）不该丢掉基线，
 * 否则每进一次都会把该用户的全部文件重写一遍。
 */
const synced = new Map<string, UserSnapshot>();

/**
 * 攒批中的文件，**按 userId 分开**。
 *
 * 不能只用一个队列 + flush 时读「此刻的当前用户」—— 用户可能在防抖窗口里
 * 切走了，那样会把甲的改动写进乙的目录。
 */
const pending = new Map<string, Map<string, MirrorOp>>();

let timer: ReturnType<typeof setTimeout> | null = null;
/** 正在飞的那批请求。`discardUser` 要等它落地，否则会与删目录互相追赶 */
let inFlight: Promise<void> | null = null;
let started = false;
let failures = 0;
let gaveUp = false;
/** 端点不存在（404）。与 gaveUp 分开：这不是故障，是部署形态，不需要"重试" */
let disabled = false;

const currentUserId = (): string | null => useCareerProfileStore.getState().currentUserId;

const snapshotOf = (userId: string): UserSnapshot => ({
  profile: useCareerProfileStore.getState().profiles[userId] ?? null,
  resumes: useResumeStore.getState().byUser[userId] ?? {},
  targets: useJobTargetStore.getState().targetsByUser[userId] ?? {},
});

const countPending = (): number => {
  let total = 0;
  for (const ops of Array.from(pending.values())) total += ops.size;
  return total;
};

const pushStatus = (patch: Parameters<typeof setSyncStatus>[0]): void => {
  setSyncStatus({ pendingCount: countPending(), ...patch });
};

type SendResult =
  | { kind: "ok" }
  | { kind: "fail"; detail: string }
  | { kind: "disabled" };

const send = async (userId: string, op: MirrorOp): Promise<SendResult> => {
  let res: Response;
  try {
    res = await fetch("/api/saves", {
      method: op.op === "write" ? "POST" : "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId,
        kind: op.kind,
        id: op.id,
        data: op.op === "write" ? op.data : undefined,
      }),
    });
  } catch {
    // 网络层失败（断网、服务没起来）
    return { kind: "fail", detail: "网络请求失败" };
  }

  // 404 = 本次部署没有磁盘存档（`SAVES_ENABLED` 未开、或静态托管下端点不存在）。
  // 这是**正常的部署形态**，不是故障：不重试、不报错，只在界面上说明。
  if (res.status === 404) return { kind: "disabled" };
  if (res.ok) return { kind: "ok" };

  // 服务端的错误原文（如「内容超过 4194304 字节上限」）比一个状态码有用得多
  const detail = await res.text().catch(() => "");
  return { kind: "fail", detail: detail.slice(0, 200) || `HTTP ${res.status}` };
};

const schedule = () => {
  if (gaveUp || disabled) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
};

const flush = () => {
  timer = null;
  if (gaveUp || disabled) return;

  // 先把队列整体取出来（而不是边遍历边删），失败时再放回去
  const jobs: Array<Promise<{ userId: string; key: string; op: MirrorOp; result: SendResult }>> = [];
  for (const [userId, ops] of Array.from(pending)) {
    pending.delete(userId);
    for (const [key, op] of Array.from(ops)) {
      jobs.push(send(userId, op).then((result) => ({ userId, key, op, result })));
    }
  }

  if (jobs.length === 0) {
    pushStatus({ phase: "idle" });
    return;
  }

  pushStatus({ phase: "syncing" });

  inFlight = Promise.all(jobs).then((results) => {
    // 端点不存在：整体停止，队列丢掉 —— 写不进去就是写不进去，留着只会越攒越多
    if (results.some((r) => r.result.kind === "disabled")) {
      disabled = true;
      pending.clear();
      pushStatus({ phase: "disabled", lastError: null });
      return;
    }

    const failed = results.filter(
      (r): r is typeof r & { result: { kind: "fail"; detail: string } } =>
        r.result.kind === "fail"
    );

    if (failed.length === 0) {
      failures = 0;
      pushStatus({
        phase: "idle",
        failures: 0,
        lastSuccessAt: Date.now(),
        lastError: null,
      });
      return;
    }

    failures += 1;

    // 失败的放回队列 —— 否则磁盘停在旧内容上，而基线以为已经同步过了
    for (const { userId, key, op } of failed) {
      const bucket = pending.get(userId) ?? new Map<string, MirrorOp>();
      bucket.set(key, op);
      pending.set(userId, bucket);
    }

    const lastError = failed[0]?.result.detail ?? null;

    if (failures >= MAX_FAILURES) {
      if (!gaveUp) {
        gaveUp = true;
        console.warn(
          `[saves] 同步到 saves/ 连续失败 ${failures} 次，已停止自动重试。` +
            `浏览器里的数据不受影响，可在界面上手动重试。原因：${lastError ?? "未知"}`
        );
      }
      pushStatus({ phase: "stopped", failures, lastError });
      return;
    }

    pushStatus({ phase: "failed", failures, lastError });
    schedule();
  });
};

const sync = (userId: string | null) => {
  // ⚠️ 这里**只挡 disabled，不挡 gaveUp**。
  //
  // 曾经的写法是 `if (gaveUp || disabled || !userId) return`，那会让「已停止自动重试」
  // 状态下的新改动**进不了队列**：用户点「立即写入」时先 `touchProfile()`（触发 sync，
  // 被 gaveUp 吞掉）再 `flushNow()`（冲一个空队列），结果是界面上显示「已写入磁盘」
  // 而磁盘上还是旧内容 —— 正是这个状态层要消灭的那类假状态。
  //
  // 不挡 gaveUp 也不会让队列无限涨：`mergePending` 按 `kind:id` 去重，队列长度上限
  // 就是一个用户的条目数。而 `schedule()` 仍然挡着 gaveUp，所以不会自动重试刷屏。
  if (disabled || !userId) return;

  const prev = synced.get(userId) ?? EMPTY_SNAPSHOT;
  const next = snapshotOf(userId);
  const ops = diffSnapshot(prev, next);
  if (ops.length === 0) return;

  // 基线立刻推进，而不是等发送成功：防抖窗口里再改一次时，下一轮 diff 必须是
  // 在这之上的增量，否则会把同一批文件反复算进队列。发失败的那几条由 flush
  // 放回队列重试，所以基线与队列始终自洽。
  synced.set(userId, next);
  pending.set(userId, mergePending(pending.get(userId) ?? new Map(), ops));
  pushStatus({});
  schedule();
};

const start = () => {
  if (started || typeof window === "undefined") return;
  started = true;

  // 档案：切片变了、或当前用户换了，都同步「那一个用户」
  useCareerProfileStore.subscribe((state, prev) => {
    if (state.profiles !== prev.profiles || state.currentUserId !== prev.currentUserId) {
      sync(state.currentUserId);
    }
  });

  useResumeStore.subscribe((state, prev) => {
    if (state.byUser !== prev.byUser) sync(currentUserId());
  });

  useJobTargetStore.subscribe((state, prev) => {
    if (state.targetsByUser !== prev.targetsByUser) sync(currentUserId());
  });

  // 首屏补一次：升级上来的存量数据、或上次没同步成功时，磁盘上还是空的
  sync(currentUserId());
};

/**
 * 立刻写盘，不等防抖。
 *
 * 用户点「立即写入」时调用。**重置放弃状态**再冲一次 —— 用户明确要求了，
 * 就不该因为前三次自动重试失败而拒绝执行。
 */
export const flushNow = (): void => {
  if (disabled) return;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  gaveUp = false;
  failures = 0;
  flush();
};

/**
 * 把一个用户从镜像里彻底抹掉：**等他正在飞的那批写盘落地**，再清掉队列与基线。
 *
 * 为什么不能只删磁盘目录：删用户时队列里可能还留着这个用户的 op（他在 1.5s 防抖窗口
 * 内被删掉），那次 flush 会在目录删掉**之后**把文件写回来 —— 目录就复活了。
 * 实测见到过这个顺序：`POST 200` 追在 `DELETE 200` 后面。
 *
 * 所以顺序是「等在飞的落地 → 丢掉没发出去的 → 才去删目录」。等在飞的那批是必需的：
 * 它可能正带着这个用户的内容，删完再落地就等于白删。
 * 等完之后不会再为这个用户产生新 op —— store 里的数据已经清了。
 */
export const discardUser = async (userId: string): Promise<void> => {
  await inFlight?.catch(() => {
    // 那批失败了也无所谓：下面就把这个用户的队列整个丢掉
  });
  pending.delete(userId);
  synced.delete(userId);
};

/**
 * 在应用的两处外壳里各调一次（面板与编辑器）。幂等。
 */
export const useSavesMirror = () => {
  useEffect(() => {
    start();
  }, []);
};

export default useSavesMirror;
