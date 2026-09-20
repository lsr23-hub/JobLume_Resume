import { compressImage } from "@/utils/imageUtils";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { imageFileName, isImageRef, newImageId } from "@/lib/saves/images";

/**
 * 图片：二进制落盘 + IndexedDB 作**缓存**。
 *
 * 演变：以前图片只存在 IndexedDB 里（数据里留 `idb:img_xxx` 引用），于是它同时挡住三件事
 * —— 备份不含图、换台机器看不到、清掉站点数据就没了。现在二进制写进
 * `saves/<userId>/images/`，IndexedDB **降级为缓存**：读不到就从磁盘拉回来。
 *
 * 引用有两种形态，**都能解析**：
 * - 新：`img_<uuid>.<ext>`（不带前缀的文件名，与磁盘上的文件同名）
 * - 旧：`idb:img_<uuid>`（只在 IndexedDB 里）—— 老数据因此不需要迁移
 *
 * 非引用（外链、`data:`、`/avatar.png` 这类静态路径）一律原样透传。
 */

const DB_NAME = "JobLumeImageDB";
const DB_VERSION = 1;
const STORE = "images";

const MAX_DIMENSION = 1200;
const COMPRESS_QUALITY = 0.85;

let dbPromise: Promise<IDBDatabase> | null = null;

const isBrowser = (): boolean =>
  typeof window !== "undefined" && typeof indexedDB !== "undefined";

const openDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
  });

  return dbPromise;
};

// ─────────────────────────── 字节到齐的信号 ───────────────────────────

/**
 * 「图片字节到齐了」的计数器。
 *
 * 为什么需要它：渲染侧那几个 effect 的 deps 是**引用变了**，而"字节后到"这件事它看不见
 * —— 引用先写进数据、而字节要从磁盘拉回来，拉回来时 deps 没有任何变化，界面就一直空着。
 * 每次从磁盘成功取到一张图就把这个数 +1，渲染侧把它放进 deps，于是会再解析一次。
 */
let imageEpoch = 0;
const epochListeners = new Set<() => void>();

export const getImageEpoch = (): number => imageEpoch;

export const subscribeImageEpoch = (listener: () => void): (() => void) => {
  epochListeners.add(listener);
  return () => {
    epochListeners.delete(listener);
  };
};

const bumpImageEpoch = (): void => {
  imageEpoch += 1;
  for (const listener of Array.from(epochListeners)) listener();
};

// ─────────────────────────── IndexedDB 缓存 ───────────────────────────

const putImageBlob = async (ref: string, blob: Blob): Promise<void> => {
  if (!isBrowser()) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const request = tx.objectStore(STORE).put(blob, ref);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

const getImageBlob = async (ref: string): Promise<Blob | null> => {
  if (!isBrowser() || !isImageRef(ref)) return null;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(ref);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as Blob) ?? null);
  });
};

// ─────────────────────────── 磁盘 ───────────────────────────

const currentUserId = (): string | null =>
  useCareerProfileStore.getState().currentUserId;

/**
 * 上传一张图。**失败只警告**：本地缓存里还有，界面不受影响 ——
 * 只是这台机器之外的地方（换台机器、清过缓存）看不到它。
 */
const uploadImage = async (ref: string, blob: Blob): Promise<void> => {
  const userId = currentUserId();
  if (!userId) return;

  try {
    const res = await fetch(
      `/api/saves/images?${new URLSearchParams({ userId, id: ref.slice(0, ref.lastIndexOf(".")) })}`,
      { method: "POST", headers: { "content-type": blob.type || "image/jpeg" }, body: blob }
    );
    if (!res.ok && res.status !== 404) {
      console.warn(`[image] 上传失败（HTTP ${res.status}），图片只在这台机器的浏览器里`);
    }
  } catch {
    console.warn("[image] 上传失败（网络），图片只在这台机器的浏览器里");
  }
};

/** 从磁盘取一张图（缓存没有时）。取不到给 `null` —— 端点不在、或那张图确实没有 */
const fetchImageFromDisk = async (ref: string): Promise<Blob | null> => {
  const userId = currentUserId();
  if (!userId || !isImageRef(ref)) return null;

  try {
    const res = await fetch(
      `/api/saves/images?${new URLSearchParams({ userId, name: ref })}`
    );
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
};

// ─────────────────────────── 对外 ───────────────────────────

/**
 * 把用户选的文件存起来，返回**引用**。
 *
 * **选中即上传**，不等手动保存：图片是素材不是文档，没有"草稿"语义，而延后上传会造出
 * "数据已保存但照片没保存"这种没法向用户解释的中间态。
 *
 * 顺序是「先写缓存、再上传」：缓存写完界面就能显示，上传是后台的事。
 */
export const storeImage = async (file: File): Promise<string> => {
  if (!isBrowser()) throw new Error("图片存储仅在浏览器环境可用");

  const dataUrl = await compressImage(file, MAX_DIMENSION, MAX_DIMENSION, COMPRESS_QUALITY);
  const blob = dataUrlToBlob(dataUrl);
  const ref = imageFileName(newImageId(), blob.type || "image/jpeg");

  await putImageBlob(ref, blob);
  await uploadImage(ref, blob);
  return ref;
};

/**
 * 解析为可直接用于 `<img src>` 的 URL。
 *
 * 缓存优先；缓存没有就**从磁盘拉**（换台机器、清过缓存的情形），拉回来顺手进缓存。
 * 两边都没有才给空串。非引用原样返回，因此旧数据无需迁移。
 */
export const resolveImageRef = async (ref: string): Promise<string> => {
  if (!isImageRef(ref)) return ref;

  const cached = await getImageBlob(ref);
  if (cached) return URL.createObjectURL(cached);

  const fetched = await fetchImageFromDisk(ref);
  if (!fetched) return "";

  await putImageBlob(ref, fetched);
  // 字节是"后到"的 —— 通知渲染侧再解析一次（见 `bumpImageEpoch` 的注释）
  bumpImageEpoch();
  return URL.createObjectURL(fetched);
};

/**
 * 扫描元素内的 `<img>`，把引用换成 `blob:` URL。
 *
 * 在**渲染后**调用。上游的导出逻辑（`optimizeImages` / `bakeObjectFitCoverImages`）
 * 处理的是 DOM 中已渲染的图片，因此必须在此之前完成替换。
 */
export const resolveImagesInElement = async (root: HTMLElement): Promise<void> => {
  const images = Array.from(root.querySelectorAll("img")).filter((img) =>
    isImageRef(img.getAttribute("src") ?? "")
  );
  if (images.length === 0) return;

  await Promise.all(
    images.map(async (img) => {
      const ref = img.getAttribute("src") ?? "";
      const url = await resolveImageRef(ref);
      if (url) img.src = url;
    })
  );
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [meta, payload] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};
