import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** 裁剪框显示尺寸（3:4） */
const FRAME_W = 288;
const FRAME_H = 384;
/** 导出尺寸（3:4）。450×600 足够 A4 打印，体积可控 */
const OUT_W = 450;
const OUT_H = 600;
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

interface Props {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

/**
 * 证件照裁剪：固定 3:4，只能平移与缩放，不能改变比例。
 *
 * 为什么固定比例：简历上的照片框是固定尺寸的，非 3:4 的图会被
 * `object-fit: cover` 二次裁切 —— 用户在裁剪器里看到的构图与最终
 * 简历上的不一致。固定比例让「所见即所得」。
 */
export const PhotoCropper = ({ file, onCancel, onConfirm }: Props) => {
  const t = useTranslations("profile");
  const imgRef = useRef<HTMLImageElement>(null);
  const [url, setUrl] = useState("");
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  /** 覆盖式基础缩放：让图片至少铺满裁剪框 */
  const baseScale = natural.w && natural.h
    ? Math.max(FRAME_W / natural.w, FRAME_H / natural.h)
    : 1;
  const scale = baseScale * zoom;
  const dispW = natural.w * scale;
  const dispH = natural.h * scale;

  /** 平移范围：图片边缘不得进入裁剪框内 */
  const clamp = useCallback(
    (x: number, y: number) => ({
      x: Math.min(0, Math.max(FRAME_W - dispW, x)),
      y: Math.min(0, Math.max(FRAME_H - dispH, y)),
    }),
    [dispW, dispH]
  );

  // 缩放变化后重新夹取，避免图片被拖出框外
  useEffect(() => {
    setOffset((o) => clamp(o.x, o.y));
  }, [clamp]);

  const handleLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNatural({ w, h });
    // 初始居中
    const s = Math.max(FRAME_W / w, FRAME_H / h);
    setOffset({ x: (FRAME_W - w * s) / 2, y: (FRAME_H - h * s) / 2 });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset(clamp(d.ox + (e.clientX - d.px), d.oy + (e.clientY - d.py)));
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleZoom = (next: number) => {
    // 以裁剪框中心为锚点缩放，避免图片乱跑
    const centerX = (FRAME_W / 2 - offset.x) / scale;
    const centerY = (FRAME_H / 2 - offset.y) / scale;
    const nextBase = natural.w && natural.h
      ? Math.max(FRAME_W / natural.w, FRAME_H / natural.h) * next
      : 1;
    setZoom(next);
    setOffset(
      clamp(FRAME_W / 2 - centerX * nextBase, FRAME_H / 2 - centerY * nextBase)
    );
  };

  const handleConfirm = async () => {
    const img = imgRef.current;
    if (!img || !natural.w) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUT_W;
      canvas.height = OUT_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("无法创建 Canvas 上下文");

      // 裁剪框在图片坐标系中的矩形
      const sx = -offset.x / scale;
      const sy = -offset.y / scale;
      const sw = FRAME_W / scale;
      const sh = FRAME_H / scale;

      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9)
      );
      if (!blob) throw new Error("导出图片失败");
      onConfirm(blob);
    } catch (error) {
      console.error("裁剪失败:", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("photo.cropTitle")}</DialogTitle>
          <DialogDescription>{t("photo.cropHint")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <div
            className="relative cursor-move touch-none overflow-hidden rounded-lg border border-border bg-muted select-none"
            style={{ width: FRAME_W, height: FRAME_H }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {url && (
              <img
                ref={imgRef}
                src={url}
                alt=""
                draggable={false}
                onLoad={handleLoad}
                className="absolute origin-top-left will-change-transform"
                style={{
                  width: dispW || "auto",
                  height: dispH || "auto",
                  transform: `translate(${offset.x}px, ${offset.y}px)`,
                  visibility: natural.w ? "visible" : "hidden",
                }}
              />
            )}
            {/* 三分线参考 */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-1/3 top-0 h-full w-px bg-white/40" />
              <div className="absolute left-2/3 top-0 h-full w-px bg-white/40" />
              <div className="absolute left-0 top-1/3 h-px w-full bg-white/40" />
              <div className="absolute left-0 top-2/3 h-px w-full bg-white/40" />
            </div>
          </div>

          <div className="flex w-full items-center gap-3">
            <Minus className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Slider
              value={[zoom]}
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={0.01}
              onValueChange={([v]) => handleZoom(v)}
            />
            <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>

          <p className="text-xs text-muted-foreground">{t("photo.ratioNote")}</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={busy || !natural.w}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("photo.cropConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
