import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";

import {
  createEmptyProfile,
  type CareerProfile,
  type EntityType,
  type ProfileEntity,
  type SkillGroup,
} from "@/types/profile";
import type { BasicInfo, CustomFieldType, PhotoConfig } from "@/types/resume";
import { DEFAULT_SECTION_ORDER, PRESET_BASIC_FIELDS } from "@/config/sections";
import { DEFAULT_FIELD_ORDER } from "@/config/constants";
import { parseDateRange } from "@/lib/profile/entityUtils";
import { generateUUID } from "@/utils/uuid";
import { needsCategorizing } from "@/lib/profile/categories";
import { reportHydrationFailure } from "@/store/persistGuard";

export const PROFILE_STORAGE_KEY = "career-profile-storage";

const DEFAULT_PHOTO_CONFIG: PhotoConfig = {
  width: 90,
  height: 120,
  borderRadius: "none",
  customBorderRadius: 0,
  visible: true,
};

const createEmptyBasic = (): BasicInfo => ({
  name: "",
  title: "",
  email: "",
  phone: "",
  location: "",
  birthDate: "",
  employementStatus: "",
  photo: "",
  photoConfig: { ...DEFAULT_PHOTO_CONFIG },
  icons: {
    email: "Mail",
    phone: "Phone",
    birthDate: "CalendarRange",
    employementStatus: "Briefcase",
    location: "MapPin",
  },
  fieldOrder: DEFAULT_FIELD_ORDER.map((f) => ({ ...f })),
  customFields: PRESET_BASIC_FIELDS.map((f: CustomFieldType) => ({ ...f })),
  githubKey: "",
  githubUseName: "",
  githubContributionsVisible: false,
  layout: "left",
});

/** 新建条目时的入参 —— id / order / 时间戳由 store 补全 */
export type NewEntity = Partial<Omit<ProfileEntity, "id" | "createdAt" | "updatedAt">> & {
  sectionId: string;
};

interface ProfileStore {
  profile: CareerProfile | null;

  /** 首次访问时惰性创建，避免在 store 初始化阶段调用 Date.now() */
  ensureProfile: () => CareerProfile;

  addEntity: (input: NewEntity) => string;
  updateEntity: (id: string, patch: Partial<ProfileEntity>) => void;
  removeEntity: (id: string) => void;
  /** 按给定 id 顺序重排某板块的条目 */
  reorderEntities: (sectionId: string, orderedIds: string[]) => void;

  addSkillGroup: (input: Omit<SkillGroup, "id" | "order">) => string;
  updateSkillGroup: (id: string, patch: Partial<SkillGroup>) => void;
  removeSkillGroup: (id: string) => void;

  /**
   * 批量写入自动归类的类别。
   *
   * 三条规则，都是为了「尊重人的输入、只补齐机器需要的东西」：
   * - **空位**：填上
   * - **已经是词表里的类别**：不动 —— 那是用户明确的、规范的选择，机器不该推翻
   * - **非空但不在词表里**（用户随手写的「计算机」「数据」）：**归一化**
   *
   * 第三条是实测补上的：档案里早就有手工标签时，只填空位等于这个功能对
   * 老用户完全不起作用，而标签会按各人随手写的字符串分裂 —— 写「计算机」的
   * 和写「互联网」的其实是同一类，却显示成两个标签。
   */
  applyCategories: (categories: Record<string, string>) => void;

  updateBasic: (patch: Partial<BasicInfo>) => void;
  setCertificateText: (certificateText: string) => void;
  /** 语言能力（纯文本多行），原为独立板块，现并入专业技能 */
  setLanguageText: (languageText: string) => void;
  setSelfEvaluationContent: (content: string) => void;

  /** 整库替换（导入备份时使用） */
  replaceProfile: (profile: CareerProfile) => void;
  resetProfile: () => void;
}

/** 写入失败（如配额超限）时不中断本次会话，只警告一次 */
const warnedKeys = new Set<string>();

const safeLocalStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch (error) {
      if (!warnedKeys.has(name)) {
        warnedKeys.add(name);
        console.warn(
          `[career-profile] 写入 localStorage 失败，改动仅在本会话内有效。`,
          error
        );
      }
    }
  },
  removeItem: (name) => localStorage.removeItem(name),
};

const withDerivedDates = (
  patch: Partial<ProfileEntity>
): Partial<ProfileEntity> => {
  if (patch.dateRange === undefined) return patch;
  const { endTimestamp, isCurrent } = parseDateRange(patch.dateRange);
  return { ...patch, endTimestamp, isCurrent };
};

