# 上游来源清单

> 本文件记录 `src/` 与上游 **Magic Resume v2.0.8** 的关系，用于满足
> Apache License 2.0 第 4(b) 条（对被修改文件作出显著声明），并保存
> 「哪些代码源自上游」这一事实。

| 项 | 值 |
|---|---|
| 上游 | Magic Resume v2.0.8 |
| 仓库 | https://github.com/JOYCEQL/magic-resume |
| 许可证 | Apache License 2.0 + 附加商业限制条款（见根目录 `LICENSE`） |
| 上游 commit | **不可考** —— 上游只发布版本号，源码包内无 `.git`，`package.json` 也没有 `repository` / `author` 字段。**`v2.0.8` 就是全部的可追溯信息。** |
| 清单生成时间 | 2026-09-19 |

## 为什么有这份文件

开发期曾把上游源码的只读副本放在 `rawproject/`，用于比对与查阅。该副本**已移除** ——
移除前执行了一次逐文件比对（内容 SHA-256），结果就是本文件。

移除后，「某个文件是上游原样带来的、还是我们改过的」将无法再从代码本身判断。
因此这份清单是**唯一留存的基线记录**，请不要删除。

## 统计

| 分类 | 数量 |
|---|---|
| `src/` 与上游共有 | 182 |
| ├─ 逐字节相同（原样继承） | **128** |
| └─ **被修改过** | **54** |
| 仅本项目新增 | 114 |
| 仅上游有、本项目未采用 | 113 |

---

## 一、被修改过的上游文件（54）

Apache 2.0 §4(b) 针对的就是这一组。

### 清单（59）

- `app/(public)/[locale]/page.tsx`
- `app/app/dashboard/ai/page.tsx`
- `app/app/dashboard/client.tsx`
- `app/app/dashboard/resumes/ResumeCardItem.tsx`
- `app/app/dashboard/resumes/ResumeWorkbench.tsx`
- `app/app/dashboard/resumes/utils.ts`
- `app/app/dashboard/settings/page.tsx`
- `app/app/workbench/[id]/page.tsx`
- `app/globals.css`
- `app/providers.tsx`
- `components/editor/EditPanel.tsx`
- `components/editor/EditorHeader.tsx`
- `components/editor/Field.tsx`
- `components/editor/IconSelector.tsx`
- `components/editor/basic/BasicPanel.tsx`
- `components/editor/certificates/CertificatesPanel.tsx`
- `components/editor/custom/CustomItem.tsx`
- `components/editor/custom/CustomPanel.tsx`
- `components/editor/education/EducationItem.tsx`
- `components/editor/education/EducationPanel.tsx`
- `components/editor/experience/ExperienceItem.tsx`
- `components/editor/experience/ExperiencePanel.tsx`
- `components/editor/project/ProjectItem.tsx`
- `components/editor/project/ProjectPanel.tsx`
- `components/editor/skills/SkillPanel.tsx`
- `components/magicui/dock.tsx`
- `components/mobile/MobileWorkbench.tsx`
- `components/preview/IframeTemplateViewer.tsx`
- `components/preview/PreviewDock.tsx`
- `components/preview/index.tsx`
- `components/shared/GithubContribution.tsx`
- `components/shared/Logo.tsx`
- `components/shared/PdfExport.tsx`
- `components/shared/PhotoConfigDrawer.tsx`
- `components/shared/TemplateSheet.tsx`
- `components/shared/ThemeModal.tsx`
- `components/shared/icons/SidebarIcons.tsx`
- `components/shared/rich-editor/RichEditor.tsx`
- `components/templates/registry.ts`
- `components/ui/sheet-no-overlay.tsx`
- `components/ui/unified-date-input.tsx`
- `components/ui/unified-date-range-input.tsx`
- `config/ai.ts`
- `config/constants.ts`
- `generated/templateSnapshotManifest.ts`
- `hooks/useAutoOnePage.ts`
- `i18n/locales/en.json`
- `i18n/locales/zh.json`
- `routeTree.gen.ts`
- `routes/$locale.tsx`
- `routes/__root.tsx`
- `store/useAIConfigStore.ts`
- `store/useResumeStore.ts`
- `types/resume.ts`
- `utils/export.ts`
- `utils/print.ts`

---

## 二、原样继承、逐字节未改的上游文件（128）

这些文件与上游完全相同。将来若要跟进上游版本，可以从这里判断哪些可以整体替换。

### 清单（128）

