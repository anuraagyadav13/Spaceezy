import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Frontend test harness (Vitest + Testing Library). Scope is deliberately
// narrow: only src/** tests are picked up, so backend/ (Jest) and the
// pre-existing lint/build pipeline are untouched.
export default defineConfig({
    plugins: [react()],
    test: {
        environment: "jsdom",
        globals: true,
        include: ["src/**/*.test.{js,jsx}"],
        setupFiles: ["./vitest.setup.js"],
    },
});
