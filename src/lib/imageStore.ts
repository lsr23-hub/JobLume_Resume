import { compressImage } from "@/utils/imageUtils";

/**
 * 图片存储（IndexedDB）。
 *
 * 为什么不用 localStorage：照片与证书以 Base64 存放时，2-3 张证书即可撑满
 * localStorage 约 5MB 的配额，触发 QuotaExceededError 后数据实际写不进去。
 *
 * 存储形式：二进制存 IndexedDB，数据里只留 `idb:img_xxx` 引用。
 * 渲染前把引用解析成 `blob:` URL 注入 DOM —— 必须在**渲染阶段**完成，
 * 若拖到导出阶段解析会因异步时序导致图片缺失。
 */

const DB_NAME = "JobLumeImageDB";
const DB_VERSION = 1;
const STORE = "images";

/** 引用前缀。非此格式的值（外链、旧数据里的 Base64）原样透传 */
export const IMAGE_REF_PREFIX = "idb:";

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

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [meta, payload] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

export const isImageRef = (value: string | undefined): boolean =>
  typeof value === "string" && value.startsWith(IMAGE_REF_PREFIX);

/** 把 File 压缩后存入 IndexedDB，返回引用字符串 */
export const storeImageFile = async (file: File): Promise<string> => {
  if (!isBrowser()) throw new Error("图片存储仅在浏览器环境可用");

  const dataUrl = await compressImage(file, MAX_DIMENSION, MAX_DIMENSION, COMPRESS_QUALITY);
  const blob = dataUrlToBlob(dataUrl);
  const key = `${IMAGE_REF_PREFIX}img_${crypto.randomUUID()}`;

  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const request = tx.objectStore(STORE).put(blob, key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });

  return key;
};

export const getImageBlob = async (ref: string): Promise<Blob | null> => {
  if (!isBrowser() || !isImageRef(ref)) return null;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(ref);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as Blob) ?? null);
  });
};

export const deleteImage = async (ref: string): Promise<void> => {
  if (!isBrowser() || !isImageRef(ref)) return;

  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const request = tx.objectStore(STORE).delete(ref);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

/**
 * 解析为可直接用于 `<img src>` 的 URL。
 * 非引用（外链、旧 Base64 数据）原样返回，因此旧数据无需迁移。
 */
export const resolveImageRef = async (ref: string): Promise<string> => {
  if (!isImageRef(ref)) return ref;

  const blob = await getImageBlob(ref);
  return blob ? URL.createObjectURL(blob) : "";
};

/**
 * 扫描元素内的 `<img>`，把 `idb:` 引用换成 `blob:` URL。
 *
 * 在**渲染后**调用。上游的导出逻辑（`optimizeImages` /
 * `bakeObjectFitCoverImages`）处理的是 DOM 中已渲染的图片，
 * 因此必须在此之前完成替换。
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

/** 统计被引用的图片数量，用于界面提示 */
export const countImageRefs = (values: Array<string | undefined>): number =>
  values.filter(isImageRef).length;
