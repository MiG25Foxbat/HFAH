import { connect } from "./_lib";
import { hashPassword } from "../src/lib/server/password";

/**
 * npm run owner:password -- "новый пароль"   (или OWNER_PASSWORD=... npm run owner:password)
 * Ставит пароль владельца и закрывает все его сеансы.
 */
async function main() {
  const password = process.argv[2] || process.env.OWNER_PASSWORD;
  if (!password || password.length < 10) {
    console.error('Укажите пароль не короче 10 символов: npm run owner:password -- "пароль"');
    process.exit(1);
  }
  const hash = await hashPassword(password);
  const sql = connect();
  try {
    await sql.begin(async (tx) => {
      await tx`insert into owner (id, password_hash) values (1, ${hash})
        on conflict (id) do update set password_hash = excluded.password_hash, password_changed_at = now()`;
      await tx`delete from sessions`;
    });
    console.log("Пароль владельца обновлён, все сеансы закрыты.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
