/** Общее для CLI-скриптов (tsx, переменные из .env.local): подключение и миграции. */
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

export function connect(url = process.env.DATABASE_URL): Sql {
  if (!url) throw new Error("DATABASE_URL не задан (см. .env.example)");
  return postgres(url, { max: 1, onnotice: () => {} });
}

/** Применяет не применённые файлы db/migrations/*.sql по порядку имён; каждый — в своей транзакции. */
export async function runMigrations(sql: Sql, dir = path.resolve("db/migrations")): Promise<string[]> {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
  const applied: string[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    applied.push(file);
  }
  return applied;
}

/** Адрес базы указывает на этот компьютер? (защита db:reset от случайного удалённого сброса) */
export function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return ["localhost", "127.0.0.1", "::1"].includes(host);
  } catch {
    return false;
  }
}