/**
 * 补齐随版本新增的预设自定义字段。
 *
 * 「职位」「状态」原是一等字段，现改由自定义字段承载：把旧值搬到新字段并清空
 * 原字段，否则简历上会同时出现抬头和联系方式两份职位。
 * 只在确实缺字段时才重建对象，避免每次 mount 都触发一次写入。
 */
const syncBasicPresets = (profile: CareerProfile): CareerProfile => {
  const { customFields } = profile.basic;
  const missing = PRESET_BASIC_FIELDS.filter((p) => !customFields.some((f) => f.id === p.id));
  if (missing.length === 0) return profile;

  const carried: Record<string, string> = {
    title: profile.basic.title,
    status: profile.basic.employementStatus,
  };

  return {
    ...profile,
    basic: {
      ...profile.basic,
      title: "",
      employementStatus: "",
      // 按预设顺序重排，并保留预设之外的条目
      customFields: [
        ...PRESET_BASIC_FIELDS.map((preset) => {
          const current = customFields.find((f) => f.id === preset.id);
          return current ?? { ...preset, value: carried[preset.id] ?? preset.value };
        }),
        ...customFields.filter((f) => !PRESET_BASIC_FIELDS.some((p) => p.id === f.id)),
      ],
    },
  };
};

/**
 * 补齐 `certificateText`。
 *
 * 该字段是新增的（证书从图片列表改成了纯文本），存量数据库里没有。
 * 只在缺失时重建对象 —— 迁移不该让 SaveBar 变成「已保存」。
 *
 * 刻意**不删**旧的 `certificates` 数组：里面的 `idb:` 引用是那些图片在
 * IndexedDB 里唯一的线索，删了就再也找不回来了。
 */
/**
 * 把「语言能力」板块的存量条目迁进 `languageText`，并把条目删掉。
 *
 * 该板块已取消 —— 语言能力现在是「专业技能」板块下的一个纯文本小项，与证书同形态。
 * 与 `syncCertificateText` 的区别：那条只是补一个空字段，这条要**搬内容**，
 * 所以不能只在字段缺失时跑 —— 字段在了、旧条目还在，同样要迁。
 *
 * 内容不丢：条目的 title / subtitle / description 拼成一行文本。description 是
 * 富文本，去标签后并入。宁可让用户事后清理，也不要静默丢掉他填过的东西。
 */
