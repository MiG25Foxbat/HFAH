import { DEV_OWNER_PASSWORD, runSeed } from "./_seed";
import { connect, isLocalUrl, runMigrations } from "./_lib";

/** npm run db:reset — удаляет ВСЕ данные, заново применяет миграции и сидит демо. Только для локальной базы. */
async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!isLocalUrl(url)) {
    console.error("db:reset отказывается работать: DATABASE_URL не указывает на localhost / 127.0.0.1 / ::1.");
    process.exit(1);
  }
  const sql = connect();
  try {
    await sql.unsafe("drop schema public cascade; create schema public;");
    await runMigrations(sql);
    const r = await runSeed(sql, { ownerPassword: process.env.OWNER_PASSWORD || DEV_OWNER_PASSWORD });
    console.log(`База пересоздана: ${r.services} работ.`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
