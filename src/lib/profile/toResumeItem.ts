import type { ProfileEntity } from "@/types/profile";
import type { CustomItem, Education, Experience, Project } from "@/types/resume";
import { splitDateRange } from "./entityUtils";

/**
 * 数据库条目 → 简历条目。
 *
 * 从 `materialize` 里抽出来共用：编辑器里「从职业数据库添加」走的是同一套字段映射，
 * 各写一份的话，同一条经历会因为「生成时带进来的」还是「事后补加的」
 * 而长得不一样。
 *
 * **单向**：简历是数据库的一份副本，这里只读不写。
 * 在简历里改内容不会回流到数据库，反之亦然 —— 两边从此各走各的。
 */

export const entityToEducation = (entity: ProfileEntity): Education => {
  const [startDate, endDate] = splitDateRange(entity.dateRange);
  return {
    id: entity.id,
    school: entity.title,
    major: entity.subtitle,
    degree: entity.degree ?? "",
    startDate,
    endDate,
    gpa: entity.gpa ?? "",
    description: entity.description,
    visible: true,
  };
};

export const entityToExperience = (entity: ProfileEntity): Experience => ({
  id: entity.id,
  company: entity.title,
  position: entity.subtitle,
  date: entity.dateRange,
  details: entity.description,
  visible: true,
});

export const entityToProject = (entity: ProfileEntity): Project => ({
  id: entity.id,
  name: entity.title,
  role: entity.subtitle,
  date: entity.dateRange,
  description: entity.description,
  visible: true,
  link: entity.link,
  linkLabel: entity.linkLabel,
});

export const entityToCustomItem = (entity: ProfileEntity): CustomItem => ({
  id: entity.id,
  title: entity.title,
  subtitle: entity.subtitle,
  dateRange: entity.dateRange,
  description: entity.description,
  visible: true,
});
