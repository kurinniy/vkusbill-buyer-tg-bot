import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryTelegramUpdateDeduplicator } from './update-deduplicator.js';

test('InMemoryTelegramUpdateDeduplicator rejects repeated update ids', () => {
  const deduplicator = new InMemoryTelegramUpdateDeduplicator();

  assert.equal(deduplicator.shouldProcess(101), true);
  assert.equal(deduplicator.shouldProcess(101), false);
});

test('InMemoryTelegramUpdateDeduplicator evicts oldest ids after max size', () => {
  const deduplicator = new InMemoryTelegramUpdateDeduplicator(2);

  assert.equal(deduplicator.shouldProcess(1), true);
  assert.equal(deduplicator.shouldProcess(2), true);
  assert.equal(deduplicator.shouldProcess(3), true);
  assert.equal(deduplicator.shouldProcess(1), true);
});
