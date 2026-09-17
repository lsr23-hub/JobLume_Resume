# 为什么有这些补丁

## @rc-component/util@1.13.0 — 防止 cssinjs 在 DOM 未就绪时崩溃

**症状**：页面整个挂掉，TanStack Router 的错误边界显示

```
Something went wrong!
Cannot read properties of null (reading 'children')
```

**位置**：`es/Dom/dynamicCSS.js` 的 `findStyles`

```js
return Array.from((containerCache.get(container) || container).children)  // container 可能为 null
```

**原因**：antd v6 的样式由 `@ant-design/cssinjs` 在 `useInsertionEffect` 里注入，
它最终调用 `@rc-component/util` 的 `injectCSS`。当这个 effect 早于
`<head>` / `<body>` 存在时触发（整文档 SSR 的框架在水合不一致后转客户端渲染时
会发生），`getContainer()` 返回 `null`，`.children` 直接抛错。

上游 issue：https://github.com/react-component/util/issues/603 （2024-12 提出，
至今未合并，提出者给的临时方案就是打这个补丁）

**本仓库为什么中招**：TanStack Start 渲染整个 `<html>` 文档（与 issue 里点名的
Remix / React Router v7 同构），且本项目在 React 18 上跑 antd v6。
issue 里有报告称升级到 React 19.1 后 `useInsertionEffect` 时机恢复正常。

**补丁内容**：给 `findStyles` / `injectCSS` / `removeCSS` / `syncRealContainer`
加空值保护。容器存在时行为完全不变，不存在时降级为跳过注入而不是抛错。

**何时可以撤掉**：antd 依赖的 `@rc-component/util` 升到含修复的版本后，
删掉 `package.json` 里的 `pnpm.patchedDependencies` 与 `patches/*.patch` 即可。
