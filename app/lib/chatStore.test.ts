import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimal in-memory localStorage so chatStore (browser code) runs under node:test.
// Defined before importing chatStore; chatStore only touches localStorage at call time.
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();

import {
  loadConversation,
  saveConversation,
  appendMessage,
  clearConversation,
  deleteConversation,
} from './chatStore';

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage.clear();
});

test('empty by default', () => {
  assert.deepEqual(loadConversation('m1'), []);
});

test('save then load round-trips', () => {
  saveConversation('m1', [{ role: 'user', text: 'hi', ts: 't1' }]);
  assert.deepEqual(loadConversation('m1'), [{ role: 'user', text: 'hi', ts: 't1' }]);
});

test('append accumulates', () => {
  appendMessage('m1', { role: 'user', text: 'a', ts: 't1' });
  appendMessage('m1', { role: 'assistant', text: 'b', ts: 't2' });
  const conv = loadConversation('m1');
  assert.equal(conv.length, 2);
  assert.deepEqual(conv.map((m) => m.text), ['a', 'b']);
});

test('clear empties the conversation and load returns []', () => {
  appendMessage('m1', { role: 'user', text: 'a', ts: 't1' });
  appendMessage('m1', { role: 'assistant', text: 'b', ts: 't2' });
  clearConversation('m1');
  assert.deepEqual(loadConversation('m1'), []);
});

test('clear is isolated to one meal', () => {
  appendMessage('m1', { role: 'user', text: 'a', ts: 't1' });
  appendMessage('m2', { role: 'user', text: 'x', ts: 't1' });
  clearConversation('m1');
  assert.deepEqual(loadConversation('m1'), []);
  assert.equal(loadConversation('m2').length, 1);
});

test('deleteConversation removes a meal conversation', () => {
  appendMessage('m1', { role: 'user', text: 'a', ts: 't1' });
  deleteConversation('m1');
  assert.deepEqual(loadConversation('m1'), []);
});

test('clear on a non-existent meal is a no-op', () => {
  clearConversation('nope');
  assert.deepEqual(loadConversation('nope'), []);
});
