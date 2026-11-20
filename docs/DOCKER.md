# Установка через Docker

Нужны Docker и Docker Compose на сервере (Ubuntu: `curl -fsSL https://get.docker.com | sh`).

1. Скачайте репозиторий на сервер и перейдите в папку.
2. `cp .env.docker.example .env` и заполните `.env` (`openssl rand -hex 32` для паролей и секрета).
3. `docker compose up -d --build`. Первый старт занимает 2–4 минуты: миграции, демо-каталог, сборка.
4. Сайт слушает `127.0.0.1:3000`. Поставьте перед ним nginx с HTTPS (Let's Encrypt):

```
server {
  server_name example.ru;
  client_max_body_size 30m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
затем `certbot --nginx -d example.ru`.

Обновление: `git pull && docker compose up -d --build`. Логи: `docker compose logs -f app`.
Кабинет: `https://example.ru/admin`, пароль — `OWNER_PASSWORD`. Каталог и цены владелец меняет там сам.

## Быстрый вариант без своего домена (sslip.io)
В `.env` укажите `DOMAIN=77-91-73-207.sslip.io` и `APP_ORIGIN=https://77-91-73-207.sslip.io` (IP через дефисы).
Контейнер Caddy сам получит сертификат HTTPS — nginx и certbot не нужны. Порты 80 и 443 должны быть открыты.
Для своего домена позже: поменяйте обе строки на домен и выполните `docker compose up -d --build`.
