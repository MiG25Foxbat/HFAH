import "server-only";
import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

const g = globalThis as unknown as { __zaprostoSql?: Sql };

function connect(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL не задан (см. .env.example)");
  // Пулер в transaction mode (Supabase/Neon/pgbouncer) не поддерживает prepared statements.
  const prepare = process.env.DB_PREPARE !== "false" && !/pooler|pgbouncer/i.test(url);
  return postgres(url, {
    prepare,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    transform: postgres.camel, // snake_case в БД → camelCase в коде
    onnotice: () => {},
  });
}

const client = () => (g.__zaprostoSql ??= connect());

/**
 * Единственный клиент БД (переживает HMR). Подключение создаётся при первом запросе, поэтому импорт модуля
 * не требует DATABASE_URL (например, при сборке). Использование: await sql`select ...`, sql.begin(...), sql.json(...).
 */
export const sql: Sql = new Proxy(function () {} as unknown as Sql, {
  apply: (_target, _this, args) => (client() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_target, prop) => Reflect.get(client(), prop),
});
