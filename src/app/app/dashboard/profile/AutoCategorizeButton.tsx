import { useState } from "react";
import { Loader2, Tags } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "@/i18n/compat/client";
import { useRouter } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { useAIConfigStore } from "@/store/useAIConfigStore";
import { analyzeTags } from "@/lib/profile/analyzeTags";
import { needsCategorizing } from "@/lib/profile/categories";

/**
 * 一键给全部经历归个类。
 *
 * 类别是展示标签（经历列表、候选人列表上显示 `tags[0]`）。
 * 逐条手填太烦，这里让模型按词表一次性归类。
 *
 * 只处理**还没有类别**的条目：用户自己填的类别不动（`applyCategories` 里保证）。
 */
export const AutoCategorizeButton = () => {
  const t = useTranslations("profile");
  const router = useRouter();
  const { profile, applyCategories } = useCareerProfileStore();
  const ai = useAIConfigStore();
  const [running, setRunning] = useState(false);

  // 空位要填，**非规范值也要归一化** —— 见 applyCategories 的说明
  const untagged = Object.values(profile?.entities ?? {}).filter(
    (entity) => !entity.hidden && needsCategorizing(entity.tags[0])
  );

  const handleClick = async () => {
    if (!ai.isConfigured()) {
      toast.error(t("autoTag.needKey"));
      router.push("/app/dashboard/ai");
      return;
    }

    setRunning(true);
    try {
      const outcome = await analyzeTags(untagged, {
        apiKey: ai.deepseekApiKey,
        model: ai.deepseekModelId,
        modelType: "deepseek",
      });

      if (!outcome.ok) {
        toast.error(outcome.error);
        return;
      }

      const count = Object.keys(outcome.categories).length;
      if (count === 0) {
        toast.warning(t("autoTag.none"));
        return;
      }

      applyCategories(outcome.categories);
      toast.success(t("autoTag.done", { count }));

      // 模型给出词表以外的类别时明确说出来，而不是悄悄丢掉 ——
      // 那说明 prompt 的词表没被遵守，是值得知道的事
      const rejected = outcome.corrections.filter((c) => c.type === "invalid_category").length;
      if (rejected > 0) toast.info(t("autoTag.rejected", { count: rejected }));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={running || untagged.length === 0}
      title={untagged.length === 0 ? t("autoTag.allTagged") : undefined}
    >
      {running ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Tags className="mr-2 h-4 w-4" />
      )}
      {t("autoTag.button")}
    </Button>
  );
};
