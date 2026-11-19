-- «Запросто»: категории в БД, флаг «для офиса», заявки от организаций.
-- Миграция должна быть безопасной для уже работающей базы: шесть категорий добавляются идемпотентно,
-- чтобы внешний ключ services.category можно было навесить на любые существующие данные.

create table categories (
  id        text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title     text not null check (length(btrim(title)) between 2 and 40),
  color     text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  -- какой из шести 3D-персонажей показывать у категории
  character text not null check (character in ('furniture', 'plumbing', 'electrics', 'repair', 'other', 'appliances')),
  active    boolean not null default true,
  sort      int not null default 0
);
create index categories_sort_idx on categories (sort, id);

insert into categories (id, title, color, character, active, sort) values
  ('furniture',  'Мебель',          '#C08A55', 'furniture',  true, 10),
  ('plumbing',   'Сантехника',      '#4E8FCB', 'plumbing',   true, 20),
  ('electrics',  'Электрика',       '#E3B23C', 'electrics',  true, 30),
  ('repair',     'Ремонт',          '#6CC3A0', 'repair',     true, 40),
  ('appliances', 'Бытовая техника', '#8E7CE0', 'appliances', true, 50),
  ('other',      'Другое',          '#2E57D1', 'other',      true, 60)
on conflict (id) do nothing;

-- Работы: категория — внешний ключ (старый CHECK на пять значений снимается); флаг «подходит для офиса».
alter table services drop constraint if exists services_category_check;
alter table services
  add constraint services_category_fkey foreign key (category) references categories (id) on update cascade on delete restrict;
alter table services add column office boolean not null default false;
-- индекс нужен и для внешнего ключа (проверка при удалении категории), поэтому без условия `where active`
drop index if exists services_category_sort_idx;
create index services_category_sort_idx on services (category, sort);

-- Заявки: кто заказывает. Реквизиты организации — только название и ИНН; снимок строк заявки (pricing_snapshot)
-- хранит categoryTitle и character на момент заказа, поэтому схема заявок для этого не меняется.
alter table orders
  add column client_type   text not null default 'person' check (client_type in ('person', 'organization')),
  add column org_name      text,
  add column org_inn       text check (org_inn ~ '^([0-9]{10}|[0-9]{12})$'),
  add column wants_invoice boolean not null default false,
  add constraint orders_client_type_org check (
    (client_type = 'person' and org_name is null and org_inn is null and not wants_invoice)
    or (client_type = 'organization' and org_name is not null and length(btrim(org_name)) between 2 and 120)
  );
create index orders_org_created_idx on orders (created_at desc) where client_type = 'organization';

-- Настройки компании: поля для организаций (значения владельца не затираются).
update settings
   set company = jsonb_build_object('orgsEnabled', true, 'invoiceEnabled', true, 'orgNote', '') || company;
