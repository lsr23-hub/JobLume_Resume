/**
 * 从模型返回的文本里抠出 JSON。
 *
 * 三层容错，从严到宽：直接解析 → ```json 代码块 → 第一对花括号。
 * 抽到公共模块是因为归类和匹配两条链路都要用；它跟「匹配」没有关系，
 * 放在 match 模块里会让 profile 侧反向依赖它。
 */
export const parseModelJson = (text: string): unknown => {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* 继续尝试其他形式 */
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* 继续 */
    }
  }

  const block = trimmed.match(/\{[\s\S]*\}/);
  if (block?.[0]) {
    try {
      return JSON.parse(block[0]);
    } catch {
      /* 放弃 */
    }
  }

  return null;
};
