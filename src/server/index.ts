import { createServer } from "node:http";
import path from "node:path";
import express from "express";
import { Server } from "socket.io";
import { CODE_ALPHABET, CODE_LENGTH, GAME_NAME, ROOM_TTL_MS } from "../shared/config";
import { createRoom, needsTick, projectView, step, type EngineAction } from "../shared/engine";
import type { Card, GameState, RoomSettings } from "../shared/types";
import { loadContent } from "./content";

const PORT = Number(process.env.PORT) || 4317;
const HOST = "0.0.0.0";
const content = loadContent(path.resolve(process.cwd(), "content"));

interface Binding {
  code: string;
  playerId: string;
}

interface RoomRecord {
  state: GameState;
  cards: Record<string, Card>;
  /** playerId -> socket id */
  sockets: Map<string, string>;
}

const rooms = new Map<string, RoomRecord>();
const bindings = new Map<string, Binding>();

const CLIENT_ACTIONS = new Set([
  "update-settings",
  "claim-team",
  "move-player",
  "shuffle-teams",
  "set-team-count",
  "set-seen",
  "set-best",
  "start",
  "begin-turn",
  "got-it",
  "bonk",
  "self-bonk",
  "contest",
  "accept-bonk",
  "advance",
  "play-anyway",
  "skip-ready",
  "back-to-lobby",
  "leave",
]);

function makeCode(): string {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    let code = "";
    for (let index = 0; index < CODE_LENGTH; index += 1) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  throw new Error("Could not allocate a room code");
}

function seed(): number {
  return Math.floor(Math.random() * 2_000_000_000) + 1;
}

function cleanId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (id.length < 8 || id.length > 80) return null;
  if (!/^[a-zA-Z0-9-]+$/.test(id)) return null;
  return id;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function broadcast(io: Server, room: RoomRecord, events: { type: string; fx?: string; key?: string }[]) {
  const now = Date.now();
  for (const [playerId, socketId] of room.sockets) {
    io.to(socketId).emit("state", projectView(room.state, playerId, room.cards, now));
  }
  if (events.length === 0) return;
  for (const socketId of room.sockets.values()) {
    for (const event of events) {
      if (event.type === "fx") io.to(socketId).emit("fx", { fx: event.fx });
      if (event.type === "notice") io.to(socketId).emit("notice", { key: event.key });
    }
  }
}

function remember(io: Server, socketId: string, room: RoomRecord, playerId: string) {
  const previous = room.sockets.get(playerId);
  if (previous && previous !== socketId) {
    bindings.delete(previous);
    room.sockets.delete(playerId);
    io.sockets.sockets.get(previous)?.disconnect(true);
  }
  room.sockets.set(playerId, socketId);
  bindings.set(socketId, { code: room.state.code, playerId });
  const socket = io.sockets.sockets.get(socketId);
  socket?.join(room.state.code);
}

function applySeenAndBest(state: GameState, playerId: string, seenIds: string[], best: unknown, now: number): GameState {
  let next = state;
  if (seenIds.length > 0) {
    const result = step(next, { type: "set-seen", playerId, cardIds: seenIds, now });
    next = result.state;
  }
  if (best && typeof best === "object") {
    const record = best as { key?: unknown; score?: unknown };
    if (typeof record.key === "string" && typeof record.score === "number") {
      const result = step(next, { type: "set-best", playerId, key: record.key, score: record.score, now });
      next = result.state;
    }
  }
  return next;
}

function toAction(type: string, raw: Record<string, unknown>, playerId: string, now: number, room: RoomRecord): EngineAction | { error: string } {
  switch (type) {
    case "update-settings":
      return { type, playerId, settings: (raw.settings ?? {}) as Partial<RoomSettings>, now };
    case "claim-team":
      return { type, playerId, teamId: String(raw.teamId ?? ""), now };
    case "move-player":
      return { type, playerId, targetId: String(raw.targetId ?? ""), teamId: String(raw.teamId ?? ""), now };
    case "shuffle-teams":
      return { type, playerId, seed: seed(), now };
    case "set-team-count":
      return { type, playerId, count: Number(raw.count), now };
    case "set-seen":
      return { type, playerId, cardIds: asStringArray(raw.cardIds), now };
    case "set-best":
      return { type, playerId, key: String(raw.key ?? ""), score: Number(raw.score), now };
    case "start": {
      const pool = content.poolFor(room.state.settings);
      if (pool.error || pool.cards.length === 0) return { error: pool.error ?? "errors.notEnoughCards" };
      return { type, playerId, now, seed: seed(), pool: pool.cards };
    }
    case "begin-turn":
    case "got-it":
    case "bonk":
    case "self-bonk":
    case "contest":
    case "accept-bonk":
    case "advance":
    case "play-anyway":
    case "skip-ready":
    case "back-to-lobby":
    case "leave":
      return { type, playerId, now };
    default:
      return { error: "errors.unknown" };
  }
}

