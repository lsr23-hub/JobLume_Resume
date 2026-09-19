declare global {
  /** 构建期注入的站点地址，见 vite.config.ts 与 src/config/site.ts */
  const __SITE_URL__: string;
}

export {};
