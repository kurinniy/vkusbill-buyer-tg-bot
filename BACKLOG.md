# Vkusvill Telegram Bot Backlog

## Цель

Сделать Telegram-бота для группового заказа товаров из ВкусВилла через MCP.

MVP должен уметь:

- работать в Telegram-группе;
- создавать одну активную корзину на группу;
- искать товары через `vkusvill` MCP;
- добавлять и удалять позиции из корзины;
- финализировать корзину и генерировать `share_basket` ссылку;
- сохранять историю заказов в MySQL;
- импортировать историю заказов из CSV через shell-команду;
- деплоиться в Railway.

## Ограничения

- База данных: MySQL.
- Деплой: Railway.
- Admin UI в MVP не делаем.
- CSV-импорт выполняется через CLI/shell-скрипт.
- ВкусВилл MCP считаем внешней зависимостью с нестабильной доступностью и возможными изменениями ответа.
- MVP не оформляет оплату внутри Telegram; завершение сценария MVP — генерация ссылки на корзину.

## Архитектурный контур

### Компоненты

- `app`: основной backend-сервис.
- `telegram`: обработка webhook и bot-команд.
- `domain`: бизнес-логика корзины, истории и импорта.
- `integrations/vkusvill-mcp`: адаптер к MCP.
- `db`: миграции, модели, репозитории.
- `cli`: shell entrypoints для импорта и служебных задач.

### Инфраструктура

- Railway web service для backend.
- Railway MySQL service.
- Один production webhook endpoint для Telegram.
- Переменные окружения для Telegram, MySQL, MCP, логирования и режима запуска.

### Основные решения

- Использовать webhook, а не polling.
- Использовать command-first UX, а не свободный LLM-диалог в MVP.
- Хранить snapshot товаров в заказе, а не только ссылки на внешние id.
- Историю импортов вести отдельно от основной истории заказов.
- Все вызовы MCP оборачивать в отдельный adapter/service слой.

## Предлагаемая структура репозитория

```text
.
├── AGENTS.md
├── BACKLOG.md
├── package.json
├── railway.json
├── Dockerfile
├── src/
│   ├── app/
│   ├── config/
│   ├── telegram/
│   ├── domain/
│   │   ├── orders/
│   │   ├── history/
│   │   └── imports/
│   ├── integrations/
│   │   └── vkusvill-mcp/
│   ├── db/
│   ├── cli/
│   └── common/
├── scripts/
│   ├── import-orders.sh
│   └── smoke-test.sh
└── docs/
    ├── architecture.md
    ├── csv-format.md
    └── runbook.md
```

## Модель данных

### Основные таблицы

- `users`
  - внутренний пользователь приложения;
  - может быть связан с Telegram user id.
- `telegram_chats`
  - Telegram-группы и служебные метаданные.
- `chat_members`
  - связь пользователей и чатов.
- `orders`
  - заказ группы;
  - статусы: `draft`, `finalized`, `cancelled`.
- `order_items`
  - позиции активной или завершенной корзины.
- `order_events`
  - аудит действий: добавление, удаление, смена количества, финализация.
- `product_snapshots`
  - снимок товара на момент выбора: название, цена, рейтинг, вес, `xml_id`, url.
- `historical_orders`
  - каноническая история заказов из Telegram и CSV.
- `historical_order_items`
  - позиции исторических заказов.
- `import_jobs`
  - запуски импорта CSV.
- `import_job_rows`
  - результаты обработки строк CSV.
- `integration_logs`
  - ошибки и метаданные вызовов MCP.

### Ключевые правила

- В группе одновременно допускается только один `draft`-заказ.
- При финализации создается immutable snapshot заказа.
- Исторические заказы имеют `source`: `telegram` или `csv_import`.
- Импорт CSV должен быть идемпотентным.
- У каждого imported order должен быть dedupe key.

## Этапы реализации

## Этап 1. Bootstrap проекта

### Цель

Поднять deployable skeleton проекта.

### Задачи

- Инициализировать Node.js/TypeScript проект.
- Выбрать framework backend:
  - `Fastify` как предпочтительный минималистичный вариант;
  - допускается `NestJS`, если нужен более формальный модульный каркас.
- Настроить линтер, formatter, strict TypeScript.
- Добавить базовый HTTP сервер.
- Добавить `GET /health`.
- Добавить конфигурацию через env.
- Подготовить `Dockerfile`.
- Подготовить `railway.json` или equivalent service config.

### Definition of done

- Проект запускается локально.
- Есть healthcheck.
- Проект собирается в контейнер.
- Railway может задеплоить сервис без бизнес-логики.

## Этап 2. MySQL и слой доступа к данным

