import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import RichTextEditor from "@/components/shared/rich-editor/RichEditor";

export const SelfEvaluationPanel = () => {
  const t = useTranslations("profile");
  const { profile, setSelfEvaluationContent } = useCareerProfileStore();

  if (!profile) return null;

  return (
    <div className="space-y-2">
      <RichTextEditor
        content={profile.selfEvaluationContent}
        onChange={setSelfEvaluationContent}
        placeholder={t("selfEvaluation.placeholder")}
      />
      <p className="text-xs text-muted-foreground">{t("selfEvaluation.note")}</p>
    </div>
  );
};
