import { DatePicker } from "antd";
import dayjs from "dayjs";
import { useTranslations } from "@/i18n/compat/client";
import { Label } from "@/components/ui/label";
import { DAY_FORMAT, parseDayjs } from "@/lib/dayjsValue";

/** 生日可选范围 */
const FROM_YEAR = 1950;
/** 打开面板时默认停在哪一年 —— 不然要从当前年份逐月往回翻几十年 */
const DEFAULT_PANEL = dayjs(new Date(1995, 0, 1));

/**
 * 生日选择器（antd DatePicker），精确到日。
 *
 * 存回数据层的格式固定为 `YYYY/MM/DD`，与 `parseDayjs` 的读取保持对称。
 * 明暗主题、语言、主色由 `providers.tsx` 的 ConfigProvider 统一控制。
 */
export const BirthdayPicker = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => {
  const t = useTranslations("profile");
  const today = dayjs();

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{t("basic.birthDate")}</Label>

      <DatePicker
        value={parseDayjs(value, "day")}
        onChange={(date) => onChange(date ? date.format(DAY_FORMAT) : "")}
        format={DAY_FORMAT}
        placeholder={t("basic.birthDatePlaceholder")}
        // 只在没有值时用兜底年月：有值时 antd 会以 defaultPickerValue 为准，
        // 打开面板会停在 1995 年而不是用户自己的生日
        defaultPickerValue={value ? undefined : DEFAULT_PANEL}
        disabledDate={(date) => date.year() < FROM_YEAR || date.isAfter(today, "day")}
        style={{ width: "100%" }}
      />

      <p className="text-xs text-muted-foreground">{t("basic.birthDateNote")}</p>
    </div>
  );
};
