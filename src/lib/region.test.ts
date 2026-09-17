import { describe, expect, it } from "vitest";
import { CHINA_REGIONS } from "@/config/chinaRegions";
import { joinRegion, splitRegion } from "./region";

describe("joinRegion", () => {
  it("普通省份拼成三级", () => {
    expect(joinRegion("广东省", "深圳市", "南山区")).toBe("广东省 深圳市 南山区");
  });

  it("直辖市不重复省级与市级", () => {
    expect(joinRegion("北京市", "北京市", "东城区")).toBe("北京市 东城区");
  });

  it("缺级时不留多余空格", () => {
    expect(joinRegion("广东省", "深圳市", "")).toBe("广东省 深圳市");
    expect(joinRegion("", "", "")).toBe("");
  });
});

describe("splitRegion", () => {
  it("三级值可逆", () => {
    const value = joinRegion("广东省", "深圳市", "南山区");
    expect(splitRegion(value)).toEqual({
      province: "广东省",
      city: "深圳市",
      district: "南山区",
    });
  });

  it("直辖市的省市同名值可逆", () => {
    const value = joinRegion("北京市", "北京市", "东城区");
    expect(splitRegion(value)).toEqual({
      province: "北京市",
      city: "北京市",
      district: "东城区",
    });
  });

  it("兼容两级旧数据", () => {
    expect(splitRegion("广东省 深圳市")).toEqual({
      province: "广东省",
      city: "深圳市",
      district: "",
    });
  });

  it("认不出省份时整串当作城市，不丢内容", () => {
    expect(splitRegion("某个不存在的地方")).toEqual({
      province: "",
      city: "某个不存在的地方",
      district: "",
    });
  });

  it("省名互为前缀时不会认错（吉林省 / 吉林市）", () => {
    expect(splitRegion("吉林省 吉林市 昌邑区")).toEqual({
      province: "吉林省",
      city: "吉林市",
      district: "昌邑区",
    });
  });

  it("每一级都能往返", () => {
    for (const p of CHINA_REGIONS) {
      for (const c of p.cities) {
        const d = c.districts[0] ?? "";
        expect(splitRegion(joinRegion(p.name, c.name, d))).toEqual({
          province: p.name,
          city: c.name,
          district: d,
        });
      }
    }
  });
});
