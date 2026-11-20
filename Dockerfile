# «Запросто»: образ приложения. Сборка Next идёт при старте контейнера,
# потому что APP_ORIGIN и база нужны на этапе сборки.
FROM node:24-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN chmod +x docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
