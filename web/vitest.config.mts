import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node, not jsdom: what is tested here is logic, not components.
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    // Leave room for the browser and compute service during local checks.
    maxWorkers: 4,
  },
});
