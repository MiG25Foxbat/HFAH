import postgres from "postgres";
import { runMigrations } from "../scripts/_lib";

/** Один раз перед всеми тестами: пересоздаёт схему тестовой базы и накатывает миграции. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return; // интеграционные тесты сами пропустятся
  if (!/_test$/.test(new URL(url).pathname.slice(1))) throw new Error("TEST_DATABASE_URL должен указывать на базу с суффиксом _test");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe("drop schema public cascade; create schema public;");
    await runMigrations(sql);
  } finally {
    await sql.end();
  }
}
