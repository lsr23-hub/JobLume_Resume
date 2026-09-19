import type { Config } from "tailwindcss";
const { heroui } = require("@heroui/react");

const config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}"
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px"
      }
    },
    extend: {
      fontFamily: {
        // 规格里的 Copernicus / StyreneB 是授权字体，按其「替代字体」一节取
        // Cormorant Garamond（衬线展示）与 Inter（人文无衬线正文）。
        // 展示字号才有衬线 —— 规格的字阶表里 title-* 与 body-* 都是无衬线。
        serif: [
          "Cormorant Garamond",
          "EB Garamond",
          "Tiempos Headline",
          "Garamond",
          "Times New Roman",
          "serif",
        ],
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        baseFont: "#212529",
        subtitleFont: "#212529",
        // ── 设计 token（名字与规格一致）──
        // 页面与新组件用这些名字；旧的 bg-background / text-foreground 那套
        // 是它们的别名（见 globals.css），两者等价。
        canvas: "hsl(var(--canvas))",
        ink: "hsl(var(--ink))",
        body: "hsl(var(--body))",
        "body-strong": "hsl(var(--body-strong))",
        "muted-ink": "hsl(var(--muted-ink))",
        "muted-soft": "hsl(var(--muted-soft))",
        coral: {
          DEFAULT: "hsl(var(--coral))",
          active: "hsl(var(--coral-active))",
          disabled: "hsl(var(--coral-disabled))",
        },
        hairline: {
          DEFAULT: "hsl(var(--hairline))",
          soft: "hsl(var(--hairline-soft))",
        },
        surface: {
          soft: "hsl(var(--surface-soft))",
          card: "hsl(var(--surface-card))",
          strong: "hsl(var(--surface-cream-strong))",
          dark: "hsl(var(--surface-dark))",
          "dark-soft": "hsl(var(--surface-dark-soft))",
          "dark-elevated": "hsl(var(--surface-dark-elevated))",
        },
        "on-primary": "hsl(var(--on-primary))",
        "on-dark": "hsl(var(--on-dark))",
        "on-dark-soft": "hsl(var(--on-dark-soft))",
        "accent-teal": "hsl(var(--accent-teal))",
        "accent-amber": "hsl(var(--accent-amber))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))"
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))"
        }
      },
      // 规格的圆角层级是写死的：按钮/输入框 8px、内容卡 12px、英雄容器 16px
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px"
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0"
          },
          to: {
            height: "var(--radix-accordion-content-height)"
          }
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)"
          },
          to: {
            height: "0"
          }
        },
        "fade-in": {
          "0%": {
            opacity: "0",
            transform: "scale(0.95)"
          },
          "100%": {
            opacity: "1",
            transform: "scale(1)"
          }
        },
        "fade-out": {
          "0%": {
            opacity: "1",
            transform: "scale(1)"
          },
          "100%": {
            opacity: "0",
            transform: "scale(0.98)"
          }
        }
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-out": "fade-out 0.4s cubic-bezier(0.16, 1, 0.3, 1)"
      }
    }
  },
  plugins: [require("tailwindcss-animate"), heroui()]
} satisfies Config;

export default config;
