import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// 站点对外地址，构建期注入。
//
// 为什么用 define 而不是运行时读 process.env：`head()` 在浏览器里也会执行
// （客户端导航时会重新求值），那里没有 process.env，运行时读取会直接抛
// ReferenceError。define 在构建时替换成字面量，服务端与客户端拿到的是同一个值。
//
// 未设置时注入空串，见 src/config/site.ts —— 此时不输出任何绝对 URL。
const SITE_URL = process.env.SITE_URL ?? "";

export default defineConfig({
  define: {
    __SITE_URL__: JSON.stringify(SITE_URL)
  },
  // pnpm 在不同平台的链接布局可能让 SSR 解析出多份 React。
  // 强制客户端、服务端和依赖统一使用根目录中的 React，避免 hooks dispatcher 丢失。
  resolve: {
    dedupe: ["react", "react-dom"]
  },
  server: {
    port: 3000
  },
  // 这里原先有 pdfjs-dist 的 optimizeDeps.exclude / ssr.noExternal。
  // 应用代码从来没有 import 过它 —— 唯一的调用方是 e2e 脚本里那句动态 import，
  // 走的是 Node 侧的 tsx，与 vite 的依赖预打包无关。配置删掉。
  plugins: [
    tsconfigPaths(),
    tanstackStart({
      srcDirectory: "src",
      router: {
        routesDirectory: "routes"
      }
    }),
    viteReact()
  ]
});
