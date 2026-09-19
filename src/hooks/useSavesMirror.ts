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

/**
 * 把改动防抖镜像到磁盘上的 `saves/<userId>/`。
 *
 * 真相源仍是 localStorage —— 这里只做**单向**同步，请求失败不影响应用继续用
 * （所以全程不弹 toast，只在控制台提示一次）。
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

/** 连续失败到这个次数就停手：静态部署下端点根本不存在，没必要一直打 */
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
let started = false;
let failures = 0;
let gaveUp = false;

const currentUserId = (): string | null => useCareerProfileStore.getState().currentUserId;

const snapshotOf = (userId: string): UserSnapshot => ({
  profile: useCareerProfileStore.getState().profiles[userId] ?? null,
  resumes: useResumeStore.getState().byUser[userId] ?? {},
  targets: useJobTargetStore.getState().targetsByUser[userId] ?? {},
});

const send = async (userId: string, op: MirrorOp): Promise<boolean> => {
  try {
    const res = await fetch("/api/saves", {
      method: op.op === "write" ? "POST" : "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId,
        kind: op.kind,
        id: op.id,
        data: op.op === "write" ? op.data : undefined,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

const schedule = () => {
  if (gaveUp) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
};

const flush = () => {
  timer = null;

  for (const [userId, ops] of Array.from(pending)) {
    if (ops.size === 0) {
      pending.delete(userId);
      continue;
    }
    pending.delete(userId);

    void Promise.all(
      Array.from(ops).map(async ([key, op]) => ({ key, op, ok: await send(userId, op) }))
    ).then((results) => {
      const failed = results.filter((r) => !r.ok);
      if (failed.length === 0) {
        failures = 0;
        return;
      }

      failures += 1;
      if (failures >= MAX_FAILURES) {
        if (!gaveUp) {
          gaveUp = true;
          console.warn(
            "[saves] 同步到 saves/ 连续失败，已停止尝试。浏览器里的数据不受影响。"
          );
        }
        return;
      }

      // 失败的放回队列 —— 否则磁盘停在旧内容上，而基线以为已经同步过了
      const bucket = pending.get(userId) ?? new Map<string, MirrorOp>();
      for (const { key, op } of failed) bucket.set(key, op);
      pending.set(userId, bucket);
      schedule();
    });
  }
};

const sync = (userId: string | null) => {
  if (gaveUp || !userId) return;

  const prev = synced.get(userId) ?? EMPTY_SNAPSHOT;
  const next = snapshotOf(userId);
  const ops = diffSnapshot(prev, next);
  if (ops.length === 0) return;

  // 基线立刻推进，而不是等发送成功：防抖窗口里再改一次时，下一轮 diff 必须是
  // 在这之上的增量，否则会把同一批文件反复算进队列。发失败的那几条由 flush
  // 放回队列重试，所以基线与队列始终自洽。
  synced.set(userId, next);
  pending.set(userId, mergePending(pending.get(userId) ?? new Map(), ops));
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
 * 在应用的两处外壳里各调一次（面板与编辑器）。幂等。
 */
export const useSavesMirror = () => {
  useEffect(() => {
    start();
  }, []);
};

export default useSavesMirror;
