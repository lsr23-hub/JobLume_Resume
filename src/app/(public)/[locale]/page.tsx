import SiteNav from "@/components/landing/SiteNav";
import Hero from "@/components/landing/Hero";
import FeatureGrid from "@/components/landing/FeatureGrid";
import TemplateRow from "@/components/landing/TemplateRow";
import JudgementBand from "@/components/landing/JudgementBand";
import CtaBand from "@/components/landing/CtaBand";
import SiteFooter from "@/components/landing/SiteFooter";

/**
 * 落地页。
 *
 * 按设计规格的分区节奏排：奶油底 → 奶油卡 → 浅奶 → 深色面 → 珊瑚 → 深色页脚，
 * 相邻两段不重复同一种表面（规格的 Do's and Don'ts 里写死的一条）。
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteNav />
      <main>
        <Hero />
        <FeatureGrid />
        <TemplateRow />
        <JudgementBand />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}
