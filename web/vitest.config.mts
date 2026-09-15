import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node, not jsdom: what is tested here is logic, not components.
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
  },
});
