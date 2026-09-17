import { useMemo } from "react";

export const MM_TO_PX = 3.78;
export const A4_HEIGHT_PX = 297 * MM_TO_PX;
// 最多只允许缩小到 90%，保证文字可读性和美感
export const MIN_SCALE = 0.9;

interface UseAutoOnePageOptions {
  contentHeight: number;
  pagePadding: number;
  enabled: boolean;
}

export interface AutoOnePageResult {
  scaleFactor: number;
  isScaled: boolean;
  /** 内容过多，即使缩放到下限也无法完美一页 */
  cannotFit: boolean;
}

/**
 * 缩放判定的纯函数本体。
 *
 * 从 hook 里抽出来是为了让**生成路径**也能用同一套判定 ——
 * 生成时需要预判「这份简历在预览里会被缩成几页」，若各写一份，
 * 预判与实际显示就会不一致。
 */
export const computeAutoOnePage = ({
  contentHeight,
  pagePadding,
  enabled,
}: UseAutoOnePageOptions): AutoOnePageResult => {
  if (!enabled || contentHeight <= 0) {
    return { scaleFactor: 1, isScaled: false, cannotFit: false };
  }

  // A4 可用内容高度 = A4 总高度 - 上下页边距
  const availableHeight = A4_HEIGHT_PX - 2 * pagePadding;

  // 实际内容高度（去掉 #resume-preview 的上下 padding）
  const actualContentHeight = contentHeight - 2 * pagePadding;

  if (actualContentHeight <= availableHeight) {
    // 内容未超出一页，不需要缩放
    return { scaleFactor: 1, isScaled: false, cannotFit: false };
  }

  const idealScale = availableHeight / actualContentHeight;

  if (idealScale >= MIN_SCALE) {
    // 在合理范围内，直接缩放
    return { scaleFactor: idealScale, isScaled: true, cannotFit: false };
  }

  // 超出合理缩放范围，仍按下限缩放，但标记 cannotFit
  return { scaleFactor: MIN_SCALE, isScaled: true, cannotFit: true };
};

export function useAutoOnePage({
  contentHeight,
  pagePadding,
  enabled,
}: UseAutoOnePageOptions): AutoOnePageResult {
  return useMemo(
    () => computeAutoOnePage({ contentHeight, pagePadding, enabled }),
    [contentHeight, pagePadding, enabled]
  );
}
