import { useEffect, useState, type ReactNode } from "react";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
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
  const currentUserId = useCareerProfileStore((s) => s.currentUserId);
  const [skipped, setSkipped] = useState(false);

  // 选到用户后复位：下次真的又没有用户时（比如把它删了），门禁应当照常先问一句
  useEffect(() => {
    if (currentUserId) setSkipped(false);
  }, [currentUserId]);

  if (currentUserId) return <>{children}</>;

  return (
    <>
      <UserSelectDialog open={!skipped} onOpenChange={(open) => setSkipped(!open)} />
      {skipped && <NoUserPlaceholder onPick={() => setSkipped(false)} />}
    </>
  );
};

export default RequireUser;
