import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./website/src", import.meta.url)) },
  },
  test: {
    reporters: ["default", "junit"],
    outputFile: {
      junit: "report.junit.xml",
    },
    coverage: {
      include: ["src/**/*.ts"],
    },
  },
});
