import { contentHash } from "./hash";
import { parseRecordKey, recordKey, type Baseline } from "./baseline";
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
