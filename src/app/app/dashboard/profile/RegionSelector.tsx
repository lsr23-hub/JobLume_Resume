import { useMemo } from "react";
import { useTranslations } from "@/i18n/compat/client";
import { CHINA_REGIONS } from "@/config/chinaRegions";
import { joinRegion, splitRegion } from "@/lib/region";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export const RegionSelector = ({ value, onChange }: Props) => {
  const t = useTranslations("profile");
  const { province, city, district } = useMemo(() => splitRegion(value), [value]);

  const cities = useMemo(
    () => CHINA_REGIONS.find((p) => p.name === province)?.cities ?? [],
    [province]
  );
  const districts = useMemo(
    () => cities.find((c) => c.name === city)?.districts ?? [],
    [cities, city]
  );

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{t("basic.location")}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          value={province || undefined}
          onValueChange={(next) => {
            const list = CHINA_REGIONS.find((p) => p.name === next)?.cities ?? [];
            // 换省时把市 / 区县重置为新省的第一项，避免留下上一个省的残留
            const firstCity = list[0];
            onChange(joinRegion(next, firstCity?.name ?? "", firstCity?.districts[0] ?? ""));
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
          onValueChange={(next) => {
            const list = cities.find((c) => c.name === next)?.districts ?? [];
            onChange(joinRegion(province, next, list[0] ?? ""));
          }}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={t("basic.selectCity")} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {cities.map((c) => (
              <SelectItem key={c.name} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 港澳台等无区县数据的地方，第三级禁用而不是给一个空列表 */}
        <Select
          value={district || undefined}
          disabled={districts.length === 0}
          onValueChange={(next) => onChange(joinRegion(province, city, next))}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={t("basic.selectDistrict")} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {districts.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">{t("basic.locationNote")}</p>
    </div>
  );
};
