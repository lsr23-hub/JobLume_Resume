import { cn } from "@/lib/utils";
import { useResumeStore } from "@/store/useResumeStore";
import { Reorder } from "framer-motion";
import { ImagePlus } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { Button } from "@/components/ui/button";
import CertificateItem from "./CertificateItem";
import { Certificate } from "@/types/resume";
import { generateUUID } from "@/utils/uuid";
import { useRef, useEffect } from "react";
import { storeImage } from "@/lib/imageStore";
import { toast } from "sonner";

const CertificatesPanel = () => {
    const t = useTranslations("workbench.certificatesPanel");
    const { activeResume, updateCertificatesBatch, addCertificate } = useResumeStore();
    const { certificates = [], activeSection } = activeResume || {};
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleCreateCertificate = (url: string) => {
        const newCert: Certificate = {
            id: generateUUID(),
            url,
            width: 100,
        };
        addCertificate(newCert);
    };

    const handleFile = async (file: File) => {
        if (!file.type.startsWith("image/")) {
            toast.error("Format error"); // Or use i18n
            return;
        }
        try {
            // 与档案照片、简历照片**统一**：二进制落盘，数据里只留引用。
            // 原来的三档压缩（>2MB 时逐级降到 800/600/400）由 `storeImage` 内部
            // 统一处理（长边 1200 + q0.85）—— 一处策略胜过三处各调一套
            handleCreateCertificate(await storeImage(file));
        } catch (e) {
            toast.error("Upload error");
        }
    };

    useEffect(() => {
        if (activeSection !== "certificates") return;
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) {
                        handleFile(blob);
                        e.preventDefault();
                        break;
                    }
                }
            }
        };
        document.addEventListener("paste", handlePaste);
        return () => document.removeEventListener("paste", handlePaste);
    }, [activeSection]);

    return (
        <div className={cn("space-y-4 px-4 py-4 rounded-lg bg-card border-border")}>
            <p className="text-sm text-muted-foreground">{t("tips")}</p>

            {certificates.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                    {t("empty")}
                </div>
            )}

            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                multiple
                onChange={(e) => {
                    const files = e.target.files;
                    if (files) {
                        Array.from(files).forEach((file) => handleFile(file));
                    }
                    if (fileInputRef.current) fileInputRef.current.value = "";
                }}
            />

            <Reorder.Group
                axis="y"
                values={certificates}
                onReorder={updateCertificatesBatch}
                className="space-y-3"
            >
                {certificates.map((cert) => (
                    <CertificateItem key={cert.id} certificate={cert} />
                ))}

                <Button onClick={() => fileInputRef.current?.click()} className="w-full">
                    <ImagePlus className="w-4 h-4 mr-2" />
                    {t("addButton")}
                </Button>
            </Reorder.Group>
        </div>
    );
};
export default CertificatesPanel;
