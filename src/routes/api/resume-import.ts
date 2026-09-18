import { createFileRoute } from "@tanstack/react-router";
import { AI_MODEL_CONFIGS, isSupportedModelType, resolveModel } from "@/config/ai";
import { guardRequest } from "@/lib/server/rateLimit";
import { abortMessage, isAbortError, upstreamSignal } from "@/lib/server/upstream";

/**
 * PDF 简历导入 —— 把简历页面图片读成结构化 JSON。
 *
 * 原来这条路走 Gemini（唯一真正依赖别家能力的地方），现已迁到 DeepSeek：
 * `deepseek-chat` 支持图片输入，请求体按 OpenAI 兼容的多模态格式写
 * （`content` 是块数组，图片用 `image_url` + data URI）。
 *
 * 注意图片只能放在 **user** 消息里 —— 放进 system 会被上游按 400 拒掉。
 */

const parseUpstreamError = (raw: string, fallback: string) => {
  if (!raw) return fallback;
  try {
    const data = JSON.parse(raw) as {
      error?: { message?: string; code?: string };
      message?: string;
    };
    return data.error?.message || data.message || fallback;
  } catch {
    return raw.slice(0, 300);
  }
};

/** 模型有时会用 ```json 包裹，或前后带一句解释 */
const parseJsonPayload = (content: string) => {
  const text = content.trim();
  const attempts = [
    text,
    text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim(),
    text.match(/\{[\s\S]*\}/)?.[0],
  ];
  for (const candidate of attempts) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  return null;
};

/** 上游要的是 data URI；客户端可能只给裸 base64 */
const toDataUri = (value: string): string =>
  /^data:[^;]+;base64,/.test(value) ? value : `data:image/jpeg;base64,${value}`;

export const Route = createFileRoute("/api/resume-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = guardRequest(request, "ai");
        if (limited) return limited;

        let body: {
          apiKey?: string;
          model?: string;
          modelType?: unknown;
          content?: string;
          images?: unknown;
          locale?: string;
        };
        try {
          body = await request.json();
        } catch (error) {
          const message = error instanceof Error ? error.message : "无法解析";
          return Response.json({ error: `请求体解析失败：${message}` }, { status: 400 });
        }

        if (!isSupportedModelType(body.modelType)) {
          return Response.json(
            { error: `不支持的模型类型：${String(body.modelType)}` },
            { status: 400 }
          );
        }
        if (!body.apiKey?.trim()) {
          return Response.json({ error: "未配置 API Key" }, { status: 400 });
        }

        const images = Array.isArray(body.images) ? body.images.filter((i) => typeof i === "string") : [];
        if (!body.content?.trim() && images.length === 0) {
          return Response.json(
            { error: "缺少简历内容或页面图片" },
            { status: 400 }
          );
        }

        const language = body.locale === "en" ? "English" : "Chinese";
        const modelConfig = AI_MODEL_CONFIGS.deepseek;

        const systemPrompt = `你是一个专业的简历结构化助手。根据用户提供的简历内容，提取信息并只输出一个合法 JSON 对象。

输出约束：
1. 只允许输出 JSON，不要输出 Markdown，不要输出解释。
2. 如果某个字段不确定，使用空字符串或空数组。
3. 请使用 ${language} 输出内容文本。
4. description/details 字段输出字符串数组，每一项为一句可读内容。

JSON 结构：
{
  "title": "简历标题",
  "basic": {
    "name": "",
    "title": "",
    "email": "",
    "phone": "",
    "location": "",
    "employementStatus": "",
    "birthDate": ""
  },
  "education": [
    {
      "school": "",
      "major": "",
      "degree": "",
      "startDate": "",
      "endDate": "",
      "gpa": "",
      "description": ["", ""]
    }
  ],
  "experience": [
    {
      "company": "",
      "position": "",
      "date": "",
      "details": ["", ""]
    }
  ],
  "projects": [
    {
      "name": "",
      "role": "",
      "date": "",
      "description": ["", ""],
      "link": "",
      "linkLabel": ""
    }
  ],
  "skills": ["", ""]
}`;

        try {
          const response = await fetch(modelConfig.url, {
            method: "POST",
            headers: modelConfig.headers(body.apiKey),
            body: JSON.stringify({
              model: resolveModel(body.model),
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: systemPrompt },
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text:
                        body.content?.trim() ||
                        "请识别以下简历页面图片中的信息，并严格按 JSON 结构输出。",
                    },
                    ...images.map((url) => ({
                      type: "image_url",
                      image_url: { url: toDataUri(url) },
                    })),
                  ],
                },
              ],
            }),
            signal: upstreamSignal(request.signal),
          });

          const raw = await response.text();
          if (!response.ok) {
            return Response.json(
              { error: parseUpstreamError(raw, `上游返回 ${response.status} ${response.statusText}`) },
              { status: 502 }
            );
          }

          let envelope: { choices?: Array<{ message?: { content?: string } }> };
          try {
            envelope = JSON.parse(raw);
          } catch {
            return Response.json({ error: "上游返回的不是合法 JSON" }, { status: 502 });
          }

          const aiContent = envelope.choices?.[0]?.message?.content;
          if (!aiContent || typeof aiContent !== "string") {
            return Response.json({ error: "模型没有返回内容" }, { status: 502 });
          }

          const parsedResume = parseJsonPayload(aiContent);
          if (!parsedResume) {
            return Response.json(
              { error: "模型输出不是可解析的 JSON", raw: aiContent.slice(0, 500) },
              { status: 502 }
            );
          }

          return Response.json({ resume: parsedResume });
        } catch (error) {
          if (isAbortError(error)) {
            return Response.json({ error: abortMessage(request.signal) }, { status: 504 });
          }
          const message = error instanceof Error ? error.message : "未知错误";
          console.error("Error in resume import:", error);
          return Response.json({ error: `简历导入失败：${message}` }, { status: 502 });
        }
      },
    },
  },
});
