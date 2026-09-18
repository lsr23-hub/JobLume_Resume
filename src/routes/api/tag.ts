import { createFileRoute } from "@tanstack/react-router";
import { handleLlmRoute } from "@/lib/server/llmRoute";

/**
 * 经历自动归类。
 *
 * 与 `/api/match` 共用处理器，区别只在 prompt 由 `buildTagPrompt` 构造。
 */
export const Route = createFileRoute("/api/tag")({
  server: { handlers: { POST: ({ request }) => handleLlmRoute(request) } },
});
