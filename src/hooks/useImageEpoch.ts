import { useSyncExternalStore } from "react";
import { getImageEpoch, subscribeImageEpoch } from "@/lib/imageStore";

/**
 * 订阅「图片字节到齐了」的信号。
 *
 * 把它放进 effect 的 deps：那个 effect 原本只看"引用变了没有"，而**字节是后到的**
 * （缓存没有时要从磁盘拉）—— 引用没变、deps 不动，界面就一直空着。
 */
export const useImageEpoch = (): number =>
  useSyncExternalStore(subscribeImageEpoch, getImageEpoch, getImageEpoch);

export default useImageEpoch;
