import { useEffect, useState } from "react";
import { resolveImageRef } from "@/lib/imageStore";
import { isImageRef } from "@/lib/saves/images";
import { useImageEpoch } from "@/hooks/useImageEpoch";

/**
 * 把档案里的图片引用解析成可渲染的 URL。
 *
 * 职业档案的照片存的是 `idb:img_xxx`（IndexedDB 引用），不能直接塞进 `<img src>`。
 * 非引用的值（外链、历史遗留的 Base64）原样透传 —— 这正是老数据不需要迁移的原因。
 *
 * 抽成 hook 是因为用户选择弹窗要为**每张卡片**解析一张照片；内联写会变成 N 份
 * 复制粘贴（此前全仓只有 `profile/BasicPanel.tsx` 里那一份）。
 */
export const useResolvedImage = (ref: string | undefined): string => {
  const [url, setUrl] = useState("");
  // 缓存没有时字节要从磁盘拉，那是"后到"的 —— 只盯 ref 会一直空着（见 useImageEpoch）
  const imageEpoch = useImageEpoch();

  useEffect(() => {
    if (!ref) {
      setUrl("");
      return;
    }
    if (!isImageRef(ref)) {
      setUrl(ref);
      return;
    }

    let objectUrl = "";
    let cancelled = false;
    void resolveImageRef(ref).then((resolved) => {
      objectUrl = resolved;
      if (!cancelled) setUrl(resolved);
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ref, imageEpoch]);

  return url;
};

export default useResolvedImage;
