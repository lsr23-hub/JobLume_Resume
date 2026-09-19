import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { useResumeStore } from "@/store/useResumeStore";
import { useJobTargetStore } from "@/store/useJobTargetStore";

/**
 * 彻底删除一个用户。
 *
 * 为什么收在一个 hook 里，而不是让弹窗挨个调三个 store：删除要同时清掉三处
 * 派生物 —— 档案本身、他名下的简历、他在每条岗位上的分析。漏掉任何一处都会
 * 留下永远够不着、也删不掉的孤儿数据（岗位的分析尤其隐蔽：岗位还在，只是
 * 那个用户已经不在了）。
 *
 * 放在组件层而不是某个 store 里，是为了不引入环：档案 store 不 import 另外两个
 * （简历/目标 store 都单向依赖它），让它反向依赖就成环了。
 */
export const useDeleteUser = () => {
  const removeUser = useCareerProfileStore((s) => s.removeUser);
  const purgeUser = useResumeStore((s) => s.purgeUser);
  const purgeUserAnalyses = useJobTargetStore((s) => s.purgeUserAnalyses);

  return (userId: string) => {
    // 先清派生物再删档案：档案一没，currentUserId 就置空了，
    // 后面两步虽然不依赖它，但顺序反了会有一个瞬间「用户已不存在、数据还在」
    purgeUser(userId);
    purgeUserAnalyses(userId);
    removeUser(userId);
  };
};

export default useDeleteUser;
