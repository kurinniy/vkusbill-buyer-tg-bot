import assert from 'node:assert/strict';
import test from 'node:test';

import { TelegramHttpClient } from './telegram-client.js';

test('TelegramHttpClient setWebhook sends url and secret token', async () => {
  let capturedUrl: string | null = null;
  let capturedBody: string | null = null;

  const client = new TelegramHttpClient('test-token', async (input, init) => {
    capturedUrl = String(input);
    capturedBody = String(init?.body ?? '');

    return new Response(
      JSON.stringify({
        ok: true,
        result: true,
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      },
    );
  });

  await client.setWebhook({
    url: 'https://example.test/telegram/webhook',
    secretToken: 'test-secret',
  });

  assert.equal(capturedUrl, 'https://api.telegram.org/bottest-token/setWebhook');
  assert.deepEqual(JSON.parse(capturedBody ?? '{}'), {
    url: 'https://example.test/telegram/webhook',
    secret_token: 'test-secret',
  });
});

test('TelegramHttpClient getWebhookInfo maps Telegram response fields', async () => {
  const client = new TelegramHttpClient(
    'test-token',
    async () =>
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            url: 'https://example.test/telegram/webhook',
            has_custom_certificate: false,
            pending_update_count: 2,
            last_error_message: 'bad gateway',
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
  );

  const webhookInfo = await client.getWebhookInfo();

  assert.deepEqual(webhookInfo, {
    url: 'https://example.test/telegram/webhook',
    hasCustomCertificate: false,
    pendingUpdateCount: 2,
    lastErrorMessage: 'bad gateway',
  });
});

test('TelegramHttpClient throws on Telegram API error response', async () => {
  const client = new TelegramHttpClient(
    'test-token',
    async () =>
      new Response(
        JSON.stringify({
          ok: false,
          description: 'Bad Request: invalid webhook URL specified',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
  );

  await assert.rejects(
    client.setWebhook({
      url: 'https://example.test/telegram/webhook',
    }),
    /invalid webhook URL specified/,
  );
});
