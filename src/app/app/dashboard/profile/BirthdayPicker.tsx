import { useState } from "react";
import { enUS, zhCN } from "date-fns/locale";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { useLocale, useTranslations } from "@/i18n/compat/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** 生日可选范围 */
const FROM_YEAR = 1950;

/** 只取数字，兼容 `1996/03/15`、`1996.03`、`1996年3月` 等历史写法 */
const parseBirthday = (value: string): Date | undefined => {
  const nums = (value.match(/\d+/g) ?? []).map(Number);
  if (nums.length === 0) return undefined;

  const [year, month = 1, day = 1] = nums;
  if (year < FROM_YEAR || year > 2200 || month < 1 || month > 12) return undefined;

  // 夹到当月天数，避免 2/31 这类输入滚到下个月
  const lastDay = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(Math.max(day, 1), lastDay));
};

const formatBirthday = (date: Date): string =>
  `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(
    date.getDate()
  ).padStart(2, "0")}`;

/**
 * 生日选择器，精确到日。
 *
 * 日历带年 / 月下拉，避免从当前年份逐月往回翻几十年。
 */
export const BirthdayPicker = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => {
  const t = useTranslations("profile");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const selected = parseBirthday(value);
  const now = new Date();

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{t("basic.birthDate")}</Label>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start font-normal",
              !selected && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            <span className="flex-1 truncate text-left">
              {selected ? formatBirthday(selected) : t("basic.birthDatePlaceholder")}
            </span>
            {selected && (
              <X
                className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
              />
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={locale === "en" ? enUS : zhCN}
            selected={selected}
            defaultMonth={selected ?? new Date(1995, 0, 1)}
            captionLayout="dropdown"
            fromYear={FROM_YEAR}
            toYear={now.getFullYear()}
            onSelect={(date) => {
              if (!date) return;
              onChange(formatBirthday(date));
              setOpen(false);
            }}
            classNames={{
              // react-day-picker 自带的 style.css 没有引入，它靠 CSS 隐藏的两处
              // 会变成可见文本：一是 caption 的屏幕阅读器副本（「1995年1月」），
              // 二是每个 select 上覆盖用的装饰层（caption_label）。
              // 不处理就会看到两排月份 / 年份。
              vhidden: "sr-only",
              caption_label: "hidden",
              caption_dropdowns: "flex gap-2 justify-center items-center",
              dropdown: "rounded-md border border-input bg-background px-2 py-1 text-sm",
            }}
          />
        </PopoverContent>
      </Popover>

      <p className="text-xs text-muted-foreground">{t("basic.birthDateNote")}</p>
    </div>
  );
};
