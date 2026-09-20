import { parseRecordKey, recordKey } from "./baseline";
import type { Baseline } from "./baseline";
import { contentHash } from "./hash";
import type { MirrorOp } from "./mirror";
import type { SavableSnapshot } from "./session";

/**
 * 启动对账 —— **三方比对**，`plan/saves-design.md` §4。
 *
 * 读三份东西：本地（store）、磁盘（GET 回来的）、基线（随磁盘一起回来）。
 * 逐条比三个哈希，得出这一条该怎么办：
 *
 * ```
 * hL == hD                → 一致。若基线过期就只更新基线，不传输
 * hL == hB                → 拉：本地没动，磁盘变了（含"本地没有、磁盘有"）
 * hD == hB                → 推：磁盘没动，本地变了（含"磁盘没有、本地有"）
 * 其余                     → 两边都改了且不一样 → 冲突，两边都不动
 * ```
 *
 * **为什么必须是三个哈希**：只比两边只能得出"不一样"，得不出"谁变的"。按时间戳判断
 * 已被否决（三个 store 的 `updatedAt` 都会被视图操作 bump，见设计文档的论证）；
 * 只比本地与基线则看不出磁盘的变化。基线就是那个"上次同步时长什么样"的第三方证人。
 *
 * 这是纯函数：不做 IO、不碰 store，所以要覆盖的边界可以逐个钉死。
 */

export interface ReconcileInput {
  local: SavableSnapshot;
  disk: SavableSnapshot;
  baseline: Baseline;
}

export interface PullItem {
  key: string;
  kind: "profile" | "resume" | "jd";
  id?: string;
  data: unknown;
}

export interface ConflictItem {
  key: string;
  kind: "profile" | "resume" | "jd";
  id?: string;
}

export interface ReconcileResult {
  /** 要**写回浏览器**的：磁盘上有、且本地该采纳的 */
  pull: PullItem[];
  /** 要**写到磁盘**的：本地变了而磁盘没变 */
  push: MirrorOp[];
  /** 两边都改了、互不相等的。**两边都不动**，交给用户决定 */
  conflicts: ConflictItem[];
  /** 一致但基线过期的。只需要更新基线，不传输任何内容 */
  settled: string[];
}

/** 把快照摊成「键 → 内容」，好做逐键比对 */
const flatten = (snapshot: SavableSnapshot): Map<string, unknown> => {
  const out = new Map<string, unknown>();
  if (snapshot.profile !== null && snapshot.profile !== undefined) {
    out.set(recordKey("profile"), snapshot.profile);
  }
  for (const [id, data] of Object.entries(snapshot.resumes)) {
    out.set(recordKey("resume", id), data);
  }
  for (const [id, data] of Object.entries(snapshot.targets)) {
    out.set(recordKey("jd", id), data);
  }
  return out;
};

export const reconcile = async ({
  local,
  disk,
  baseline,
}: ReconcileInput): Promise<ReconcileResult> => {
  const localByKey = flatten(local);
  const diskByKey = flatten(disk);

  // 键取自三边的并集：任何一边有它，这一条就要有结论
  const keys = new Set<string>([
    ...Array.from(localByKey.keys()),
    ...Array.from(diskByKey.keys()),
    ...Object.keys(baseline.records),
  ]);

  const result: ReconcileResult = { pull: [], push: [], conflicts: [], settled: [] };

  for (const key of Array.from(keys).sort()) {
    const parsed = parseRecordKey(key);
    // 认不出的键跳过：基线文件可以被手改，凭它拼路径等于凭手改的内容去动文件
    if (!parsed) continue;

    const localValue = localByKey.get(key);
    const diskValue = diskByKey.get(key);

    const hL = localByKey.has(key) ? await contentHash(localValue) : null;
    const hD = diskByKey.has(key) ? await contentHash(diskValue) : null;
    const hB = baseline.records[key] ?? null;

    // ⚠️ **"某一侧不存在"必须先判**。放到后面判会出事：`hD === hB` 那条会把
    // 「本地没有、磁盘有、基线也认」误判成"推上去"，而 `localValue` 是 `undefined` ——
    // 那等于往磁盘里写一个 undefined。（这是写完第一版后单测抓出来的。）
    // 两侧都存在时才轮到下面的三方比对。

    // 两边都没有：不需要传输。基线里还留着这条就顺手清掉
    if (hL === null && hD === null) {
      if (hB !== null) result.settled.push(key);
      continue;
    }

    // 本地没有、磁盘有 → **拉回来**。清掉浏览器缓存之后的恢复就靠这一条。
    //
    // ⚠️ 这里**分不清**「浏览器被清过」与「用户在应用里删了、但那次保存没成功」——
    // 两种情况的三个哈希一模一样（本地无、磁盘是上次同步的样子、基线也是）。
    // 按设计文档选「恢复」：清缓存不丢数据是这个阶段的头号目标，而"删除被撤销"
    // 至多多按一次删除。真要区分得给删除留墓碑，那是另一件事。
    if (hL === null) {
      result.pull.push({ key, kind: parsed.kind, id: parsed.id, data: diskValue });
      continue;
    }

    // 本地有、磁盘没有 → **推回去**，不静默销毁本地那份。
    // 那个文件是被**手工删掉**的：这里选"恢复文件"而不是"跟着删掉本地数据" ——
    // 静默销毁本地数据是最不该做的一种聪明。真要删，在应用里删会两边一起删。
    if (hD === null) {
      result.push.push({ op: "write", kind: parsed.kind, id: parsed.id, data: localValue });
      continue;
    }

    // ── 以下是两侧都存在时的三方比对 ──

    // 一致：不传输；基线过期就顺手记一下
    if (hL === hD) {
      if (hL !== hB) result.settled.push(key);
      continue;
    }

    // 本地没动、磁盘变了 → 拉回来（手改文件生效）
    if (hL === hB) {
      result.pull.push({ key, kind: parsed.kind, id: parsed.id, data: diskValue });
      continue;
    }

    // 磁盘没动、本地变了 → 推上去
    if (hD === hB) {
      result.push.push({ op: "write", kind: parsed.kind, id: parsed.id, data: localValue });
      continue;
    }

    // 两边都改了且互不相等 → 冲突。**两边都不动**，交给用户
    result.conflicts.push({ key, kind: parsed.kind, id: parsed.id });
  }

  return result;
};
