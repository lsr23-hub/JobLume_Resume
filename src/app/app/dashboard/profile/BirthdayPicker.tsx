import { useState } from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** 生日可选范围 */
const FROM_YEAR = 1950;

/** 把 `1996/03`、`1996-03`、`1996.03`、`1996年3月` 解析成 Date */
const parseBirthday = (value: string): Date | undefined => {
  if (!value) return undefined;

  const m = value.match(/(\d{4})\s*[.\-/年]?\s*(\d{1,2})?/);
  if (!m) return undefined;

  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) : 1;
  if (year < FROM_YEAR || year > 2200 || month < 1 || month > 12) return undefined;

  return new Date(year, month - 1, 1);
};

/**
 * 生日选择器。
 *
 * 只取到「年月」—— 简历上的生日写到月份即可，精确到日既无必要也多一步操作。
 * 日历带年/月下拉，避免从当前年份逐月往回翻几十年。
 */
export const BirthdayPicker = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => {
  const t = useTranslations("profile");
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
              {selected
                ? `${selected.getFullYear()}/${String(selected.getMonth() + 1).padStart(2, "0")}`
                : t("basic.birthDatePlaceholder")}
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
            selected={selected}
            defaultMonth={selected ?? new Date(1995, 0)}
            captionLayout="dropdown"
            fromYear={FROM_YEAR}
            toYear={now.getFullYear()}
            onSelect={(date) => {
              if (!date) return;
              onChange(
                `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}`
              );
              setOpen(false);
            }}
            classNames={{
              // shadcn 的 Calendar 没给 dropdown 布局写样式，这里补上
              caption_dropdowns: "flex gap-2 justify-center items-center",
              dropdown:
                "rounded-md border border-input bg-background px-2 py-1 text-sm",
              dropdown_month: "[&>span]:hidden",
              dropdown_year: "[&>span]:hidden",
            }}
          />
        </PopoverContent>
      </Popover>

      <p className="text-xs text-muted-foreground">{t("basic.birthDateNote")}</p>
    </div>
  );
};
