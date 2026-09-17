import { DatePicker } from "antd";
import { MONTH_FORMAT, isPresent, parseDayjs } from "@/lib/dayjsValue";

interface UnifiedDateInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  isRequired?: boolean;
  className?: string;
}

/**
 * 单个月份选择器（antd DatePicker，`picker="month"`）。
 *
 * 取值格式 `YYYY/MM` —— 与简历层 `startDate` / `endDate` 的既有格式一致，
 * 所以调用方（`editor/Field.tsx`）无需改动。
 *
 * 值形如「至今」时（该条目仍在进行中），控件置灰：这是从别处推导出来的
 * 状态，不该在这里被改掉。
 */
export function UnifiedDateInput({
  value,
  onChange,
  placeholder,
  isRequired,
  className,
}: UnifiedDateInputProps) {
  const present = isPresent(value);

  return (
    <DatePicker
      picker="month"
      value={present ? null : parseDayjs(value, "month")}
      onChange={(date) => onChange(date ? date.format(MONTH_FORMAT) : "")}
      format={MONTH_FORMAT}
      placeholder={placeholder}
      disabled={present}
      aria-required={isRequired}
      style={{ width: "100%" }}
      className={className}
    />
  );
}
