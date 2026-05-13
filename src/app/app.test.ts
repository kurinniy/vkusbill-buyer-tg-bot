import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryTelegramUpdateDeduplicator, TelegramCommandHandler } from '../telegram/index.js';
import type { AppDependencies } from './dependencies.js';

test('buildApp adds correlation id header to successful responses', async () => {
  const { buildApp } = await loadBuildApp();
  const app = buildApp(buildTestDependencies());

  const response = await app.inject({
    method: 'GET',
    url: '/health',
  });

  assert.equal(response.statusCode, 200);
  assert.ok(response.headers['x-correlation-id']);

  await app.close();
});

test('buildApp returns correlation id on unhandled errors', async () => {
  const { buildApp } = await loadBuildApp();
  const app = buildApp(buildTestDependencies());

  app.get('/boom', async () => {
    throw new Error('boom');
  });

  const response = await app.inject({
    method: 'GET',
    url: '/boom',
  });

  assert.equal(response.statusCode, 500);
  assert.equal(response.json().error, 'Internal Server Error');
  assert.equal(response.json().correlationId, response.headers['x-correlation-id']);

  await app.close();
});

function buildTestDependencies(): AppDependencies {
  return {
    telegramCommandHandler: new TelegramCommandHandler(
      {
        async addItem() {
          throw new Error('Not implemented');
        },
        async cancel() {
          throw new Error('Not implemented');
        },
        async createDraftOrder() {
          throw new Error('Not implemented');
        },
        async finalize() {
          throw new Error('Not implemented');
        },
        async getActiveOrder() {
          return null;
        },
        async removeItem() {
          throw new Error('Not implemented');
        },
      },
      {
        async getRecentOrders() {
          return [];
        },
      },
      {
        async searchProducts() {
          return { items: [] };
        },
      },
      {
        async sendMessage() {},
      },
    ),
    telegramUpdateDeduplicator: new InMemoryTelegramUpdateDeduplicator(),
  };
}

async function loadBuildApp(): Promise<typeof import('./app.js')> {
  const testEnv = process.env as typeof process.env & {
    DATABASE_URL?: string;
    NODE_ENV?: string;
  };

  testEnv.NODE_ENV = 'test';
  testEnv.DATABASE_URL ??= 'mysql://user:password@127.0.0.1:3306/vkusvill_me_test';

  return import('./app.js');
}
