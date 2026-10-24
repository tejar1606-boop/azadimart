import type { Config } from "tailwindcss";
import preset from "@azadimart/ui/tailwind.config";

const config: Config = {
  presets: [preset],
  content: ["./app/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
};

export default config;
