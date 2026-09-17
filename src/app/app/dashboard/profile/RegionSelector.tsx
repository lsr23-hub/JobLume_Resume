import { useMemo } from "react";
import { useTranslations } from "@/i18n/compat/client";
import { CHINA_REGIONS } from "@/config/chinaRegions";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * 把「省 市」拼成一个字符串。
 *
 * 直辖市（北京市/上海市/天津市/重庆市）省市同名，只留一个，
 * 否则会得到「北京市 北京市」。
 */
export const joinRegion = (province: string, city: string): string => {
  if (!province) return city;
  if (!city || city === province) return province;
  return `${province} ${city}`;
};

/** 从已存字符串里反解出省市。解析不出时把整串当作城市 */
export const splitRegion = (value: string): { province: string; city: string } => {
  if (!value) return { province: "", city: "" };

  const trimmed = value.trim();
  const province = CHINA_REGIONS.find((p) => trimmed.startsWith(p.name));
  if (!province) return { province: "", city: trimmed };

  const rest = trimmed.slice(province.name.length).trim();
  return { province: province.name, city: rest || province.name };
};

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export const RegionSelector = ({ value, onChange }: Props) => {
  const t = useTranslations("profile");
  const { province, city } = useMemo(() => splitRegion(value), [value]);

  const cities = useMemo(
    () => CHINA_REGIONS.find((p) => p.name === province)?.cities ?? [],
    [province]
  );

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{t("basic.location")}</Label>
      <div className="flex gap-2">
        <Select
          value={province || undefined}
          onValueChange={(next) => {
            const list = CHINA_REGIONS.find((p) => p.name === next)?.cities ?? [];
            // 换省时把市重置为该省的第一项，避免留下上一个省的市
            onChange(joinRegion(next, list[0] ?? ""));
          }}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={t("basic.selectProvince")} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {CHINA_REGIONS.map((p) => (
              <SelectItem key={p.name} value={p.name}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={city || undefined}
          disabled={!province}
          onValueChange={(next) => onChange(joinRegion(province, next))}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={t("basic.selectCity")} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {cities.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">{t("basic.locationNote")}</p>
    </div>
  );
};
