/**
 * 生成数据集复核页面。
 *
 *   pnpm eval:review        → eval-results/review.html
 *
 * 直接看 JSON 复核 118 条判定不现实。这个页面把每个案例摊成
 * 「JD + 按相关度排好的经历列表 + 预算线」，改完导出改动的 JSON 交回。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { listCaseFiles, loadCase } from "../src/eval/dataset";
import { RECOMMEND_THRESHOLD } from "../src/eval/types";

const HERE = dirname(fileURLToPath(import.meta.url));

const SECTION_LABEL: Record<string, string> = {
  education: "教育经历",
  experience: "工作经验",
  projects: "项目经历",
  campus: "校园经历",
  honors: "荣誉课程",
  languages: "语言能力",
};

const stripHtml = (html: string): string =>
  html
    .replace(/<\/(li|p|ul|div)>/g, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

const main = () => {
  const cases = listCaseFiles().map(loadCase);

  const payload = {
    recommendThreshold: RECOMMEND_THRESHOLD,
    cases: cases.map((c) => {
      const entities = Object.values(c.profile?.entities ?? {})
        .map((e) => {
          const gold = c.gold.entities[e.id];
          return {
            id: e.id,
            section: SECTION_LABEL[e.sectionId] ?? e.sectionId,
            title: e.title,
            subtitle: e.subtitle,
            dateRange: e.dateRange,
            description: stripHtml(e.description),
            tags: e.tags ?? [],
            skills: e.skills ?? [],
            // 标注只存相关度与「关键经历」，推荐与否是派生的
            relevance: gold?.relevance ?? 0,
            mustHave: Boolean(gold?.mustHave),
            reason: gold?.reason ?? "",
          };
        })
        // 按相关度降序 —— 复核时要能直接看出排序对不对
        .sort((a, b) => b.relevance - a.relevance || a.title.localeCompare(b.title));

      return {
        id: c.id,
        note: c.note ?? "",
        dimensions: c.dimensions,
        jd: c.jd,
        profile: c.profile?.basic.name ?? "",
        budget: c.gold.budget,
        targetPages: c.gold.targetPages,
        requirements: c.gold.requirements,
        missingSkills: c.gold.missingSkills,
        entities,
      };
    }),
  };

  const template = readFileSync(join(HERE, "eval-review.template.html"), "utf8");
  const html = template.replace(
    "/*__DATA__*/null",
    JSON.stringify(payload).replace(/</g, "\\u003c")
  );

  const outDir = join(process.cwd(), "eval-results");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, "review.html");
  writeFileSync(outFile, html);

  const total = payload.cases.reduce((s, c) => s + c.entities.length, 0);
  console.log(`复核页面：${outFile}`);
  console.log(`${payload.cases.length} 个案例 / ${total} 条判定`);
};

main();
