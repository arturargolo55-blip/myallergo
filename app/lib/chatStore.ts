/**
 * Per-meal chat conversation storage.
 *
 * Isolated behind this module so that when login + a database arrive, ONLY the
 * internals here change (read/write swap from localStorage to the DB); callers keep
 * using the same functions.
 */
import { STORAGE_KEYS } from '../types';

export interface StoredChatMessage {
  role: 'user' | 'assistant';
  text: string;
  ts: string; // ISO timestamp
}

type ChatMap = Record<string, StoredChatMessage[]>;

function readAll(): ChatMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CHATS);
    return raw ? (JSON.parse(raw) as ChatMap) : {};
  } catch {
    return {};
  }
}

function writeAll(map: ChatMap) {
  try {
    localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(map));
  } catch {
    /* ignore quota errors */
  }
}

export function loadConversation(mealId: string): StoredChatMessage[] {
  return readAll()[mealId] ?? [];
}

export function saveConversation(mealId: string, messages: StoredChatMessage[]) {
  const map = readAll();
  map[mealId] = messages;
  writeAll(map);
}

export function appendMessage(mealId: string, message: StoredChatMessage): StoredChatMessage[] {
  const map = readAll();
  const next = [...(map[mealId] ?? []), message];
  map[mealId] = next;
  writeAll(map);
  return next;
}

export function clearConversation(mealId: string) {
  const map = readAll();
  delete map[mealId];
  writeAll(map);
}

/** Remove a meal's conversation when the meal itself is deleted. */
export function deleteConversation(mealId: string) {
  clearConversation(mealId);
}
