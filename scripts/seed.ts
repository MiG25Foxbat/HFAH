import { DEV_OWNER_PASSWORD, runSeed } from "./_seed";
import { connect, isLocalUrl } from "./_lib";

/** npm run db:seed [-- --overwrite]. Пароль владельца берётся из OWNER_PASSWORD; для локальной базы есть демо-значение. */
async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const ownerPassword = process.env.OWNER_PASSWORD || (isLocalUrl(url) ? DEV_OWNER_PASSWORD : undefined);
  if (!ownerPassword) console.warn("OWNER_PASSWORD не задан: пароль владельца не создан (npm run owner:password).");
  const sql = connect();
  try {
    const r = await runSeed(sql, { overwrite: process.argv.includes("--overwrite"), ownerPassword });
    console.log(`Готово: ${r.services} работ, настройки, владелец.`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
