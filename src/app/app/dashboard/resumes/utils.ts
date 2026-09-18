// 文本清洗那几个纯函数搬到了 lib —— PDF 导入现在也要用，而从 lib 反向依赖
// 页面文件是错的。这里只再导出调用方实际用到的那一个。
export { toStringArray } from "@/lib/profile/importFromAi";

/** 从模型返回的文本里抠出 JSON —— 容忍 ```json 包裹与前后废话 */
export const extractJsonContent = (content: string) => {
  const direct = content.trim();
  try {
    return JSON.parse(direct);
  } catch (error) { }

  const fencedMatch = direct.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch (error) { }
  }

  const objectMatch = direct.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch (error) { }
  }

  throw new Error("Invalid AI JSON content");
};
