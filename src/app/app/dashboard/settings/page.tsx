import { useTranslations } from "@/i18n/compat/client";
import BackupPanel from "./BackupPanel";

/**
 * 通用设置。
 *
 * 原先这里还有一张「同步目录」卡片（File System Access API，手动选一个文件夹
 * 把简历写进去）。已随 `saves/<userId>/` 成为唯一真相源一并退役 —— 那份职责
 * 由存档目录接管，而且它只覆盖简历、只在 Chromium 可用、权限每次会话失效。
 */
const SettingsPage = () => {
  const t = useTranslations();

  return (
    <div className="w-full max-w-[1600px] mx-auto py-8 px-6 lg:px-8">
      <div className="flex flex-col space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {t("dashboard.settings.title")}
          </h2>
        </div>

        <div className="space-y-6">
          <BackupPanel />
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
