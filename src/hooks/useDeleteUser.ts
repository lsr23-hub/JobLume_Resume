import { toast } from "sonner";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { useResumeStore } from "@/store/useResumeStore";
import { useJobTargetStore } from "@/store/useJobTargetStore";
import { useTranslations } from "@/i18n/compat/client";
import { discardUser } from "@/hooks/useSavesMirror";

/**
 * 彻底删除一个用户。
 *
 * 为什么收在一个 hook 里，而不是让弹窗挨个调三个 store：删除要同时清掉三处
 * 派生物 —— 档案本身、他名下的简历、他名下的投递目标。漏掉任何一处都会留下
 * 永远够不着、也删不掉的孤儿数据（岗位尤其隐蔽：别人看不到它，但它还在盘上）。
 *
 * 放在组件层而不是某个 store 里，是为了不引入环：档案 store 不 import 另外两个
 * （简历/目标 store 都单向依赖它），让它反向依赖就成环了。
 *
 * **磁盘上的目录也要删。** 只清 store 的话 `saves/<userId>/` 会永久留着 ——
 * 而启动对账（S4）一上线，那个用户会从磁盘上复活。删除是用户的显式动作，
 * 留一份"删了还在"的副本正是"删除没删掉"那类抱怨的来源。
 */
export const useDeleteUser = () => {
  const t = useTranslations("userSelect");
  const removeUser = useCareerProfileStore((s) => s.removeUser);
  // 两个 store 的 action 同名（各自清各自那份），取值时得分开叫
  const purgeResumes = useResumeStore((s) => s.purgeUser);
  const purgeTargets = useJobTargetStore((s) => s.purgeUser);

  return async (userId: string) => {
    // 先清派生物再删档案：档案一没，currentUserId 就置空了，
    // 后面两步虽然不依赖它，但顺序反了会有一个瞬间「用户已不存在、数据还在」
    purgeResumes(userId);
    purgeTargets(userId);
    removeUser(userId);

    // ⚠️ 顺序要紧：先把镜像里这个用户的残留收干净（等他正在飞的那批写盘落地），
    // 再去删目录。反过来的话，那批写盘会在目录删掉之后把文件写回来 —— 目录复活。
    await discardUser(userId);

    // 本地已经删干净了才去动磁盘。磁盘这步失败**不能**让本地回滚 ——
    // 那会让用户以为没删掉；如实告诉他「本地删了、磁盘没删掉」更准确，也可以重试。
    try {
      const res = await fetch("/api/saves", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, scope: "user" }),
      });
      // 404 = 本次部署没有磁盘存档，那就没有目录要删，不是错误
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      toast.error(t("deleteDiskFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };
};

export default useDeleteUser;
