import type { Config } from "tailwindcss";

// AzadiMart design tokens shared by storefront, seller centre and admin:
// one saffron accent, India green, a soft grey canvas and dark chrome.
const brand = {
  50: "#fef6ee",
  100: "#fde9d4",
  200: "#fad0a9",
  300: "#f5b073",
  400: "#ef9447",
  500: "#e58530",
  600: "#c96e1f",
  700: "#a7561a",
  800: "#86451b",
  900: "#6d3a19",
  950: "#3b1c0a",
};

const config: Config = {
  content: [],
  theme: {
    extend: {
      colors: {
        brand: { ...brand, DEFAULT: brand[500] },
        // Existing amber-* accents follow the brand colour.
        amber: brand,
        saffron: { DEFAULT: brand[500], foreground: "#1C1917" },
        ink: { DEFAULT: "#0F172A", muted: "#64748b" },
        canvas: "#f7f7f7",
        panel: "#f3f4f6",
        chrome: { DEFAULT: "#111111", soft: "#1c1c1c", line: "#2a2a2a" },
        save: "#13a047",
        india: { DEFAULT: "#18664e", light: "#e8f3ef" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
      },
      animation: {
        marquee: "marquee 35s linear infinite",
      },
      boxShadow: {
        header: "0 1px 8px rgba(0,0,0,0.08)",
        card: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)",
        lift: "0 8px 30px rgba(0,0,0,0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
