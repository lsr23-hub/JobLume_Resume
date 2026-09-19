import { DEFAULT_TEMPLATES } from "@/config";
import { useTranslations } from "@/i18n/compat/client";
import { useTemplateSnapshots } from "@/hooks/useTemplateSnapshots";
import { useLocale } from "@/i18n/compat/client";

/**
 * 模板一览 —— 直接放真实截图（`public/template-snapshots/`，由
 * `pnpm generate:template-snapshots` 生成），不用示意图。
 *
 * 张数由 `DEFAULT_TEMPLATES` 派生，所以模板增删这里自动跟上。
 */
const TemplateRow = () => {
  const t = useTranslations("home");
  const tTemplates = useTranslations("dashboard.templates");
  const locale = useLocale();
  const { snapshotMap } = useTemplateSnapshots(locale);

  return (
    <section id="templates" className="border-y border-hairline/60 bg-surface-soft">
      <div className="mx-auto max-w-[1200px] px-6 py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="font-serif text-[28px] font-normal leading-[1.2] tracking-[-0.3px] text-ink sm:text-[32px]">
              {t("templates.title")}
            </h2>
            <p className="mt-3 max-w-[38rem] text-[16px] leading-[1.55] text-body">
              {t("templates.subtitle")}
            </p>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-6 lg:grid-cols-4">
          {DEFAULT_TEMPLATES.map((template) => {
            const nameKey = template.id === "left-right" ? "leftRight" : template.id;
            return (
              <figure key={template.id} className="group">
                <div className="overflow-hidden rounded-lg border border-hairline bg-white shadow-[0_1px_3px_rgba(20,20,19,0.06)] transition-shadow group-hover:shadow-[0_8px_24px_-12px_rgba(20,20,19,0.25)]">
                  {/* 缩略图就是简历本身，白底是纸面，不跟随主题 */}
                  {snapshotMap[template.id] ? (
                    <img
                      src={snapshotMap[template.id] as string}
                      alt={tTemplates(`${nameKey}.name`)}
                      className="aspect-[210/297] w-full object-cover object-top"
                      loading="lazy"
                    />
                  ) : (
                    <div className="aspect-[210/297] w-full bg-surface-card" />
                  )}
                </div>
                <figcaption className="mt-3 text-center text-[14px] font-medium text-ink">
                  {tTemplates(`${nameKey}.name`)}
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default TemplateRow;
