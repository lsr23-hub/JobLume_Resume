import { AlertTriangle, Save } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { useSavesSession } from "@/hooks/useSavesSession";
import { save } from "@/lib/saves/session";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * 磁盘同步的**全局**状态徽标。
 *
 * 为什么需要它：`SaveBar` 只挂在职业数据库页，于是在**简历编辑器**里写盘失败时
 * 用户什么也看不到（改前更糟：连续失败到上限后只 `console.warn` 一句就彻底安静了）。
 *
 * **两个用途，同一个入口**：
 *
 * 1. **全局的保存入口** —— 保存栏只挂在职业数据库页，而写盘时机里有一个是"点立即保存"。
 *    没有这个入口的话，在简历 / 岗位页改完东西根本点不到保存（只能靠切用户或离开时兜住）
 * 2. **写盘失败的全局可见性** —— 失败与"有未保存改动"都用它显示
 *
 * **干净时不出现**：一个永远绿色的徽标是噪音，用户很快就会当它不存在，真出事时反而看不见。
 * `local-only`（本次部署没有磁盘存档）也不显示 —— 那是部署形态不是故障，一次会话里不会变。
 *
 * 点一下就是保存（失败时也是重试 —— 同一条路径）。
 */
export const SyncStatusBadge = () => {
  const t = useTranslations();
  const session = useSavesSession();

  // 干净、或还不知道能不能存（`loading`）、或本次部署根本没有磁盘存档（`local-only`）
  // 时都不出现 —— 一个常驻的徽标会变成人人无视的噪音
  if (session.phase !== "ready") return null;
  const dirty = session.dirtyOps.length;
  if (!session.error && dirty === 0) return null;

  const failed = Boolean(session.error);
  const label = failed
    ? t("sync.failed")
    : t("profile.save.unsavedCount", { count: dirty });

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void save()}
            className={
              failed
                ? "h-8 gap-1.5 px-2 text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
                : "h-8 gap-1.5 px-2 text-primary hover:text-primary/80"
            }
          >
            {failed ? <AlertTriangle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            <span className="hidden text-xs lg:inline">{label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="font-medium">{label}</p>
          {/* 服务端原文比一句"失败了"有用得多（例如"内容超过 4194304 字节上限"） */}
          {session.error && (
            <p className="mt-1 break-all opacity-80">{session.error}</p>
          )}
          <p className="mt-1 opacity-80">{t("sync.retryHint")}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default SyncStatusBadge;