async function main() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, { maxHttpBufferSize: 1e6 });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get("/api/catalog", (_req, res) => {
    res.json(content.catalog);
  });

  app.get("/manifest.webmanifest", (_req, res) => {
    res.type("application/manifest+json");
    res.json({
      name: GAME_NAME,
      short_name: GAME_NAME,
      description: "A parlor word game for people in the same room.",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#14122B",
      theme_color: "#14122B",
      lang: "pt-BR",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    });
  });

  if (process.env.NODE_ENV === "production") {
    const dist = path.resolve(process.cwd(), "dist");
    app.use(express.static(dist, { index: false, maxAge: "1h" }));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      if (req.path.startsWith("/api") || req.path.startsWith("/socket.io") || req.path === "/health") return next();
      res.sendFile(path.join(dist, "index.html"));
    });
  } else {
    const { createServer: createVite } = await import("vite");
    const vite = await createVite({
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  io.on("connection", (socket) => {
    socket.on("create", (raw: unknown, ack?: (result: { ok: boolean; error?: string }) => void) => {
      const body = (raw ?? {}) as Record<string, unknown>;
      const playerId = cleanId(body.playerId);
      const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
      if (!playerId) return ack?.({ ok: false, error: "errors.unknown" });
      if (nickname.length < 1 || nickname.length > 16) return ack?.({ ok: false, error: "errors.nickname" });
      if (rooms.size > 100) return ack?.({ ok: false, error: "errors.roomFull" });
      try {
        const now = Date.now();
        const code = makeCode();
        let state = createRoom({
          code,
          host: { id: playerId, nickname },
          now,
          settings: (body.settings ?? {}) as Partial<RoomSettings>,
        });
        state = applySeenAndBest(state, playerId, asStringArray(body.seenIds), body.best, now);
        const room: RoomRecord = { state, cards: {}, sockets: new Map() };
        rooms.set(code, room);
        remember(io, socket.id, room, playerId);
        broadcast(io, room, []);
        console.log(`room ${code} created`);
        ack?.({ ok: true });
      } catch (error) {
        console.error(error);
        ack?.({ ok: false, error: "errors.unknown" });
      }
    });

    socket.on("join", (raw: unknown, ack?: (result: { ok: boolean; error?: string }) => void) => {
      const body = (raw ?? {}) as Record<string, unknown>;
      const playerId = cleanId(body.playerId);
      const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
      const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
      const room = rooms.get(code);
      if (!playerId || !room) return ack?.({ ok: false, error: "errors.missingRoom" });
      if (nickname.length < 1 || nickname.length > 16) return ack?.({ ok: false, error: "errors.nickname" });
      const now = Date.now();
      const joined = step(room.state, { type: "join", player: { id: playerId, nickname, joinedAt: now }, now });
      if (joined.error) return ack?.({ ok: false, error: joined.error });
      room.state = applySeenAndBest(joined.state, playerId, asStringArray(body.seenIds), body.best, now);
      remember(io, socket.id, room, playerId);
      broadcast(io, room, []);
      ack?.({ ok: true });
    });

    socket.on("reconnect", (raw: unknown, ack?: (result: { ok: boolean; error?: string }) => void) => {
      const body = (raw ?? {}) as Record<string, unknown>;
      const playerId = cleanId(body.playerId);
      const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
      const room = rooms.get(code);
      if (!playerId || !room) return ack?.({ ok: false, error: "errors.missingRoom" });
      const now = Date.now();
      const result = step(room.state, { type: "reconnect", playerId, now });
      if (result.error) return ack?.({ ok: false, error: result.error });
      room.state = result.state;
      remember(io, socket.id, room, playerId);
      broadcast(io, room, result.events);
      ack?.({ ok: true });
    });

    socket.on("action", (raw: unknown, ack?: (result: { ok: boolean; error?: string }) => void) => {
      const body = (raw ?? {}) as Record<string, unknown>;
      const type = typeof body.type === "string" ? body.type : "";
      const binding = bindings.get(socket.id);
      if (!binding || !CLIENT_ACTIONS.has(type)) return ack?.({ ok: false, error: "errors.unknown" });
      const room = rooms.get(binding.code);
      if (!room) return ack?.({ ok: false, error: "errors.missingRoom" });
      const now = Date.now();
      const action = toAction(type, body, binding.playerId, now, room);
      if ("error" in action) return ack?.({ ok: false, error: action.error });
      const result = step(room.state, action);
      if (result.error) return ack?.({ ok: false, error: result.error });
      room.state = result.state;
      if (action.type === "start") {
        const pool = content.poolFor(room.state.settings);
        room.cards = Object.fromEntries(
          room.state.matchCardIds.flatMap((id) => {
            const card = pool.cards.find((item) => item.id === id);
            return card ? [[id, card] as const] : [];
          }),
        );
      }
      if (action.type === "back-to-lobby") room.cards = {};
      if (action.type === "leave") {
        room.sockets.delete(binding.playerId);
        bindings.delete(socket.id);
        socket.leave(room.state.code);
        if (room.state.players.length === 0) rooms.delete(room.state.code);
      }
      if (rooms.has(room.state.code)) broadcast(io, room, result.events);
      ack?.({ ok: true });
    });

    socket.on("disconnect", () => {
      const binding = bindings.get(socket.id);
      if (!binding) return;
      bindings.delete(socket.id);
      const room = rooms.get(binding.code);
      if (!room) return;
      if (room.sockets.get(binding.playerId) !== socket.id) return;
      room.sockets.delete(binding.playerId);
      const result = step(room.state, { type: "disconnect", playerId: binding.playerId, now: Date.now() });
      room.state = result.state;
      broadcast(io, room, result.events);
    });
  });

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const anyone = room.state.players.some((player) => player.connected);
      if (!anyone && now - room.state.lastActivityAt > ROOM_TTL_MS) {
        rooms.delete(code);
        continue;
      }
      if (!needsTick(room.state, now)) continue;
      const result = step(room.state, { type: "tick", now });
      if (result.state === room.state && result.events.length === 0) continue;
      room.state = result.state;
      broadcast(io, room, result.events);
    }
  }, 250);
  timer.unref?.();

  httpServer.listen(PORT, HOST, () => {
    console.log(`${GAME_NAME} listening on http://${HOST}:${PORT}`);
  });

  const shutdown = () => {
    clearInterval(timer);
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
