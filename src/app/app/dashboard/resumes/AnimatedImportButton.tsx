import { motion } from "framer-motion";
import { Braces } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AnimatedImportButtonProps {
  onClick: () => void;
  t: (key: string) => string;
}

/**
 * 「导入简历」按钮。
 *
 * 原先图标是一个 PDF ↔ JSON 的上下翻转动效（鼠标悬停时切换）。
 * 导入只剩 JSON 一个入口之后，那套「两个格式之间切换」的暗示就没意义了 ——
 * 留着会让人以为还有别的格式可选。现在只有一个 JSON 图标，配轻微的悬停缩放。
 */
export const AnimatedImportButton = ({ onClick, t }: AnimatedImportButtonProps) => (
  <motion.div
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    transition={{ type: "spring", stiffness: 400, damping: 17 }}
  >
    <Button
      onClick={onClick}
      variant="outline"
      className="h-10 px-4 font-medium border-border/60 bg-background hover:border-primary/50 hover:bg-accent/50 hover:shadow-sm dark:border-border/40 dark:hover:border-primary/40"
    >
      <Braces className="mr-2 h-4 w-4 text-blue-500" />
      {t("dashboard.resumes.import")}
    </Button>
  </motion.div>
);
