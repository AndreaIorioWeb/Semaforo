import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@semaforo/shared/fonts": fileURLToPath(new URL("../../packages/shared/src/fonts.ts", import.meta.url)),
      "@semaforo/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/e2e/**", "**/node_modules/**"],
    testTimeout: 10_000,
  },
});
