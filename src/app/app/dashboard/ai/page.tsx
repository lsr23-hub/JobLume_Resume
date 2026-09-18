import { ExternalLink } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DeepSeekLogo from "@/components/ai/icon/IconDeepseek";
import { useAIConfigStore } from "@/store/useAIConfigStore";
import { cn } from "@/lib/utils";

/**
 * AI 配置。
 *
 * 只保留 DeepSeek 一条通道，所以原来那套「左侧服务商列表 + 右侧表单」
 * 的两栏结构没有意义了 —— 没有可选项。这里收成单栏。
 */

const INPUT_CLASS = cn(
  "h-11",
  "bg-white dark:bg-gray-900",
  "border-gray-200 dark:border-gray-800",
  "focus:ring-2 focus:ring-primary/20"
);

const AISettingsPage = () => {
  const { deepseekApiKey, deepseekModelId, setDeepseekApiKey, setDeepseekModelId } =
    useAIConfigStore();
  const t = useTranslations();

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-4">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <span className="shrink-0 text-purple-500">
            <DeepSeekLogo className="h-6 w-6" />
          </span>
          {t("dashboard.settings.ai.deepseek.title")}
        </h2>
        <p className="mt-2 text-muted-foreground">
          {t("dashboard.settings.ai.deepseek.description")}
        </p>
      </div>

      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">
              {t("dashboard.settings.ai.deepseek.apiKey")}
            </Label>
            <a
              href="https://platform.deepseek.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              {t("dashboard.settings.ai.getApiKey")}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <Input
            value={deepseekApiKey}
            onChange={(e) => setDeepseekApiKey(e.target.value)}
            type="password"
            placeholder={t("dashboard.settings.ai.deepseek.apiKey")}
            className={INPUT_CLASS}
          />
        </div>

        <div className="space-y-4">
          <Label className="text-base font-medium">
            {t("dashboard.settings.ai.deepseek.modelId")}
          </Label>
          <Input
            value={deepseekModelId}
            onChange={(e) => setDeepseekModelId(e.target.value)}
            placeholder="deepseek-chat"
            className={INPUT_CLASS}
          />
          <p className="text-xs text-muted-foreground">
            {t("dashboard.settings.ai.deepseek.modelIdHint")}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AISettingsPage;
