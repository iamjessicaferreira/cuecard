import { bestScoreKey } from "@shared/engine";
import type { RoomSettings } from "@shared/types";

export type UiLocale = "pt-BR" | "en";

const SEEN = "cuecard.seen";
const BEST = "cuecard.best";
const LOCALE = "cuecard.locale";
const PREFS = "cuecard.prefs";
const SESSION = "cuecard.session";
const TAB = "cuecard.playerId";

export interface SavedSession {
  code: string;
  playerId: string;
  nickname: string;
  ts: number;
}

export interface Prefs {
  sound: boolean;
  vibrate: boolean;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function detectLocale(): UiLocale {
  const saved = localStorage.getItem(LOCALE);
  if (saved === "en" || saved === "pt-BR") return saved;
  return navigator.language.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
}

export function readLocale(): UiLocale {
  return detectLocale();
}

export function writeLocale(locale: UiLocale) {
  localStorage.setItem(LOCALE, locale);
}

export function readPrefs(): Prefs {
  return { sound: true, vibrate: true, ...readJson<Partial<Prefs>>(PREFS, {}) };
}

export function writePrefs(prefs: Prefs) {
  localStorage.setItem(PREFS, JSON.stringify(prefs));
}

export function readSeen(): string[] {
  const ids = readJson<string[]>(SEEN, []);
  return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
}

export function writeSeen(ids: string[]) {
  localStorage.setItem(SEEN, JSON.stringify([...new Set(ids)]));
}

export function mergeSeen(ids: string[]): string[] {
  const next = [...new Set([...readSeen(), ...ids])];
  writeSeen(next);
  return next;
}

export function readBest(settings: RoomSettings): number | null {
  const table = readJson<Record<string, number>>(BEST, {});
  const score = table[bestScoreKey(settings)];
  return typeof score === "number" ? score : null;
}

export function writeBest(settings: RoomSettings, score: number) {
  const table = readJson<Record<string, number>>(BEST, {});
  table[bestScoreKey(settings)] = score;
  localStorage.setItem(BEST, JSON.stringify(table));
}

export function readSession(): SavedSession | null {
  const session = readJson<SavedSession | null>(SESSION, null);
  if (!session || typeof session.code !== "string" || typeof session.playerId !== "string") return null;
  if (Date.now() - session.ts > 3 * 60 * 60 * 1000) return null;
  return session;
}

export function writeSession(session: SavedSession) {
  localStorage.setItem(SESSION, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION);
}

export function tabPlayerId(): string {
  const existing = sessionStorage.getItem(TAB);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(TAB, created);
  return created;
}

export function adoptPlayerId(playerId: string) {
  sessionStorage.setItem(TAB, playerId);
}
