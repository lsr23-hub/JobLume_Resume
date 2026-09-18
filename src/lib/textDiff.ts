/**
 * 逐词对比两段文本，标出改动。
 *
 * 用途：润色是「改写」类操作，用户最该警惕的是模型顺手补了原文没有的成果
 * （「参与用户增长相关工作」被写成「推动用户规模提升」）。prompt 里的
 * 「不得新增事实」能挡住编造数字，挡不住这种软性拔高 —— 所以把改动直接摆出来，
 * 让人自己看。
 *
 * 分词刻意做粗：中文按**单字**切，拉丁字母与数字按词切。中文没有词边界，
 * 按字切不会切错词，代价是改写一句会显示成一串零散改动 —— 宁可多显示，
 * 也比漏显示强：这里的目标是「别让人漏看」，不是「让 diff 好看」。
 *
 * 不引依赖：这个规模用最长公共子序列就够了，手写一遍比多一个包划算。
 */

export type DiffOp = "same" | "add" | "del";

export interface DiffSegment {
  op: DiffOp;
  text: string;
}

/** 中文单字 / 拉丁与数字词 / 空白 / 其它符号各成一个 token */
export const tokenize = (text: string): string[] =>
  text.match(/[㐀-鿿]|[A-Za-z0-9+#._-]+|\s+|[^\s]/g) ?? [];

export const diffSegments = (before: string, after: string): DiffSegment[] => {
  const a = tokenize(before);
  const b = tokenize(after);

  // 一个为空时不必跑 DP
  if (a.length === 0) return b.length ? [{ op: "add", text: after }] : [];
  if (b.length === 0) return [{ op: "del", text: before }];

  // dp[i][j] = a[i..] 与 b[j..] 的最长公共子序列长度
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: DiffSegment[] = [];
  const push = (op: DiffOp, text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.op === op) last.text += text;
    else ops.push({ op, text });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("del", a[i]);
      i += 1;
    } else {
      push("add", b[j]);
      j += 1;
    }
  }
  while (i < a.length) {
    push("del", a[i]);
    i += 1;
  }
  while (j < b.length) {
    push("add", b[j]);
    j += 1;
  }

  return ops;
};

export interface DiffSummary {
  /** 新增内容的片段数 —— 用户最该看的就是这个 */
  added: number;
  /** 被删掉或改写的片段数 */
  removed: number;
  /** 新增字符数（不含空白） */
  addedChars: number;
}

const nonSpaceLength = (text: string): number => text.replace(/\s/g, "").length;

export const summarizeDiff = (segments: DiffSegment[]): DiffSummary => {
  let added = 0;
  let removed = 0;
  let addedChars = 0;
  for (const segment of segments) {
    if (segment.op === "add") {
      added += 1;
      addedChars += nonSpaceLength(segment.text);
    } else if (segment.op === "del") {
      removed += 1;
    }
  }
  return { added, removed, addedChars };
};
