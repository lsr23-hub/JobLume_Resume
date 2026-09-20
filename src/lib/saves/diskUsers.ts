import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { fetchUserTree, switchTo } from "./session";

/**
 * **磁盘上发现的用户**。
 *
 * 这一条路解决的是一个具体问题：清掉浏览器数据之后 `currentUserId` 也没了，而 store
 * 刻意不保留「指向一个不存在的用户」的 id —— 于是盘上的数据在界面上**够不着**。
 * 列出来、点一下读回来，缺口才算闭合。
 */

export interface DiskUser {
  id: string;
  /** 档案里的姓名。读不出来是 `null`（不是"没有这个人"） */
  name: string | null;
}

/** 问问磁盘上都有谁。拿不到就给空数组 —— 这个功能不该让任何调用方炸 */
export const fetchDiskUsers = async (): Promise<DiskUser[]> => {
  try {
    const res = await fetch("/api/saves?list=1");
    if (!res.ok) return [];
    const payload = (await res.json()) as { users?: unknown };
    if (!Array.isArray(payload.users)) return [];
    return payload.users.filter(
      (item): item is DiskUser =>
        typeof (item as DiskUser | null)?.id === "string" &&
        ((item as DiskUser).name === null || typeof (item as DiskUser).name === "string")
    );
  } catch {
    return [];
  }
};

/**
 * 采纳一个磁盘上发现的用户：把它读进浏览器，并设为当前用户。
 *
 * **顺序不能反**，每一步都有理由：
 *
 * 1. 先取树（只读）—— 拿不到就别往下走
 * 2. 把档案装进 `profiles`：`setCurrentUser` 会拒绝一个 `profiles` 里不存在的 id
 *    （它刻意不保留"指向不存在的用户"的 currentUserId），而现有的写入入口
 *    （`replaceProfile`）又只写"当前用户"—— 所以必须有 `loadProfiles` 这一步
 * 3. 设为当前用户
 * 4. `switchTo` → 读回整棵树并对账。**这时才有当前用户**，简历与岗位的拉取才落得下去
 */
export const adoptDiskUser = async (userId: string): Promise<boolean> => {
  const tree = await fetchUserTree(userId);
  if (!tree) return false;

  if (tree.snapshot.profile) {
    useCareerProfileStore.getState().loadProfiles({ [userId]: tree.snapshot.profile });
  }
  useCareerProfileStore.getState().setCurrentUser(userId);
  await switchTo(userId);
  return true;
};
