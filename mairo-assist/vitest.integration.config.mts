import path from "node:path";
import { defineConfig } from "vitest/config";

// Integration tests run against the local e2e stack (see e2e/run.sh), which
// provides Supabase-compatible services and a fake OpenAI endpoint.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "src/test/empty.ts"),
    },
  },
  test: { include: ["src/**/*.int.test.ts"], environment: "node", testTimeout: 30_000, fileParallelism: false },
});
