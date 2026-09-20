import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { useSavesSession } from "@/hooks/useSavesSession";
import { UserSelectDialog } from "./UserSelectDialog";
import { NoUserPlaceholder } from "./NoUserPlaceholder";

/**
 * 「先进板块，还是先选人」的门禁。
 *
 * 判空一律用 `currentUserId`，**不要**用 `profile == null` —— 后者在 hydrate
 * 完成前也为真，会导致每次进板块都闪一下选择弹窗。
 *
 * 注意这里是真的**不渲染** children，而不是盖一层弹窗。三个板块（职业数据库 /
 * 我的简历 / 投递目标）都包了这一层 —— 岗位 v2 起也按用户隔离，没有当前用户时
 * 它同样无主。
 *
 * **弹窗可以跳过**（传了 `onOpenChange` → `UserSelectDialog` 的 X 与 Esc 都生效）。
 * 跳过之后显示 `NoUserPlaceholder`，它带一个能回到门禁的按钮 —— 这样既不是死胡同，
 * 也不会把人丢进一片空白（三个板块在没有用户时都渲染不出东西）。
 *
 * 跳过状态是**每个板块各自一份**（组件内 state）：换了板块会再问一次。这是刻意的 ——
 * 三个板块是三个独立的数据域，分别问一句不算骚扰，而做成全局「别再问了」的开关，
 * 风险是用户从此再也见不到门禁、只剩空状态。
 */
export const RequireUser = ({ children }: { children: ReactNode }) => {
  const t = useTranslations();
  const currentUserId = useCareerProfileStore((s) => s.currentUserId);
  const session = useSavesSession();
  const [skipped, setSkipped] = useState(false);

  // 选到用户后复位：下次真的又没有用户时（比如把它删了），门禁应当照常先问一句
  useEffect(() => {
    if (currentUserId) setSkipped(false);
  }, [currentUserId]);

  if (currentUserId) {
    // **读回磁盘之前不渲染数据面板。** 不拦的话会先闪一下浏览器里那份旧数据，
    // 而对账的拉取随后到（磁盘上被手改的内容要生效），界面再变一次 —— 用户看到的是
    // "页面自己跳了一下"。而且如果他在那几十毫秒里开始编辑，拉取会把它盖掉。
    //
    // 只在 `loading` 拦：`local-only`（本次部署没有磁盘存档）没有东西可读，直接放行。
    if (session.phase === "loading") {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">{t("sync.loadingTree")}</p>
        </div>
      );
    }
    return <>{children}</>;
  }

  return (
    <>
      <UserSelectDialog open={!skipped} onOpenChange={(open) => setSkipped(!open)} />
      {skipped && <NoUserPlaceholder onPick={() => setSkipped(false)} />}
    </>
  );
};

export default RequireUser;
