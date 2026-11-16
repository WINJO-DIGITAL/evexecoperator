import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/hooks/**", "src/lib/**"],
      exclude: ["src/lib/operator/statusColor.js", "src/lib/supabase.ts"],
    },
  },
});
