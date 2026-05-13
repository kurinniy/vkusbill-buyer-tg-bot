import assert from 'node:assert/strict';
import test from 'node:test';

import type { FetchHeaders } from './http-transport.js';
import { VkusvillMcpHttpTransport } from './http-transport.js';

test('VkusvillMcpHttpTransport sends method and payload to gateway', async () => {
  let capturedInput: string | null = null;
  let capturedInit:
    | {
        body?: string;
        headers?: FetchHeaders;
        method?: string;
        signal?: AbortSignal;
      }
    | undefined;

  const transport = new VkusvillMcpHttpTransport(
    'https://example.test/mcp',
    'secret-token',
    async (input, init) => {
      capturedInput = input;
      capturedInit = init;

      return {
        ok: true,
        status: 200,
        async text() {
          return '{"ok":true}';
        },
      };
    },
  );

  const response = await transport.call('vkusvill_products_search', { q: 'бананы' }, 5000);

  assert.equal(response, '{"ok":true}');
  assert.equal(capturedInput, 'https://example.test/mcp');
  assert.equal(capturedInit?.method, 'POST');
  assert.equal(capturedInit?.headers?.authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(capturedInit?.body ?? '{}'), {
    method: 'vkusvill_products_search',
    payload: {
      q: 'бананы',
    },
  });
  assert.ok(capturedInit?.signal instanceof AbortSignal);
});

test('VkusvillMcpHttpTransport throws on non-2xx response', async () => {
  const transport = new VkusvillMcpHttpTransport(
    'https://example.test/mcp',
    undefined,
    async () => ({
      ok: false,
      status: 502,
      async text() {
        return 'bad gateway';
      },
    }),
  );

  await assert.rejects(
    transport.call('vkusvill_cart_link_create', { products: [] }, 5000),
    /status 502/,
  );
});
