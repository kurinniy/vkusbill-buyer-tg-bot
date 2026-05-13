import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_WEBHOOK_BASE_URL: z.string().url().optional(),
  VKUSVILL_MCP_BASE_URL: z.string().url().optional(),
  VKUSVILL_MCP_API_KEY: z.string().optional(),
  VKUSVILL_MCP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  VKUSVILL_MCP_RETRY_COUNT: z.coerce.number().int().min(0).max(5).default(2),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(`Invalid environment configuration: ${parsedEnv.error.message}`);
}

export const env = parsedEnv.data;
