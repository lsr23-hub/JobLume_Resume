import type { ReactNode } from "react";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { UserSelectDialog } from "./UserSelectDialog";

/**
 * 「先进板块，还是先选人」的门禁。
 *
 * 判空一律用 `currentUserId`，**不要**用 `profile == null` —— 后者在 hydrate
 * 完成前也为真，会导致每次进板块都闪一下选择弹窗。
 *
 * 注意这里是真的**不渲染** children，而不是盖一层弹窗。三个板块（职业数据库 /
 * 我的简历 / 投递目标）都包了这一层 —— 岗位 v2 起也按用户隔离，没有当前用户时
 * 它同样无主。
 */
export const RequireUser = ({ children }: { children: ReactNode }) => {
  const currentUserId = useCareerProfileStore((s) => s.currentUserId);

  if (!currentUserId) return <UserSelectDialog />;
  return <>{children}</>;
};

export default RequireUser;