- `app/app/dashboard/resumes/AnimatedImportButton.tsx`
- `app/app/dashboard/resumes/ImportResumeDialog.tsx`
- `app/app/dashboard/resumes/page.tsx`
- `app/app/dashboard/templates/page.tsx`
- `app/font.css`
- `components/ai/icon/IconDeepseek.tsx`
- `components/dev/ReactGrab.tsx`
- `components/editor/SidePanel.tsx`
- `components/editor/basic/AlignSelector.tsx`
- `components/editor/certificates/CertificateItem.tsx`
- `components/editor/layout/LayoutItem.tsx`
- `components/editor/layout/LayoutSetting.tsx`
- `components/editor/self-evaluation/SelfEvaluationPanel.tsx`
- `components/preview/FAQDialog.tsx`
- `components/shared/GlassIcons.tsx`
- `components/shared/LanguageSwitch.tsx`
- `components/shared/PhotoSelector.tsx`
- `components/shared/ThemeToggle.tsx`
- `components/shared/icons/PdfIcon.tsx`
- `components/shared/rich-editor/BetterSpace.ts`
- `components/templates/TemplateContext.tsx`
- `components/templates/classic/config.ts`
- `components/templates/classic/index.tsx`
- `components/templates/classic/sections/BaseInfo.tsx`
- `components/templates/classic/sections/CustomSection.tsx`
- `components/templates/classic/sections/EducationSection.tsx`
- `components/templates/classic/sections/ExperienceSection.tsx`
- `components/templates/classic/sections/ProjectSection.tsx`
- `components/templates/classic/sections/SectionTitle.tsx`
- `components/templates/classic/sections/SelfEvaluationSection.tsx`
- `components/templates/classic/sections/SkillSection.tsx`
- `components/templates/index.tsx`
- `components/templates/left-right/config.ts`
- `components/templates/left-right/index.tsx`
- `components/templates/left-right/sections/BaseInfo.tsx`
- `components/templates/left-right/sections/CustomSection.tsx`
- `components/templates/left-right/sections/EducationSection.tsx`
- `components/templates/left-right/sections/ExperienceSection.tsx`
- `components/templates/left-right/sections/ProjectSection.tsx`
- `components/templates/left-right/sections/SectionTitle.tsx`
- `components/templates/left-right/sections/SelfEvaluationSection.tsx`
- `components/templates/left-right/sections/SkillSection.tsx`
- `components/templates/modern/config.ts`
- `components/templates/modern/index.tsx`
- `components/templates/modern/sections/BaseInfo.tsx`
- `components/templates/modern/sections/CustomSection.tsx`
- `components/templates/modern/sections/EducationSection.tsx`
- `components/templates/modern/sections/ExperienceSection.tsx`
- `components/templates/modern/sections/ProjectSection.tsx`
- `components/templates/modern/sections/SectionTitle.tsx`
- `components/templates/modern/sections/SelfEvaluationSection.tsx`
- `components/templates/modern/sections/SkillSection.tsx`
- `components/templates/shared/CertificatesSection.tsx`
- `components/templates/shared/SectionWrapper.tsx`
- `components/templates/timeline/config.ts`
- `components/templates/timeline/index.tsx`
- `components/templates/timeline/sections/BaseInfo.tsx`
- `components/templates/timeline/sections/CustomSection.tsx`
- `components/templates/timeline/sections/EducationSection.tsx`
- `components/templates/timeline/sections/ExperienceSection.tsx`
- `components/templates/timeline/sections/ProjectSection.tsx`
- `components/templates/timeline/sections/SectionTitle.tsx`
- `components/templates/timeline/sections/SelfEvaluationSection.tsx`
- `components/templates/timeline/sections/SkillSection.tsx`
- `components/ui/accordion.tsx`
- `components/ui/alert-dialog.tsx`
- `components/ui/alert.tsx`
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/color-picker.tsx`
- `components/ui/dialog.tsx`
- `components/ui/drawer.tsx`
- `components/ui/dropdown-menu.tsx`
- `components/ui/input.tsx`
- `components/ui/label.tsx`
- `components/ui/popover.tsx`
- `components/ui/resizable.tsx`
- `components/ui/scroll-area.tsx`
- `components/ui/select.tsx`
- `components/ui/separator.tsx`
- `components/ui/sheet.tsx`
- `components/ui/sidebar.tsx`
- `components/ui/skeleton.tsx`
- `components/ui/slider.tsx`
- `components/ui/sonner.tsx`
- `components/ui/switch.tsx`
- `components/ui/textarea.tsx`
- `components/ui/tooltip.tsx`
- `config/faq.tsx`
- `config/index.ts`
- `config/initialResumeData.ts`
- `config/modules.ts`
- `hooks/use-mobile.tsx`
- `hooks/useTemplateSnapshots.ts`
- `i18n/compat/client.tsx`
- `i18n/compat/utils.ts`
- `i18n/config.ts`
- `i18n/runtime.ts`
- `lib/customField.ts`
- `lib/navigation.ts`
- `lib/projectLink.ts`
- `lib/richText.ts`
- `lib/templatePreview.ts`
- `lib/use-forwarded-ref.ts`
- `lib/utils.ts`
- `router.tsx`
- `routes/app/dashboard.tsx`
- `routes/app/dashboard/ai.tsx`
- `routes/app/dashboard/index.tsx`
- `routes/app/dashboard/resumes.tsx`
- `routes/app/dashboard/settings.tsx`
- `routes/app/dashboard/templates.tsx`
- `routes/app/index.tsx`
- `routes/app/preview-template/$id.tsx`
- `routes/app/workbench/$id.tsx`
- `routes/index.tsx`
- `store/resumeHistory.ts`
- `styles/tiptap.scss`
- `types/global.d.ts`
- `types/mark.js.d.ts`
- `types/template.ts`
- `utils/fonts.ts`
- `utils/imageUtils.ts`
- `utils/markdown.ts`
- `utils/uuid.ts`
- `vite-env.d.ts`

---

## 三、本项目新增的文件（114）

与上游无关，本项目原创。

### 清单（114）

- `app/app/dashboard/profile/AutoCategorizeButton.tsx`
- `app/app/dashboard/profile/BasicPanel.tsx`
- `app/app/dashboard/profile/BirthdayPicker.tsx`
- `app/app/dashboard/profile/EntityEditor.tsx`
- `app/app/dashboard/profile/EntityList.tsx`
- `app/app/dashboard/profile/ExportProfileButton.tsx`
- `app/app/dashboard/profile/ImportProfileDialog.tsx`
- `app/app/dashboard/profile/PhotoCropper.tsx`
- `app/app/dashboard/profile/ProfileWorkbench.tsx`
- `app/app/dashboard/profile/RegionSelector.tsx`
- `app/app/dashboard/profile/SaveBar.tsx`
- `app/app/dashboard/profile/SelfEvaluationPanel.tsx`
- `app/app/dashboard/profile/SkillGroupPanel.tsx`
- `app/app/dashboard/profile/TagsInput.tsx`
- `app/app/dashboard/profile/page.tsx`
- `app/app/dashboard/resumes/CreateResumeWizard.tsx`
- `app/app/dashboard/resumes/FitProposal.tsx`
- `app/app/dashboard/resumes/TemplateGallery.tsx`
- `app/app/dashboard/resumes/useTemplateFit.ts`
- `app/app/dashboard/settings/BackupPanel.tsx`
- `app/app/dashboard/targets/CandidateList.tsx`
- `app/app/dashboard/targets/RequirementList.tsx`
- `app/app/dashboard/targets/TargetsWorkbench.tsx`
- `app/app/dashboard/targets/page.tsx`
- `components/editor/shared/SectionItemsPicker.tsx`
- `components/editor/shared/useAddSectionEntities.ts`
- `components/editor/shared/useEnsureSectionEnabled.ts`
- `components/landing/CtaBand.tsx`
- `components/landing/FeatureGrid.tsx`
- `components/landing/Hero.tsx`
- `components/landing/JudgementBand.tsx`
- `components/landing/ProductMockup.tsx`
- `components/landing/SiteFooter.tsx`
- `components/landing/SiteNav.tsx`
- `components/landing/TemplateRow.tsx`
- `components/shared/logoMark.ts`
- `config/chinaRegions.ts`
- `config/sections.ts`
- `eval/dataset/cases/fe-01.json`
- `eval/dataset/cases/fe-02.json`
- `eval/dataset/cases/fin-01.json`
- `eval/dataset/cases/fin-02.json`
- `eval/dataset/cases/fin-03.json`
- `eval/dataset/cases/fin-04.json`
- `eval/dataset/cases/jun-01.json`
- `eval/dataset/cases/jun-02.json`
- `eval/dataset/dataset.test.ts`
- `eval/dataset/index.ts`
- `eval/dataset/profiles/fin-ai.json`
- `eval/dataset/profiles/frontend.json`
- `eval/dataset/profiles/junior.json`
- `eval/metrics/coverage.ts`
- `eval/metrics/index.ts`
- `eval/metrics/judgment.ts`
- `eval/metrics/metrics.test.ts`
- `eval/metrics/ranking.ts`
- `eval/metrics/requirements.ts`
- `eval/metrics/selection.ts`
- `eval/metrics/skillMatch.test.ts`
- `eval/metrics/skillMatch.ts`
- `eval/metrics/stability.ts`
- `eval/provider.ts`
- `eval/report.ts`
- `eval/runner.ts`
- `eval/thresholds.ts`
- `eval/types.ts`
- `lib/backup.test.ts`
- `lib/backup.ts`
- `lib/dayjsValue.ts`
- `lib/imageStore.ts`
- `lib/match/analysisCache.test.ts`
- `lib/match/analysisCache.ts`
- `lib/match/analyzeMatch.ts`
- `lib/match/buildMatchPrompt.test.ts`
- `lib/match/buildMatchPrompt.ts`
- `lib/match/validateMatchResult.test.ts`
- `lib/match/validateMatchResult.ts`
- `lib/parseModelJson.ts`
- `lib/profile/analyzeTags.test.ts`
- `lib/profile/analyzeTags.ts`
- `lib/profile/buildTagPrompt.ts`
- `lib/profile/categories.ts`
- `lib/profile/entityUtils.test.ts`
- `lib/profile/entityUtils.ts`
- `lib/profile/generateResume.test.ts`
- `lib/profile/generateResume.ts`
- `lib/profile/importFromAi.test.ts`
- `lib/profile/importFromAi.ts`
- `lib/profile/materialize.test.ts`
- `lib/profile/materialize.ts`
- `lib/profile/measureResume.tsx`
- `lib/profile/pageBudget.test.ts`
- `lib/profile/pageBudget.ts`
- `lib/profile/toResumeItem.test.ts`
- `lib/profile/toResumeItem.ts`
- `lib/region.test.ts`
- `lib/region.ts`
- `lib/server/llm.ts`
- `lib/server/llmRoute.ts`
- `lib/server/rateLimit.test.ts`
- `lib/server/rateLimit.ts`
- `lib/server/upstream.ts`
- `lib/server/urlGuard.test.ts`
- `lib/server/urlGuard.ts`
- `routes/api/match.ts`
- `routes/api/tag.ts`
- `routes/app/dashboard/profile.tsx`
- `routes/app/dashboard/targets.tsx`
- `store/persistGuard.ts`
- `store/useCareerProfileStore.ts`
- `store/useJobTargetStore.ts`
- `types/file-system-access.d.ts`
- `types/jobTarget.ts`
- `types/profile.ts`

---

## 四、上游有、本项目未采用的文件（113）

主要是被裁掉的部分：5 套模板（creative / editorial / elegant / minimalist / swiss）、
上游的 Next.js 落地页组件与 app 外壳、改写类 AI（polish / grammar）、
Gemini 服务端模块、以及一批未用到的 shadcn 原语。

### 清单（113）

- `actions/navigation.ts`
- `app/(public)/[locale]/layout.tsx`
- `app/api/grammar/route.ts`
- `app/api/polish/route.ts`
- `app/api/proxy/image/route.ts`
- `app/app/dashboard/layout.tsx`
- `app/app/dashboard/page.tsx`
- `app/app/dashboard/resumes/CreateResumeModal.tsx`
- `app/app/page.tsx`
- `app/app/workbench/layout.tsx`
- `app/layout.tsx`
- `app/manifest.ts`
- `app/sitemap.ts`
- `assets/images/logo@2x.svg`
- `assets/images/template-cover/classic.png`
- `assets/images/template-cover/left-right.png`
- `assets/images/template-cover/modern.png`
- `assets/images/template-cover/timeline.png`
- `components/Document.tsx`
- `components/ai/icon/IconDoubao.tsx`
- `components/ai/icon/IconOpenAi.tsx`
- `components/editor/grammar/GrammarCheckDrawer.tsx`
- `components/home/CTASection.tsx`
- `components/home/FAQSection.tsx`
- `components/home/FeaturesSection.tsx`
- `components/home/Footer.tsx`
- `components/home/GoDashboard.tsx`
- `components/home/HeroSection.tsx`
- `components/home/LandingHeader.tsx`
- `components/home/NewsAlert.tsx`
- `components/home/client/AnimatedFeature.tsx`
- `components/home/client/MenuToggle.tsx`
- `components/home/client/MobileMenu.tsx`
- `components/home/client/ScrollBackground.tsx`
- `components/home/client/ScrollHeader.tsx`
- `components/shared/EditButton.tsx`
- `components/shared/GitHubStars.tsx`
- `components/shared/ScrollToTop.tsx`
- `components/shared/UpdateLocale.tsx`
- `components/shared/ai/AIPolishDialog.tsx`
- `components/templates/creative/config.ts`
- `components/templates/creative/index.tsx`
- `components/templates/creative/sections/BaseInfo.tsx`
- `components/templates/creative/sections/CustomSection.tsx`
- `components/templates/creative/sections/EducationSection.tsx`
- `components/templates/creative/sections/ExperienceSection.tsx`
- `components/templates/creative/sections/ProjectSection.tsx`
- `components/templates/creative/sections/SectionTitle.tsx`
- `components/templates/creative/sections/SelfEvaluationSection.tsx`
- `components/templates/creative/sections/SkillSection.tsx`
- `components/templates/editorial/config.ts`
- `components/templates/editorial/index.tsx`
- `components/templates/editorial/sections/BaseInfo.tsx`
- `components/templates/editorial/sections/CustomSection.tsx`
- `components/templates/editorial/sections/EducationSection.tsx`
- `components/templates/editorial/sections/ExperienceSection.tsx`
- `components/templates/editorial/sections/ProjectSection.tsx`
- `components/templates/editorial/sections/SectionTitle.tsx`
- `components/templates/editorial/sections/SelfEvaluationSection.tsx`
- `components/templates/editorial/sections/SkillSection.tsx`
- `components/templates/elegant/config.ts`
- `components/templates/elegant/index.tsx`
- `components/templates/elegant/sections/BaseInfo.tsx`
- `components/templates/elegant/sections/CustomSection.tsx`
- `components/templates/elegant/sections/EducationSection.tsx`
- `components/templates/elegant/sections/ExperienceSection.tsx`
- `components/templates/elegant/sections/ProjectSection.tsx`
- `components/templates/elegant/sections/SectionTitle.tsx`
- `components/templates/elegant/sections/SelfEvaluationSection.tsx`
- `components/templates/elegant/sections/SkillSection.tsx`
- `components/templates/minimalist/config.ts`
- `components/templates/minimalist/index.tsx`
- `components/templates/minimalist/sections/BaseInfo.tsx`
- `components/templates/minimalist/sections/CustomSection.tsx`
- `components/templates/minimalist/sections/EducationSection.tsx`
- `components/templates/minimalist/sections/ExperienceSection.tsx`
- `components/templates/minimalist/sections/ProjectSection.tsx`
- `components/templates/minimalist/sections/SectionTitle.tsx`
- `components/templates/minimalist/sections/SelfEvaluationSection.tsx`
- `components/templates/minimalist/sections/SkillSection.tsx`
- `components/templates/swiss/config.ts`
- `components/templates/swiss/index.tsx`
- `components/templates/swiss/sections/BaseInfo.tsx`
- `components/templates/swiss/sections/CustomSection.tsx`
- `components/templates/swiss/sections/EducationSection.tsx`
- `components/templates/swiss/sections/ExperienceSection.tsx`
- `components/templates/swiss/sections/ProjectSection.tsx`
- `components/templates/swiss/sections/SectionTitle.tsx`
- `components/templates/swiss/sections/SelfEvaluationSection.tsx`
- `components/templates/swiss/sections/SkillSection.tsx`
- `components/ui/badge.tsx`
- `components/ui/calendar.tsx`
- `components/ui/command.tsx`
- `components/ui/hover-card.tsx`
- `components/ui/navigation-menu.tsx`
- `components/ui/tabs.tsx`
- `hooks/useAIConfiguration.tsx`
- `hooks/useGrammarCheck.ts`
- `i18n/compat/middleware.ts`
- `i18n/compat/navigation.tsx`
- `i18n/compat/server.ts`
- `i18n/db.ts`
- `i18n/request.ts`
- `i18n/routing.public.ts`
- `lib/image.tsx`
- `lib/link.tsx`
- `lib/server/gemini.ts`
- `middleware.ts`
- `routes/api/grammar.ts`
- `routes/api/polish.ts`
- `store/useGrammarStore.ts`
- `theme/themeConfig.ts`
- `utils/index.ts`
