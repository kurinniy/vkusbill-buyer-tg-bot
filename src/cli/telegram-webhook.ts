import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

import { TelegramHttpClient } from '../telegram/index.js';

loadEnv();

const commandSchema = z.enum(['delete', 'info', 'set']);
const command = commandSchema.parse(process.argv[2] ?? 'set');

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_BASE_URL: z.string().url().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
});

const env = envSchema.parse(process.env);
const telegramClient = new TelegramHttpClient(env.TELEGRAM_BOT_TOKEN);

await run(command);

async function run(action: z.infer<typeof commandSchema>): Promise<void> {
  switch (action) {
    case 'set': {
      if (env.TELEGRAM_WEBHOOK_BASE_URL == null) {
        throw new Error('TELEGRAM_WEBHOOK_BASE_URL is required for setting Telegram webhook.');
      }

      const webhookUrl = toWebhookUrl(env.TELEGRAM_WEBHOOK_BASE_URL);

      await telegramClient.setWebhook(
        env.TELEGRAM_WEBHOOK_SECRET == null
          ? {
              url: webhookUrl,
            }
          : {
              url: webhookUrl,
              secretToken: env.TELEGRAM_WEBHOOK_SECRET,
            },
      );

      process.stdout.write(`Telegram webhook set to ${webhookUrl}\n`);
      return;
    }
    case 'info': {
      const webhookInfo = await telegramClient.getWebhookInfo();

      process.stdout.write(
        `${JSON.stringify(
          {
            url: webhookInfo.url,
            hasCustomCertificate: webhookInfo.hasCustomCertificate,
            pendingUpdateCount: webhookInfo.pendingUpdateCount,
            lastErrorDate: webhookInfo.lastErrorDate ?? null,
            lastErrorMessage: webhookInfo.lastErrorMessage ?? null,
          },
          null,
          2,
        )}\n`,
      );
      return;
    }
    case 'delete': {
      await telegramClient.deleteWebhook();
      process.stdout.write('Telegram webhook deleted\n');
      return;
    }
  }
}

function toWebhookUrl(baseUrl: string): string {
  return new URL('/telegram/webhook', ensureTrailingSlash(baseUrl)).toString();
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}
