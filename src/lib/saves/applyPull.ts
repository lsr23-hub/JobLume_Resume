import type { CareerProfile } from "@/types/profile";
import type { ResumeData } from "@/types/resume";
import type { JobTarget } from "@/types/jobTarget";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { useJobTargetStore } from "@/store/useJobTargetStore";
import { useResumeStore } from "@/store/useResumeStore";
import type { PullItem } from "./reconcile";

/**
 * 把**对账的拉取结果**写回三个 store。S4「启动读回」真正落地的那一步。
 *
 * 单独成文件而不是放进 `session.ts`：那边刻意不 import 任何 store（这样脏集计算与
 * 对账这两半能脱离浏览器直接测），而这里必须碰 store。分开之后两边的边界很清楚。
 *
 * ⚠️ **必须走各 store 的公开 action**（`replaceProfile` / `replaceResumes` /
 * `replaceTargets`），不能 `setState`。理由与备份导入那边同一条：`setState` 不经过
 * 收口层，只改别名、不进 `byUser`，而持久化切片只有 `byUser` —— 拉回来的东西刷新即丢。
 */
export const applyPull = (userId: string, pull: PullItem[]): void => {
  if (pull.length === 0) return;

  // 先把三份切片各复制一份，最后只写**改动过的那几个** ——
  // 没动过的集合也走一次 replace 的话，会平白产生一批"内容没变但引用变了"的写入
  const resumes = { ...(useResumeStore.getState().byUser[userId] ?? {}) };
  const targets = { ...(useJobTargetStore.getState().targetsByUser[userId] ?? {}) };
  let profile: CareerProfile | null = null;
  let resumesTouched = false;
  let targetsTouched = false;

  for (const item of pull) {
    if (item.kind === "profile") {
      profile = item.data as CareerProfile;
    } else if (item.kind === "resume" && item.id) {
      resumes[item.id] = item.data as ResumeData;
      resumesTouched = true;
    } else if (item.kind === "jd" && item.id) {
      targets[item.id] = item.data as JobTarget;
      targetsTouched = true;
    }
  }

  if (profile) useCareerProfileStore.getState().replaceProfile(profile);
  if (resumesTouched) useResumeStore.getState().replaceResumes(resumes);
  if (targetsTouched) useJobTargetStore.getState().replaceTargets(targets);
};

export default applyPull;
