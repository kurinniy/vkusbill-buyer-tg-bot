# Architecture

MVP stack:

- `Node.js + TypeScript`
- `Fastify` for HTTP/webhook layer
- `Prisma + MySQL` for persistence
- Railway for deploy

Application layers:

- `src/app` for HTTP bootstrap and routes
- `src/config` for env parsing
- `src/db` for Prisma client and persistence adapters
- `src/domain` for business rules
- `src/integrations` for external systems such as VkusVill MCP
- `src/telegram` for Telegram bot/webhook handlers
- `src/cli` for CSV import and operational scripts
