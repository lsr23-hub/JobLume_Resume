import { AlertTriangle } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { useSavesSyncStatus } from "@/hooks/useSavesSyncStatus";
import { flushNow } from "@/hooks/useSavesMirror";
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
 * **只在出问题时出现。** `idle` / `syncing` 是常态，不占地方 —— 一个永远绿色的徽标
 * 是噪音，用户很快就会当它不存在，真出事时反而看不见。
 *
 * `disabled`（本次部署没有磁盘存档）也**不**在这里显示：那是部署形态而不是故障，
 * 一次会话里不会变，职业数据库页的保存栏已经说清楚了。把它常驻在编辑器头部只会
 * 变成一条人人无视的横幅。
 *
 * 点一下就是重试（与保存栏的「保存」走同一条路径 `flushNow`）。
 */
export const SyncStatusBadge = () => {
  const t = useTranslations();
  const status = useSavesSyncStatus();

  if (status.phase !== "failed" && status.phase !== "stopped") return null;

  const label = status.phase === "stopped" ? t("sync.stopped") : t("sync.retrying");

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => flushNow()}
            className="h-8 gap-1.5 px-2 text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
          >
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden text-xs lg:inline">{label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="font-medium">{label}</p>
          {/* 服务端原文比一句"失败了"有用得多（例如"内容超过 4194304 字节上限"） */}
          {status.lastError && (
            <p className="mt-1 break-all opacity-80">{status.lastError}</p>
          )}
          <p className="mt-1 opacity-80">{t("sync.retryHint")}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default SyncStatusBadge;
