import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { useResumeStore } from "@/store/useResumeStore";
import { useJobTargetStore } from "@/store/useJobTargetStore";

/**
 * 彻底删除一个用户。
 *
 * 为什么收在一个 hook 里，而不是让弹窗挨个调三个 store：删除要同时清掉三处
 * 派生物 —— 档案本身、他名下的简历、他名下的投递目标。漏掉任何一处都会留下
 * 永远够不着、也删不掉的孤儿数据（岗位尤其隐蔽：别人看不到它，但它还在盘上）。
 *
 * 放在组件层而不是某个 store 里，是为了不引入环：档案 store 不 import 另外两个
 * （简历/目标 store 都单向依赖它），让它反向依赖就成环了。
 */
export const useDeleteUser = () => {
  const removeUser = useCareerProfileStore((s) => s.removeUser);
  // 两个 store 的 action 同名（各自清各自那份），取值时得分开叫
  const purgeResumes = useResumeStore((s) => s.purgeUser);
  const purgeTargets = useJobTargetStore((s) => s.purgeUser);

  return (userId: string) => {
    // 先清派生物再删档案：档案一没，currentUserId 就置空了，
    // 后面两步虽然不依赖它，但顺序反了会有一个瞬间「用户已不存在、数据还在」
    purgeResumes(userId);
    purgeTargets(userId);
    removeUser(userId);
  };
};

export default useDeleteUser;
