import { connect, runMigrations } from "./_lib";

async function main() {
  const sql = connect();
  try {
    const applied = await runMigrations(sql);
    console.log(applied.length ? `Применены миграции: ${applied.join(", ")}` : "Схема актуальна.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
