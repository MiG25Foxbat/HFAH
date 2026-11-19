import path from "node:path";
import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local нет (CI) — переменные должны прийти из окружения
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve("src"),
      "server-only": path.resolve("tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // интеграционные тесты делят одну тестовую базу
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      APP_ORIGIN: "http://localhost:3000",
      TOKEN_SECRET: "test-token-secret-0123456789abcdef0123456789abcdef",
      NODE_ENV: "test",
    },
  },
});
