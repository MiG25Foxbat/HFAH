# «Ладно» — мастер на час

Веб-приложение для компании «мастер на час»: каталог работ с ценами, заявка с пересчётом на сервере, приватная ссылка
для клиента, кабинет владельца. Требования — `SPEC.md`, решения — `docs/ARCHITECTURE.md`, дизайн — `docs/DESIGN.md`,
отклонения и выбор версий — `docs/DECISIONS.md`.

Состояние: фундамент (данные, расчёт, серверные библиотеки, публичный API, токены дизайна). Клиентский интерфейс
(сцена, корзина, оформление), страница заявки и кабинет строятся поверх.

## Запуск

Нужны Node 22+ и PostgreSQL 15+.

```bash
npm install
cp .env.example .env.local     # заполните DATABASE_URL, TOKEN_SECRET, OWNER_PASSWORD
npm run db:migrate             # схема
npm run db:seed                # демо-прайс и настройки (вымышленные)
npm run dev                    # http://localhost:3000
```

| Команда | Что делает |
|---|---|
| `npm run dev` / `build` / `start` | разработка / сборка / запуск сборки |
| `npm run typecheck` / `lint` | проверка типов / ESLint |
| `npm test` | vitest: расчёт (юнит) и интеграция с БД `TEST_DATABASE_URL` (имя базы должно оканчиваться на `_test`) |
| `npm run db:migrate` | применяет новые файлы из `db/migrations/*.sql` (журнал — таблица `schema_migrations`) |
| `npm run db:seed` | досевает демо-данные, ничего не затирая; `-- --overwrite` возвращает демо-значения |
| `npm run db:reset` | удаляет ВСЕ данные, миграции и посев заново; отказывается, если `DATABASE_URL` не на localhost |
| `npm run owner:password -- "пароль"` | задаёт пароль владельца (≥ 10 символов) и закрывает все его сеансы |

Секреты (`DATABASE_URL`, `TOKEN_SECRET`, `OWNER_PASSWORD`) живут только на сервере. `OWNER_PASSWORD` читают лишь
`db:seed` и `owner:password`; в БД попадает scrypt-хеш.

### Локальная разработка (только демо)

Для локальной базы посев и `db:reset` подставляют демо-пароль владельца `ladno-demo-2026`, если `OWNER_PASSWORD`
не задан. В production задайте свой пароль и смените демо-значения.

## Устройство

```
db/migrations/        SQL-схема
scripts/              migrate, seed, reset, owner:password (tsx)
src/lib/              ЧИСТЫЙ код, работает и в браузере
  catalog.ts            категории, единицы, тип Service
  pricing.ts            формула расчёта, снимок условий, формат денег и времени
  order-schema.ts       zod-схема заявки, телефон, окна времени
  settings.ts           zod-схемы настроек компании
  excluded.ts           поиск «чего не берём» в тексте
  order-types.ts        статусы и публичный вид заявки
  theme.ts              ключ и скрипт темы без вспышки
src/lib/server/       только сервер (`import "server-only"`)
  db, settings, services, orders, bonus, photos, session, auth, rate-limit, tokens, password, http
src/app/api/          публичный API
src/app/(site)/       публичный сайт: каркас (шапка, подвал, корзина), главная, /checkout, /o/[токен]
src/components/       site (шапка, подвал), shop (каталог, лист настройки работы, корзина, расчёт), checkout (форма, фото),
                      order (страница заявки с опросом), ui (лист, тосты, поля), ThemeSwitch
e2e/                  Python Playwright: test_client_flow.py (клиентский путь), скриншоты в e2e/screenshots/
tests/                vitest
```

## Публичный API

Все ответы — `Cache-Control: no-store`; изменяющие запросы требуют заголовок `Origin` своего сайта. Ошибка —
`{ error, code, fields? }`, где `fields` — `{ "поле": "сообщение" }` по-русски.

| Маршрут | Назначение |
|---|---|
| `POST /api/uploads` (multipart, поле `file`) | фото → WebP ≤ 1600 px; `{ id, key, width, height, bytes }` |
| `DELETE /api/uploads/[id]` + `X-Upload-Key` | удалить непривязанное фото |
| `POST /api/orders` + `Idempotency-Key` (UUID) | создать заявку: `201 { number, token, url }`; повтор — `200` с теми же данными; тот же ключ с другим содержимым — `409` |
| `GET /api/orders/[token]` | публичный вид заявки (тип `PublicOrder`), опрос раз в несколько секунд |
| `POST /api/game/claim` `{ token }` | бонусный код за игру (один на заявку) |
| `GET /api/admin/photos/[id]` | фото для владельца (cookie сеанса), иначе 401 |