### Цель

Подготовить надежную схему хранения данных.

### Задачи

- Выбрать ORM:
  - `Prisma` как предпочтительный вариант;
  - `Drizzle` допустим, если нужен больший контроль SQL.
- Настроить подключение к MySQL.
- Добавить миграции.
- Описать основные таблицы MVP:
  - `users`
  - `telegram_chats`
  - `chat_members`
  - `orders`
  - `order_items`
  - `product_snapshots`
  - `historical_orders`
  - `historical_order_items`
  - `import_jobs`
  - `import_job_rows`
- Добавить индексы:
  - по `telegram_chat_id`;
  - по `status`;
  - по внешним id импорта;
  - по `created_at`.
- Реализовать transaction wrappers для корзины и финализации.

### Definition of done

- Миграции проходят локально.
- Модели покрывают весь MVP.
- Есть репозитории или query services для заказов, истории и импорта.

## Этап 3. Интеграция с Vkusvill MCP

### Цель

Изолировать работу с внешним MCP и не размазывать transport details по приложению.

### Задачи

- Создать модуль `integrations/vkusvill-mcp`.
- Реализовать клиент с методами:
  - `searchProducts(query, sort, page)`
  - `getProductDetails(id)`
  - `createCartLink(items)`
- Добавить:
  - timeout;
  - retry с ограничением;
  - parse JSON из текстового ответа;
  - логирование ошибок;
  - защиту от невалидной структуры ответа.
- Нормализовать DTO:
  - `ProductSearchResult`
  - `ProductDetails`
  - `CartLinkResult`
- Подготовить mock/fake клиент для тестов.

### Definition of done

- Есть единый клиент MCP.
- Бизнес-логика приложения не знает о сыром формате ответа MCP.
- Есть интеграционные тесты на happy path и error path.

## Этап 4. Domain layer для корзины и истории

### Цель

Собрать бизнес-правила отдельно от Telegram.

### Задачи

- Реализовать `OrderService`.
- Реализовать сценарии:
  - создать заказ;
  - получить активный заказ группы;
  - добавить позицию;
  - удалить позицию;
  - изменить количество;
  - показать корзину;
  - финализировать заказ;
  - отменить заказ.
- Реализовать `HistoryService`.
- Реализовать `ReorderService`.
- При финализации:
  - проверять лимиты;
  - формировать payload для `createCartLink`;
  - сохранять `share_basket` ссылку;
  - переносить данные в исторические таблицы.
- Добавить optimistic locking или другой механизм защиты от гонок.

### Definition of done

- Все сценарии корзины работают без Telegram UI.
- Domain layer тестируется отдельно.
- Финализация атомарна.

## Этап 5. Telegram Bot MVP

### Цель

Сделать рабочий bot UX в группе.

### Команды MVP

- `/start`
- `/help`
- `/new_order`
- `/cart`
- `/cancel`
- `/history`

### Пользовательские сценарии MVP

- Пользователь создает новый заказ в группе.
- Пользователь ищет товар через команду или кнопку.
- Бот показывает найденные варианты.
- Пользователь выбирает товар и количество.
- Бот добавляет позицию в общую корзину.
- Бот показывает содержимое корзины.
- Пользователь удаляет позицию.
- Пользователь финализирует корзину.
- Бот публикует `share_basket` ссылку.

### Технические задачи

- Подключить Telegram Bot API.
- Настроить webhook endpoint.
- Проверять сигнатуры/секрет webhook, если используется.
- Реализовать command handlers.
- Реализовать inline keyboards.
- Реализовать state machine для многошаговых сценариев:
  - поиск;
  - выбор варианта;
  - выбор количества.
- Обработать дубликаты Telegram updates.

### Definition of done

- Бот работает в группе.
- Корзина реально собирается через MCP.
- Ссылка корзины генерируется и сохраняется в историю.

## Этап 6. История и повтор заказа

### Цель

Сделать историю полезной для реальных повторных покупок.

### Задачи

- Реализовать просмотр истории по группе.
- Показать последние N заказов.
- Реализовать повтор заказа:
  - полностью;
  - по выбранным позициям.
- Добавить summary:
  - дата;
  - автор финализации;
  - количество позиций;
  - ссылка корзины;
  - источник.
- Реализовать fallback, если часть исторических товаров больше не находится через MCP.

### Definition of done

- Пользователь может поднять историю и заново собрать похожую корзину.

## Этап 7. CSV import через shell/CLI

### Цель

Подтягивать старую историю без web UI.

### Формат запуска

```bash
npm run import:csv -- /absolute/path/orders.csv
```

или

```bash
./scripts/import-orders.sh /absolute/path/orders.csv
```

