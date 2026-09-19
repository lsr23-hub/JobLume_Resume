import React, { useState, useRef, useEffect } from "react";
import { Upload, X } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { toast } from "sonner";
import { blobToDataUrl } from "@/utils/imageUtils";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PhotoConfig,
  DEFAULT_CONFIG,
  PHOTO_SIZE_PRESETS,
  matchPhotoSizePreset,
  getBorderRadiusValue,
} from "@/types/resume";
import { useResumeStore } from "@/store/useResumeStore";
import { cn } from "@/lib/utils";
import { PhotoCropper } from "./PhotoCropper";

const DEFAULT_AVATAR = "/avatar.png";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  photo?: string;
  config?: PhotoConfig;
  onPhotoChange: (photo: string | undefined, config?: PhotoConfig) => void;
  onConfigChange: (config: PhotoConfig) => void;
}

const PhotoConfigDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  photo,
  config: initialConfig,
  onPhotoChange,
  onConfigChange,
}) => {
  const t = useTranslations("photoConfig");
  const { updateBasicInfo } = useResumeStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const drawerContentRef = useRef<HTMLDivElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(photo);
  const [isDragging, setIsDragging] = useState(false);
  const [config, setConfig] = useState<PhotoConfig>(
    initialConfig || DEFAULT_CONFIG
  );
  const [isMobile, setIsMobile] = useState(false);
  /** 已选好、等着裁剪的原始文件 */
  const [pending, setPending] = useState<File | null>(null);
  const [radiusDraft, setRadiusDraft] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setConfig(initialConfig || DEFAULT_CONFIG);
      setPreviewUrl(photo === "" ? "" : photo || DEFAULT_AVATAR);
    }

    const handleClick = (e: MouseEvent) => {
      const target = e.target;
      const inDrawer =
        target instanceof Element && !!drawerContentRef.current?.contains(target);
      // 裁剪器是 Radix Dialog，portal 到 body，天然落在抽屉之外 ——
      // 不排除掉的话，用户在裁剪器里点一下就把整个抽屉关掉了。
      const inPortaledDialog =
        target instanceof Element && !!target.closest('[role="dialog"]');
      if (!inDrawer && !inPortaledDialog) onClose();
    };
    document.addEventListener("mousedown", handleClick);

    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [isOpen, initialConfig, photo]);

  /** 选文件只负责校验 + 起裁剪，真正的落地在 handleCropped */
  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(t("upload.typeLimit"));
      return;
    }
    setPending(file);
  };

  const handleCropped = async (blob: Blob) => {
    setPending(null);
    try {
      const imageData = await blobToDataUrl(blob);
      setPreviewUrl(imageData);
      updateBasicInfo({ photo: imageData });
    } catch {
      toast.error(t("upload.error"));
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    // 允许连续选同一个文件重新裁剪
    event.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleRemovePhoto = () => {
    setPreviewUrl("");
    if (inputRef.current) {
      inputRef.current.value = "";
    }

    updateBasicInfo({ photo: "" });
    onPhotoChange("", config);
  };

  const applyConfig = (newConfig: PhotoConfig) => {
    setConfig(newConfig);
    onConfigChange(newConfig);
  };

  const handleSizeChange = (id: (typeof PHOTO_SIZE_PRESETS)[number]["id"]) => {
    const preset = PHOTO_SIZE_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    applyConfig({ ...config, width: preset.width, height: preset.height });
  };

  /**
   * 自定义圆角的输入草稿。
   *
   * 为什么单开一份字符串状态：`customBorderRadius` 是 number，中途清空输入框
   * 需要能表达「空」这个瞬时状态。旧写法把 `""` 直接写进 number 字段，
   * 类型上靠一个联合 key 蒙混过去 —— 换了 key 的类型就藏不住了。
   */
  const commitRadius = () => {
    const raw = radiusDraft;
    setRadiusDraft(null);
    if (raw === null || raw === "") return;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;

    const maxRadius = Math.min(config.width, config.height) / 2;
    applyConfig({
      ...config,
      customBorderRadius: Math.max(0, Math.min(parsed, maxRadius)),
    });
  };

  const handleSave = () => {
    onPhotoChange(previewUrl, config);
    onClose();
  };

  const activeSize = matchPhotoSizePreset(config.width);

  return (
    <>
      <Drawer
        direction={isMobile ? "bottom" : "left"}
        modal={false}
        open={isOpen}
        dismissible={false}
        onOpenChange={(open) => !open && onClose()}
      >
        <DrawerContent
          ref={drawerContentRef}
          className={cn(
            "dark:bg-neutral-900 dark:text-white bg-card",
            "md:fixed md:border-none md:flex md:bottom-0 md:left-0 md:right-0 md:h-[93%] md:max-w-[360px] md:mx-[-1px] md:z-10 md:outline-none shadow shadow-blue-500/40"
          )}
        >
          <div className="mx-auto w-full max-w-md overflow-y-auto">
            <DrawerHeader>
              <DrawerTitle className="text-center">{t("title")}</DrawerTitle>
              <DrawerDescription></DrawerDescription>
            </DrawerHeader>
            <div
              className={cn(
                "relative overflow-hidden border-2 transition-all mx-auto",
                isDragging ? "border-blue-500 border-solid" : "border-dashed",
                "dark:border-neutral-700 dark:hover:border-neutral-600 border-neutral-300 hover:border-neutral-400"
              )}
              style={{
                width: `${config.width}px`,
                height: `${config.height}px`,
                borderRadius: getBorderRadiusValue(config),
                maxWidth: "100%",
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {previewUrl && previewUrl !== "" ? (
                <div className="relative h-full group">
                  <img
                    src={previewUrl}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                  <div
                    className={cn(
                      "absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 opacity-0 transition-opacity",
                      "group-hover:opacity-100"
                    )}
                  >
                    <Button
                      onClick={handleRemovePhoto}
                      className="p-1.5 rounded-full bg-card/10 hover:bg-card/20"
                      aria-label={t("actions.removePhoto")}
                    >
                      <X className="w-4 h-4 text-white" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={() => inputRef.current?.click()}
                  variant="ghost"
                  className="w-full h-full flex flex-col items-center justify-center p-0"
                >
                  <Upload
                    className={cn(
                      "w-6 h-6 mb-2",
                      "dark:text-neutral-400 text-muted-foreground"
                    )}
                  />
                </Button>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
            <div className="p-6 space-y-6">
              <span className="text-sm">{t("upload.dragHint")}</span>
            </div>

            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">{t("config.size")}</h3>
                  <div className="flex gap-2">
                    {PHOTO_SIZE_PRESETS.map((preset) => (
                      <Button
                        key={preset.id}
                        size="sm"
                        variant={activeSize === preset.id ? "default" : "outline"}
                        onClick={() => handleSizeChange(preset.id)}
                      >
                        {t(`config.sizes.${preset.id}`)}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{t("config.sizeNote")}</p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-medium">
                    {t("config.border-radius")}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {(["none", "medium", "full", "custom"] as const).map(
                      (radius) => (
                        <Button
                          key={radius}
                          size="sm"
                          variant={
                            config.borderRadius === radius ? "default" : "outline"
                          }
                          onClick={() => applyConfig({ ...config, borderRadius: radius })}
                        >
                          {radius === "none"
                            ? t("config.borderRadius.none")
                            : radius === "medium"
                            ? t("config.borderRadius.medium")
                            : radius === "full"
                            ? t("config.borderRadius.full")
                            : t("config.borderRadius.custom")}
                        </Button>
                      )
                    )}
                    {config.borderRadius === "custom" && (
                      <Input
                        type="number"
                        value={radiusDraft ?? config.customBorderRadius}
                        onChange={(e) => setRadiusDraft(e.target.value)}
                        onBlur={commitRadius}
                        className={cn("h-9 mt-2", "dark:bg-neutral-800")}
                        min={0}
                        max={Math.min(config.width, config.height) / 2}
                        placeholder={t("config.borderRadius.customPlaceholder")}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <DrawerFooter>
              <div className="flex gap-2">
                <DrawerClose asChild>
                  <Button
                    className="w-full"
                    onClick={handleSave}
                    variant="destructive"
                  >
                    {t("actions.close")}
                  </Button>
                </DrawerClose>
              </div>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>

      {pending && (
        <PhotoCropper
          file={pending}
          onCancel={() => setPending(null)}
          onConfirm={(blob) => void handleCropped(blob)}
        />
      )}
    </>
  );
};

export default PhotoConfigDrawer;
