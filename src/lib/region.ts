import { CHINA_REGIONS } from "@/config/chinaRegions";

/**
 * 省 / 市 / 区县三级与单一字符串之间的互转。
 *
 * 数据库里 `basic.location` 是一个字符串（简历层只认字符串），
 * 界面要的是三个下拉。两个函数互为逆运算 —— 解析不出的内容原样保留，
 * 不丢用户已填的地址。
 */

/**
 * 拼成 `省 市 区县`。
 *
 * 直辖市（北京市/上海市/天津市/重庆市）市与省同名，只留一个，
 * 否则会得到「北京市 北京市 东城区」。
 */
export const joinRegion = (province: string, city: string, district: string): string => {
  const parts: string[] = [];
  if (province) parts.push(province);
  if (city && city !== province) parts.push(city);
  if (district) parts.push(district);
  return parts.join(" ");
};

export interface ParsedRegion {
  province: string;
  city: string;
  district: string;
}

/**
 * 反解出三级。
 *
 * 兼容两级旧数据：「广东省 深圳市」解出区县为空。
 * 认不出省份时整串当作城市保留，宁可显示得不规整，也不清空用户填过的内容。
 */
export const splitRegion = (value: string): ParsedRegion => {
  const trimmed = value.trim();
  if (!trimmed) return { province: "", city: "", district: "" };

  const province = CHINA_REGIONS.find((p) => trimmed.startsWith(p.name));
  if (!province) return { province: "", city: trimmed, district: "" };

  const rest = trimmed.slice(province.name.length).trim();
  if (!rest) return { province: province.name, city: province.name, district: "" };

  const city = province.cities.find((c) => rest.startsWith(c.name));
  if (city) {
    return {
      province: province.name,
      city: city.name,
      district: rest.slice(city.name.length).trim(),
    };
  }

  // 直辖市：值形如「北京市 东城区」，市级与省级同名被省略，剩下的就是区县
  if (province.cities.length === 1 && province.cities[0].name === province.name) {
    return { province: province.name, city: province.name, district: rest };
  }

  return { province: province.name, city: rest, district: "" };
};
