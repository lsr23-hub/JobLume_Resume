import { create } from "zustand";
import { persist } from "zustand/middleware";
import { reportHydrationFailure } from "@/store/persistGuard";

/**
 * AI 配置。
 *
 * 只保留 DeepSeek 一条通道，所以这里不再有「当前选中的服务商」——
 * 没有可选项。持久化键沿用 `ai-config-storage`，老用户已存的 DeepSeek key
 * 不受影响；其余服务商的 key 会留在 localStorage 里不再被读，无害。
 */

interface AIConfigState {
  deepseekApiKey: string;
  deepseekModelId: string;
  setDeepseekApiKey: (apiKey: string) => void;
  setDeepseekModelId: (modelId: string) => void;
  isConfigured: () => boolean;
}

export const useAIConfigStore = create<AIConfigState>()(
  persist(
    (set, get) => ({
      deepseekApiKey: "",
      deepseekModelId: "",
      setDeepseekApiKey: (apiKey: string) => set({ deepseekApiKey: apiKey }),
      setDeepseekModelId: (modelId: string) => set({ deepseekModelId: modelId }),
      isConfigured: () => !!get().deepseekApiKey.trim(),
    }),
    {
      // 显式标出 state 的类型：签名里出现类型参数，persist 才能把 store 的类型推对
      onRehydrateStorage: (_state: AIConfigState) => (_s?: AIConfigState, error?: unknown) =>
        reportHydrationFailure("ai-config", error),
      name: "ai-config-storage",
    }
  )
);
