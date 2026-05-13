# Runbook

## Staging deploy

1. В Railway создать web service из репозитория и отдельную MySQL service.
2. Задать env:
   - `DATABASE_URL`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `TELEGRAM_WEBHOOK_BASE_URL`
   - `VKUSVILL_MCP_BASE_URL`
   - `VKUSVILL_MCP_API_KEY` при необходимости
3. После деплоя применить миграции: `npm run db:deploy`.
4. Проверить сервис: `npm run smoke` или `SMOKE_BASE_URL=https://<railway-domain> npm run smoke`.
5. Зарегистрировать webhook:
   - `npm run telegram:webhook -- set`
   - `npm run telegram:webhook -- info`

## Telegram webhook

- Проверить текущий webhook: `npm run telegram:webhook -- info`
- Перерегистрировать webhook после смены домена: `npm run telegram:webhook -- set`
- Удалить webhook: `npm run telegram:webhook -- delete`
- Если webhook отвечает `401`, проверить совпадение `TELEGRAM_WEBHOOK_SECRET` в Railway и у Telegram.
- Если webhook не доставляет апдейты, посмотреть `pendingUpdateCount` и `lastErrorMessage` через `npm run telegram:webhook -- info`.

## Railway / app

- Если `npm run smoke` падает на `/health`, сначала проверить deploy logs и значение `DATABASE_URL`.
- Если `/telegram/webhook` не проходит smoke, проверить `TELEGRAM_WEBHOOK_SECRET` и публичный `TELEGRAM_WEBHOOK_BASE_URL`.

## Vkusvill MCP

- Если поиск или финализация падают только в staging, сначала проверить `VKUSVILL_MCP_BASE_URL`.
- Если Telegram работает, а финализация не даёт ссылку, проверить доступность MCP и логи ответов gateway.