### Задачи

- Создать CLI entrypoint `src/cli/import-orders.ts`.
- Реализовать режимы:
  - `--dry-run`
  - `--execute`
  - `--skip-duplicates`
  - `--fail-on-row-error`
- Описать CSV schema в `docs/csv-format.md`.
- Реализовать parser.
- Реализовать validator.
- Реализовать normalizer.
- Реализовать dedupe logic.
- Реализовать import job logging.
- Реализовать итоговый отчет:
  - total rows;
  - valid rows;
  - imported rows;
  - skipped rows;
  - error rows.
- Обновить исторические таблицы через отдельный import service.

### Требования к импорту

- Импорт должен быть идемпотентным.
- Ошибки строк не должны ломать весь импорт по умолчанию.
- Должен быть режим строгого падения для отладки.
- Все ошибки должны логироваться с номером строки.

### Definition of done

- CSV импортируется из shell.
- Есть dry-run и отчет.
- Повторный запуск не создает дубли.

## Этап 8. Observability и эксплуатация

### Цель

Сделать приложение пригодным для продакшена.

### Задачи

- Structured logs.
- Correlation id для запросов.
- Логирование Telegram updates без чувствительных данных.
- Логирование вызовов MCP без переполнения логов сырыми payload.
- Глобальный error handler.
- Метрики:
  - количество команд;
  - количество финализаций;
  - количество ошибок MCP;
  - количество импортов;
  - количество ошибочных импортов.
- Runbook:
  - Telegram webhook не отвечает;
  - Railway deploy сломан;
  - MySQL недоступен;
  - MCP недоступен;
  - CSV импорт упал на части строк.

### Definition of done

- Основные операционные сбои диагностируются без ручного дебага в коде.

## Этап 9. Тестирование и релиз

### Цель

Выпустить MVP без грубых регрессий.

### Задачи

- Unit tests:
  - domain services;
  - CSV normalization;
  - dedupe logic;
  - MCP response parsing.
- Integration tests:
  - MySQL repositories;
  - Telegram webhook endpoint;
  - order finalization flow.
- Smoke tests:
  - healthcheck;
  - webhook route;
  - one end-to-end order flow в staging.
- Подготовить staging environment в Railway.
- Подготовить production checklist.

### Definition of done

- Есть минимальный test suite.
- Есть staging.
- Есть воспроизводимый сценарий релиза.

## Приоритеты backlog

## P0

- Bootstrap backend.
- MySQL schema и миграции.
- MCP client.
- Order domain service.
- Telegram webhook и команды MVP.
- Финализация корзины и запись в историю.
- CLI импорт CSV с dry-run.

## P1

- Reorder из истории.
- Улучшенный dedupe для CSV.
- Защита от гонок.
- Расширенные логи и метрики.
- Smoke-test scripts.

## P2

- Рекомендации на базе прошлых заказов.
- Более умный поиск по естественному языку.
- Несколько параллельных заказов на одну группу.
- Персональные предпочтения пользователей.

## Риски

- MCP ВкусВилла может менять формат ответа или лимиты.
- CSV от ВкусВилла может быть неоднородным между выгрузками.
- Групповые сценарии легко ломаются гонками без явной блокировки.
- Исторические товары могут не находиться повторно через MCP.
- Telegram UX быстро усложняется, если рано уйти в свободный текст вместо команд и кнопок.

## Что делать Codex в первую очередь

1. Поднять каркас `TypeScript + Fastify + MySQL + Prisma`.
2. Создать миграции базовых таблиц.
3. Сделать `VkusvillMcpClient`.
4. Реализовать `OrderService`.
5. Подключить Telegram webhook и базовые команды.
6. Довести сценарий до рабочей генерации `share_basket`.
7. Реализовать CLI импорт CSV.
8. Добавить историю и `reorder`.

## Первый sprint backlog

- Инициализация проекта.
- Подключение MySQL.
- Базовые миграции.
- Конфиг и env schema.
- `GET /health`.
- `VkusvillMcpClient.searchProducts`.
- `VkusvillMcpClient.createCartLink`.
- `OrderService.createDraftOrder`.
- `OrderService.addItem`.
- `OrderService.finalize`.
- Telegram webhook route.
- Команды `/new_order` и `/cart`.

## Второй sprint backlog

- Команда поиска и выбор товара через кнопки.
- Удаление позиции.
- История заказов.
- Snapshot данных товара.
- CSV parser.
- Dry-run import.
- Import job logging.
- Скрипт `scripts/import-orders.sh`.

## Третий sprint backlog

- Reorder.
- Race condition protection.
- Error handling hardening.
- Staging smoke tests.
- Runbook и документация.
