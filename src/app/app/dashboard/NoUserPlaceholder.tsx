import { UserRound } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { Button } from "@/components/ui/button";

/**
 * 「这个板块需要一个用户，但你把它跳过了」时显示的占位。
 *
 * 为什么需要它：门禁弹窗原来是**关不掉**的（`RequireUser` 不传 `onOpenChange`，
 * 于是 `hideClose` 把 X 藏起来，Esc 与点遮罩也无效）。结果是**死胡同** ——
 * 侧边栏的「切换用户」入口在没有当前用户时也是死的（`CurrentUserChip` 里那个
 * `currentUserId &&` 守卫让弹窗根本不挂载），唯一出路是点「新建用户」。
 *
 * 现在给了跳过按钮，就必须回答「跳过之后看什么」。直接渲染 children 会是一片空白
 * （`ProfileWorkbench` 在没有档案时 `return null`），所以这里给一个能回到门禁的落点。
 *
 * 视觉与弹窗内部那个「还没有用户」的空卡同构（`rounded-2xl border-dashed`）。
 */
export const NoUserPlaceholder = ({ onPick }: { onPick: () => void }) => {
  const t = useTranslations("userSelect");

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-dashed border-border/60 p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <UserRound className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <p className="text-base font-semibold">{t("skippedTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("skippedHint")}</p>
        </div>
        <Button onClick={onPick}>{t("pick")}</Button>
      </div>
    </div>
  );
};

export default NoUserPlaceholder;