const syncLanguageText = (profile: CareerProfile): CareerProfile => {
  const legacy = Object.values(profile.entities ?? {}).filter(
    (e) => e.sectionId === "languages" || e.type === ("languages" as ProfileEntity["type"])
  );
  const hasField = typeof (profile as Partial<CareerProfile>).languageText === "string";
  if (hasField && legacy.length === 0) return profile;

  const lines = legacy
    .sort((a, b) => a.order - b.order)
    .map((e) =>
      [e.title, e.subtitle, (e.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")]
        .map((s) => (s ?? "").trim())
        .filter(Boolean)
        .join(" · ")
    )
    .filter(Boolean);

  const merged = [profile.languageText ?? "", ...lines].filter(Boolean).join("\n");

  const entities = { ...profile.entities };
  for (const e of legacy) delete entities[e.id];

  return {
    ...profile,
    languageText: merged,
    entities,
    sectionOrder: (profile.sectionOrder ?? []).filter((id) => id !== "languages"),
  };
};

const syncCertificateText = (profile: CareerProfile): CareerProfile =>
  typeof (profile as Partial<CareerProfile>).certificateText === "string"
    ? profile
    : { ...profile, certificateText: "" };

const touch = (profile: CareerProfile): CareerProfile => ({
  ...profile,
  meta: { ...profile.meta, updatedAt: new Date().toISOString() },
});

export const useCareerProfileStore = create<ProfileStore>()(
  persist(
    (set, get) => ({
      profile: null,

      ensureProfile: () => {
        const existing = get().profile;
        if (existing) {
          const synced = syncLanguageText(syncCertificateText(syncBasicPresets(existing)));
          if (synced !== existing) set({ profile: synced });
          return synced;
        }

        const created = createEmptyProfile(createEmptyBasic(), new Date().toISOString());
        created.sectionOrder = [...DEFAULT_SECTION_ORDER];
        set({ profile: created });
        return created;
      },

      addEntity: (input) => {
        const profile = get().ensureProfile();
        const id = generateUUID();
        const now = new Date().toISOString();

        const sameSection = Object.values(profile.entities).filter(
          (e) => e.sectionId === input.sectionId
        );

        const entity: ProfileEntity = {
          id,
          type: (input.type ?? "custom") as EntityType,
          sectionId: input.sectionId,
          title: input.title ?? "",
          subtitle: input.subtitle ?? "",
          dateRange: input.dateRange ?? "",
          description: input.description ?? "",
          tags: input.tags ?? [],
          skills: input.skills ?? [],
          metrics: input.metrics ?? [],
          link: input.link,
          linkLabel: input.linkLabel,
          gpa: input.gpa,
          degree: input.degree,
          order: sameSection.length,
          createdAt: now,
          updatedAt: now,
          ...withDerivedDates({ dateRange: input.dateRange ?? "" }),
        };

        set({
          profile: touch({
            ...profile,
            entities: { ...profile.entities, [id]: entity },
          }),
        });
        return id;
      },

      applyCategories: (categories) => {
        const profile = get().ensureProfile();
        const entities = { ...profile.entities };
        let changed = 0;

        for (const [id, category] of Object.entries(categories)) {
          const entity = entities[id];
          if (!entity) continue;
          // 已经是规范类别 → 用户的选择优先，不动
          if (!needsCategorizing(entity.tags[0])) continue;
          entities[id] = { ...entity, tags: [category, ...entity.tags.slice(1)] };
          changed += 1;
        }

        if (changed === 0) return;
        set({ profile: touch({ ...profile, entities }) });
      },

      updateEntity: (id, patch) => {
        const profile = get().profile;
        const current = profile?.entities[id];
        if (!profile || !current) return;

        set({
          profile: touch({
            ...profile,
            entities: {
              ...profile.entities,
              [id]: {
                ...current,
                ...withDerivedDates(patch),
                updatedAt: new Date().toISOString(),
              },
            },
          }),
        });
      },

      removeEntity: (id) => {
        const profile = get().profile;
        if (!profile || !profile.entities[id]) return;

        const entities = { ...profile.entities };
        delete entities[id];
        set({ profile: touch({ ...profile, entities }) });
      },

      reorderEntities: (sectionId, orderedIds) => {
        const profile = get().profile;
        if (!profile) return;

        const entities = { ...profile.entities };
        orderedIds.forEach((id, index) => {
          const entity = entities[id];
          if (entity && entity.sectionId === sectionId) {
            entities[id] = { ...entity, order: index };
          }
        });

        set({ profile: touch({ ...profile, entities }) });
      },

      addSkillGroup: (input) => {
        const profile = get().ensureProfile();
        const id = generateUUID();
        const group: SkillGroup = {
          id,
          name: input.name,
          content: input.content,
          order: profile.skillGroups.length,
        };

        set({
          profile: touch({ ...profile, skillGroups: [...profile.skillGroups, group] }),
        });
        return id;
      },

      updateSkillGroup: (id, patch) => {
        const profile = get().profile;
        if (!profile) return;

        set({
          profile: touch({
            ...profile,
            skillGroups: profile.skillGroups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
          }),
        });
      },

      removeSkillGroup: (id) => {
        const profile = get().profile;
        if (!profile) return;

        set({
          profile: touch({
            ...profile,
            skillGroups: profile.skillGroups.filter((g) => g.id !== id),
          }),
        });
      },

      updateBasic: (patch) => {
        const profile = get().ensureProfile();
        set({ profile: touch({ ...profile, basic: { ...profile.basic, ...patch } }) });
      },

      setCertificateText: (certificateText) => {
        const profile = get().ensureProfile();
        set({ profile: touch({ ...profile, certificateText }) });
      },

      setLanguageText: (languageText) => {
        const profile = get().ensureProfile();
        set({ profile: touch({ ...profile, languageText }) });
      },

      setSelfEvaluationContent: (selfEvaluationContent) => {
        const profile = get().ensureProfile();
        set({ profile: touch({ ...profile, selfEvaluationContent }) });
      },

      replaceProfile: (profile) => set({ profile }),

      resetProfile: () => {
        const created = createEmptyProfile(createEmptyBasic(), new Date().toISOString());
        created.sectionOrder = [...DEFAULT_SECTION_ORDER];
        set({ profile: created });
      },
    }),
    {
      // 显式标出 state 的类型：签名里出现类型参数，persist 才能把 store 的类型推对
      onRehydrateStorage: (_state: ProfileStore) => (_s?: ProfileStore, error?: unknown) =>
        reportHydrationFailure("career-profile", error),
      name: PROFILE_STORAGE_KEY,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({ profile: state.profile }),
    }
  )
);
