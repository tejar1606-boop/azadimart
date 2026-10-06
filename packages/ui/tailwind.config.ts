import type { Config } from "tailwindcss";

const config: Config = {
  content: [],
  theme: {
    extend: {
      colors: {
        saffron: {
          DEFAULT: "#F97316",
          foreground: "#1C1917",
        },
        ink: {
          DEFAULT: "#0F172A",
          muted: "#475569",
        },
      },
    },
  },
  plugins: [],
};

export default config;
