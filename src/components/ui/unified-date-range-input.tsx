import { useState } from "react";
import { Checkbox, DatePicker } from "antd";
import type { Dayjs } from "dayjs";
import { useTranslations } from "@/i18n/compat/client";
import { cn } from "@/lib/utils";
import { MONTH_FORMAT, isPresent, parseDayjs, presentToken } from "@/lib/dayjsValue";

interface UnifiedDateRangeInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  /** 显示「至今」勾选框。没开的调用方（如简历编辑器）由外部开关负责写入 */
  showPresentSwitch?: boolean;
}

/** 与 `editor/Field.tsx` 的拆分逻辑共用同一个分隔符，改这里要同步改那边 */
const SEPARATOR = " - ";

const splitRange = (raw: string): [string, string] => {
  if (!raw) return ["", ""];
  if (raw.includes(SEPARATOR)) {
    const [start, end] = raw.split(SEPARATOR);
    return [start, end ?? ""];
  }
  // 容忍半角/全角连字符等其它写法
  const match = raw.match(/^([^\s]+)\s*(?:-|–|—)\s*(.+)$/);
  if (match) return [match[1].trim(), match[2].trim()];
  return [raw, ""];
};

/**
 * 月份区间选择器（antd RangePicker，`picker="month"`）。
 *
 * 输出固定为 `2021/07 - 2024/12` —— `editor/Field.tsx` 在 `" - "` 上拆分来
 * 切换「至今」，格式变了那边就废了。
 *
 * 已处于「至今」时结束一侧置灰：那是外部开关的状态，不该在面板里被改掉。
 */
export function UnifiedDateRangeInput({
  value,
  onChange,
  placeholder,
  className,
  showPresentSwitch,
}: UnifiedDateRangeInputProps) {
  const t = useTranslations();
  const present = isPresent(value);
  const token = presentToken(value) ?? t("field.toPresent");
  const [rawStart, rawEnd] = splitRange(value);

  // 面板里刚点了一半时父级还没回传，用本地状态兜住半截选择
  const [pending, setPending] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const selected: [Dayjs | null, Dayjs | null] = pending ?? [
    parseDayjs(rawStart, "month"),
    present ? null : parseDayjs(rawEnd, "month"),
  ];

  const emit = (dates: [Dayjs | null, Dayjs | null] | null) => {
    const [start, end] = dates ?? [null, null];
    const startStr = start ? start.format(MONTH_FORMAT) : "";
    const endStr = present ? token : end ? end.format(MONTH_FORMAT) : "";

    if (!startStr && !endStr) return onChange("");
    if (startStr && !endStr) return onChange(startStr);
    return onChange(`${startStr}${SEPARATOR}${endStr}`);
  };

  const togglePresent = (checked: boolean) => {
    const startStr = selected[0] ? selected[0].format(MONTH_FORMAT) : "";
    setPending(null);
    onChange(checked ? [startStr, token].filter(Boolean).join(SEPARATOR) : startStr);
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <DatePicker.RangePicker
        picker="month"
        value={selected}
        format={MONTH_FORMAT}
        placeholder={placeholder ? [placeholder, placeholder] : undefined}
        disabled={present ? [false, true] : undefined}
        // 只有起始时结束一侧本就为空，不声明 allowEmpty 会报 "disabled with empty value"
        allowEmpty={[true, true]}
        allowClear
        style={{ flex: 1, minWidth: 0 }}
        onCalendarChange={(dates) => {
          const next = (dates ?? [null, null]) as [Dayjs | null, Dayjs | null];
          setPending(next);
          emit(next);
        }}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      />

      {showPresentSwitch && (
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={present} onChange={(e) => togglePresent(e.target.checked)} />
          {t("field.toPresent")}
        </label>
      )}
    </div>
  );
}
