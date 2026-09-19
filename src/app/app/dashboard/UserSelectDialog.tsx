import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, UserRound } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { useResolvedImage } from "@/hooks/useResolvedImage";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** 一张用户卡：证件照铺满，底部渐变遮罩上写名字 —— 与「我的简历」卡片同一套视觉语言 */
const UserCard = ({
  userId,
  index,
  active,
  onPick,
}: {
  userId: string;
  index: number;
  active: boolean;
  onPick: () => void;
}) => {
  const t = useTranslations("userSelect");
  const profile = useCareerProfileStore((s) => s.profiles[userId]);
  const photo = useResolvedImage(profile?.basic?.photo);
  const name = profile?.basic?.name?.trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.08 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Card
        className={cn(
          "group border transition-all duration-200 aspect-[3/4] flex flex-col overflow-hidden cursor-pointer",
          "hover:border-primary/40 hover:shadow-lg",
          active && "ring-2 ring-primary ring-offset-2"
        )}
        onClick={onPick}
        role="button"
        aria-label={name || t("unnamed")}
      >
        <CardContent className="p-0 flex-1 relative bg-muted overflow-hidden">
          {photo ? (
            <img
              src={photo}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <UserRound className="h-12 w-12 opacity-40" />
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[55%] bg-gradient-to-t from-white via-white/90 to-transparent dark:from-gray-950 dark:via-gray-950/90" />
          <div className="absolute inset-x-0 bottom-0 px-4 pb-3 pt-12 z-10">
            <span className="text-[15px] font-semibold truncate text-foreground drop-shadow-sm block">
              {name || t("unnamed")}
            </span>
            <span className="text-[11px] text-muted-foreground mt-0.5 font-medium block truncate">
              {profile?.basic?.title?.trim() || t("noTitle")}
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

interface UserSelectDialogProps {
  /**
   * 受控开关。
   *
   * **不传**＝阻塞模式：`RequireUser` 在没有当前用户时渲染它，永远开着、
   * 不给关闭按钮，必须选一个才能进板块。
   * **传了**＝可关闭：侧边栏的「当前用户」入口用它来切人。
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * 用户选择弹窗。两种用法见 `UserSelectDialogProps` 的注释。
 */
export const UserSelectDialog = ({ open, onOpenChange }: UserSelectDialogProps = {}) => {
  const t = useTranslations("userSelect");
  const userIds = useCareerProfileStore((s) => Object.keys(s.profiles));
  const currentUserId = useCareerProfileStore((s) => s.currentUserId);
  const createUser = useCareerProfileStore((s) => s.createUser);
  const setCurrentUser = useCareerProfileStore((s) => s.setCurrentUser);
  const [busy, setBusy] = useState(false);

  const dismissible = onOpenChange !== undefined;

  const handleCreate = () => {
    if (busy) return;
    setBusy(true);
    // 新建即选中：用户接下来会去职业数据库填名字和证件照，卡片随之更新
    createUser();
    setBusy(false);
    if (dismissible) onOpenChange?.(false);
  };

  const handlePick = (userId: string) => {
    setCurrentUser(userId);
    if (dismissible) onOpenChange?.(false);
  };

  return (
    <Dialog open={dismissible ? open : true} onOpenChange={dismissible ? onOpenChange : undefined}>
      <DialogContent
        hideClose={!dismissible}
        className={cn(
          "max-w-[900px] w-[95vw] max-h-[85vh] overflow-y-auto p-0",
          "bg-card/95 dark:bg-gray-950/95 backdrop-blur-2xl border-white/20 dark:border-white/10 shadow-2xl rounded-[2rem]"
        )}
      >
        <div className="px-8 pt-7 pb-2">
          <DialogTitle className="text-2xl font-extrabold tracking-tight">
            {t("title")}
          </DialogTitle>
          <p className="mt-1.5 text-sm text-muted-foreground">{t("description")}</p>
        </div>

        <div className="px-8 pb-8">
          {userIds.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center space-y-2">
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            <AnimatePresence>
              {userIds.map((id, index) => (
                <UserCard
                  key={id}
                  userId={id}
                  index={index}
                  active={id === currentUserId}
                  onPick={() => handlePick(id)}
                />
              ))}
            </AnimatePresence>

            {/* 与「我的简历」的空位新建卡同构 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: userIds.length * 0.08 }}
              whileTap={{ scale: 0.98 }}
            >
              <Card
                className={cn(
                  "aspect-[3/4] border border-dashed cursor-pointer transition-all duration-200 flex flex-col",
                  "hover:border-gray-400 hover:bg-muted",
                  "dark:hover:border-primary dark:hover:bg-primary/10"
                )}
                onClick={handleCreate}
                role="button"
                aria-label={t("create")}
              >
                <CardContent className="flex-1 p-0 text-center flex flex-col items-center justify-center gap-3">
                  <motion.div
                    className="p-3 rounded-full bg-muted dark:bg-primary/10"
                    whileHover={{ rotate: 90 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Plus className="h-6 w-6 text-gray-600 dark:text-primary" />
                  </motion.div>
                  <span className="text-sm font-medium px-3">{t("create")}</span>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserSelectDialog;
