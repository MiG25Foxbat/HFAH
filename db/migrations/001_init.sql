-- «Ладно»: начальная схема. Деньги — целые рубли. Время — timestamptz.

create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Настройки компании: одна строка, разделы jsonb (company, pricing, game, characters).
create table settings (
  id         int primary key check (id = 1),
  company    jsonb not null,
  pricing    jsonb not null,
  game       jsonb not null,
  characters jsonb not null,
  updated_at timestamptz not null default now()
);
create trigger settings_updated before update on settings
  for each row execute function set_updated_at();

-- Прайс работ.
create table services (
  id                text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category          text not null check (category in ('furniture', 'plumbing', 'electrics', 'repair', 'other')),
  title             text not null check (length(title) between 2 and 120),
  description       text not null default '',
  unit              text not null check (unit in ('pcs', 'm', 'm2', 'hour')),
  pricing           text not null check (pricing in ('fixed', 'hourly', 'manual')),
  price             int check (price >= 0),
  minutes           int not null default 0 check (minutes >= 0),
  dismantle_allowed boolean not null default false,
  memo              text not null default '',
  active            boolean not null default true,
  sort              int not null default 0,
  -- фиксированная работа обязана иметь цену; почасовая берёт hourRate, ручная цены не имеет
  constraint services_price_by_pricing check (
    (pricing = 'fixed' and price is not null) or (pricing <> 'fixed' and price is null)
  ),
  constraint services_hourly_unit check (pricing <> 'hourly' or unit = 'hour')
);
create index services_category_sort_idx on services (category, sort) where active;

create table orders (
  id                  uuid primary key default gen_random_uuid(),
  number              bigint generated always as identity unique,
  status              text not null default 'new' check (status in ('new', 'agreed', 'done', 'cancelled')),
  customer_name       text not null,
  phone               text not null,
  address             text not null,
  access              jsonb not null default '{}'::jsonb,   -- {entrance, intercom, floor, elevator, parking}
  out_of_town         boolean not null default false,
  urgent              boolean not null default false,
  materials           text not null check (materials in ('have', 'self', 'master', 'unknown')),
  desired_date        date,
  desired_time        text,
  comment             text not null default '',
  consent_at          timestamptz not null,
  pricing_snapshot    jsonb not null,                       -- условия на момент отправки
  known_total         int check (known_total >= 0),
  has_manual          boolean not null,
  est_minutes         int not null check (est_minutes >= 0),
  final_price         int check (final_price >= 0),         -- задаёт владелец
  agreed_at           timestamptz,                          -- согласованное время выезда
  owner_note          text not null default '',             -- приватно, наружу не отдаётся
  public_token_hash   text not null unique,                 -- sha256(hex) приватного токена
  idempotency_key     uuid not null unique,
  request_fingerprint text not null,
  excluded_matches    jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint orders_time_requires_date check (desired_time is null or desired_date is not null),
  constraint orders_agreed_requires_price_and_time check (
    status <> 'agreed' or (final_price is not null and agreed_at is not null)
  )
);
create index orders_created_idx on orders (created_at desc);
create index orders_status_created_idx on orders (status, created_at desc);
create trigger orders_updated before update on orders
  for each row execute function set_updated_at();

create table order_events (
  id       bigint generated always as identity primary key,
  order_id uuid not null references orders (id) on delete cascade,
  at       timestamptz not null default now(),
  kind     text not null,   -- created | status | price | agreed | note | ...
  data     jsonb not null default '{}'::jsonb
);
create index order_events_order_idx on order_events (order_id, at);

-- Фото: WebP после сжатия. order_id null, пока заявка не отправлена.
create table photos (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid references orders (id) on delete cascade,
  upload_key_hash text not null,
  mime            text not null check (mime = 'image/webp'),
  width           int not null,
  height          int not null,
  bytes           int not null,
  data            bytea not null,
  created_at      timestamptz not null default now()
);
create index photos_order_idx on photos (order_id) where order_id is not null;
create index photos_unattached_idx on photos (created_at) where order_id is null;

create table owner (
  id                  int primary key check (id = 1),
  password_hash       text not null,
  password_changed_at timestamptz not null default now()
);

create table sessions (
  id_hash      text primary key,   -- sha256(hex) от значения cookie
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now()
);
create index sessions_expires_idx on sessions (expires_at);

create table rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key, window_start)
);
create index rate_limits_window_idx on rate_limits (window_start);

create table bonus_codes (
  id          bigint generated always as identity primary key,
  order_id    uuid not null unique references orders (id) on delete cascade,
  code        text not null unique,
  amount      int not null check (amount > 0),
  min_order   int not null check (min_order >= 0),
  expires_at  timestamptz not null,
  status      text not null default 'issued' check (status in ('issued', 'redeemed', 'void')),
  created_at  timestamptz not null default now(),
  redeemed_at timestamptz
);
