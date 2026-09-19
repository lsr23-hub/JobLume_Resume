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
  server: {
    port: 3000
  },
  optimizeDeps: {
    exclude: ["pdfjs-dist"]
  },
  ssr: {
    noExternal: ["pdfjs-dist"]
  },
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
