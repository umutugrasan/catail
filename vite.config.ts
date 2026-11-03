import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Tauri prints its own logs; keep Vite from wiping them.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/spikes/**"] },
  },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        overlay: page("src/windows/overlay/index.html"),
        settings: page("src/windows/settings/index.html"),
        badge: page("src/windows/badge/index.html"),
        panel: page("src/windows/panel/index.html"),
        preview: page("src/windows/preview/index.html"),
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
