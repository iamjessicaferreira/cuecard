import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { BONK_LABEL, GAME_NAME } from "@shared/config";
import { bestScoreKey } from "@shared/engine";
import type { Catalog } from "@shared/catalog";
import type { PlayerView } from "@shared/types";
import { useI18n } from "./i18n";
import type { MessageKey } from "./locales/en";
import { playBonk, playScore, playTimer, unlockAudio, vibrate } from "./lib/audio";
import {
  adoptPlayerId,
  clearSession,
  mergeSeen,
  readBest,
  readPrefs,
  readSeen,
  readSession,
  tabPlayerId,
  writeBest,
  writePrefs,
  writeSession,
  type Prefs,
} from "./lib/storage";
import { HomeScreen } from "./screens/HomeScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { MatchScreen } from "./screens/MatchScreen";

type Ack = { ok: boolean; error?: string };

export function App() {
  const { t, locale, setLocale } = useI18n();
  const playerId = useRef(tabPlayerId());
  const socketRef = useRef<Socket | null>(null);
  const sentSeen = useRef("");
  const sentBest = useRef("");
  const [view, setView] = useState<PlayerView | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [splash, setSplash] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [seen, setSeen] = useState<string[]>(readSeen);
  const roomParam = new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
  const translate = useRef(t);
  translate.current = t;

  function showError(key: string | undefined) {
    const resolved = key && isMessage(key) ? key : "errors.unknown";
    setToast(translate.current(resolved));
    window.setTimeout(() => setToast(null), 2800);
  }

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = GAME_NAME;
    void fetch("/api/catalog")
      .then((response) => response.json())
      .then((data: Catalog) => setCatalog(data))
      .catch(() => showError("errors.unknown"));

    const socket = io({ transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("state", (next: PlayerView) => setView(next));
    socket.on("notice", (event: { key?: string }) => {
      if (event.key) showError(event.key);
    });
    socket.on("fx", (event: { fx?: string }) => {
      if (event.fx === "bonk") {
        playBonk();
        vibrate([30, 40, 90]);
        setSplash(true);
        window.setTimeout(() => setSplash(false), 1200);
      } else if (event.fx === "timer") {
        playTimer();
        vibrate([160, 70, 160]);
      } else if (event.fx === "score") {
        playScore();
      }
    });
    socket.on("connect", () => {
      const session = readSession();
      if (session && session.playerId === playerId.current) {
        socket.emit("reconnect", { code: session.code, playerId: session.playerId }, (result: Ack) => {
          if (!result?.ok) clearSession();
        });
      }
    });
    return () => {
      socket.close();
    };
    // The socket lives for the whole visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!view) return;
    writeSession({ code: view.code, playerId: playerId.current, nickname: view.you.nickname, ts: Date.now() });
    const merged = mergeSeen(view.seenWordIds);
    setSeen(merged);
    const signature = merged.slice().sort().join("|");
    if (signature !== sentSeen.current) {
      sentSeen.current = signature;
      emit({ type: "set-seen", cardIds: merged });
    }
    const score = readBest(view.settings);
    if (score != null) {
      const key = bestScoreKey(view.settings);
      const mark = `${key}:${score}`;
      if (mark !== sentBest.current) {
        sentBest.current = mark;
        emit({ type: "set-best", key, score });
      }
    }
    if (view.phase === "finished" && view.mode === "cooperative" && view.coop) {
      const previous = readBest(view.settings);
      if (previous == null || view.coop.score > previous) writeBest(view.settings, view.coop.score);
    }
    const url = `/?room=${view.code}`;
    if (location.search !== `?room=${view.code}`) history.replaceState(null, "", url);
  }, [view]);

  useEffect(() => {
    const live = view?.phase === "turn" || view?.phase === "turn_ready";
    if (!live || !("wakeLock" in navigator)) return;
    let released = false;
    let sentinel: { release: () => Promise<void> } | null = null;
    void navigator.wakeLock
      .request("screen")
      .then((lock) => {
        if (released) void lock.release();
        else sentinel = lock;
      })
      .catch(() => undefined);
    return () => {
      released = true;
      void sentinel?.release();
    };
  }, [view?.phase]);

  function emit(action: Record<string, unknown>): Promise<void> {
    unlockAudio();
    const socket = socketRef.current;
    if (!socket) {
      showError("errors.offline");
      return Promise.reject(new Error("offline"));
    }
    return new Promise((resolve, reject) => {
      socket.emit("action", action, (result: Ack) => {
        if (!result?.ok) {
          showError(result?.error);
          reject(new Error(result?.error ?? "errors.unknown"));
          return;
        }
        resolve();
      });
    });
  }

  function request(event: "create" | "join" | "reconnect", payload: Record<string, unknown>): Promise<void> {
    unlockAudio();
    const socket = socketRef.current;
    if (!socket) {
      showError("errors.offline");
      return Promise.reject(new Error("offline"));
    }
    return new Promise((resolve, reject) => {
      socket.emit(event, payload, (result: Ack) => {
        if (!result?.ok) {
          showError(result?.error);
          reject(new Error(result?.error ?? "errors.unknown"));
          return;
        }
        resolve();
      });
    });
  }

  const session = readSession();
  const canRejoin = Boolean(session && (session.code === roomParam || !roomParam));

  return (
    <div className="stage" onPointerDown={() => unlockAudio()}>
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-display text-xl">{GAME_NAME}</span>
          {view ? <TeamBadge view={view} label={t} /> : null}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="chip h-9 px-2 text-xs" aria-pressed={locale === "pt-BR"} onClick={() => setLocale("pt-BR")}>
            PT
          </button>
          <button type="button" className="chip h-9 px-2 text-xs" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>
            EN
          </button>
          <button
            type="button"
            className="chip h-9 px-2 text-xs"
            aria-pressed={prefs.sound}
            onClick={() => {
              const next = { ...prefs, sound: !prefs.sound };
              writePrefs(next);
              setPrefs(next);
            }}
          >
            {t("prefs.sound")}
          </button>
        </div>
      </header>

      {toast ? <p className="rounded-2xl bg-[var(--coral)] px-4 py-3 text-center text-sm font-extrabold text-white">{toast}</p> : null}
      {splash ? (
        <div className="splash" aria-hidden="true">
          <span className="splash-word">{BONK_LABEL}</span>
        </div>
      ) : null}

      {!view ? (
        <HomeScreen
          catalog={catalog}
          seen={seen}
          roomCode={roomParam}
          savedName={session?.nickname ?? null}
          onRejoin={
            canRejoin && session
              ? () => {
                  playerId.current = session.playerId;
                  adoptPlayerId(session.playerId);
                  void request("reconnect", { code: session.code, playerId: session.playerId });
                }
              : null
          }
          onCreate={(nickname, settings) => {
            const score = readBest(settings);
            return request("create", {
              playerId: playerId.current,
              nickname,
              settings,
              seenIds: readSeen(),
              best: score == null ? null : { key: bestScoreKey(settings), score },
            });
          }}
          onJoin={(nickname, code) =>
            request("join", { playerId: playerId.current, nickname, code, seenIds: readSeen(), best: null })
          }
        />
      ) : null}

      {view?.phase === "lobby" ? (
        <LobbyScreen
          view={view}
          catalog={catalog}
          seen={seen}
          onPatch={(patch) => emit({ type: "update-settings", settings: patch })}
          onAction={async (action) => {
            if (action.type === "leave") {
              await emit(action);
              clearSession();
              setView(null);
              history.replaceState(null, "", "/");
              return;
            }
            await emit(action);
          }}
        />
      ) : null}

      {view && view.phase !== "lobby" ? (
        <MatchScreen
          view={view}
          onAction={async (action) => {
            await emit(action);
          }}
        />
      ) : null}

      {view ? (
        <div className="mt-auto flex items-center justify-between text-xs font-bold text-white/40">
          <button
            type="button"
            onClick={() => {
              const next = { ...prefs, vibrate: !prefs.vibrate };
              writePrefs(next);
              setPrefs(next);
            }}
          >
            {t("prefs.vibrate")}: {prefs.vibrate ? t("common.on") : t("common.off")}
          </button>
          <button
            type="button"
            onClick={() => {
              void emit({ type: "leave" }).then(() => {
                clearSession();
                setView(null);
                history.replaceState(null, "", "/");
              });
            }}
          >
            {t("lobby.leave")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TeamBadge({ view, label }: { view: PlayerView; label: (key: MessageKey) => string }) {
  if (view.mode === "cooperative") {
    return <span className="rounded-full bg-[var(--mango)] px-2 py-1 text-xs font-extrabold text-[var(--ink)]">{label("team.together")}</span>;
  }
  if (!view.yourTeamColor || !view.yourTeamNameKey) return null;
  return (
    <span className="rounded-full px-2 py-1 text-xs font-extrabold text-white" style={{ background: view.yourTeamColor }}>
      {label(view.yourTeamNameKey as MessageKey)}
    </span>
  );
}

function isMessage(key: string): key is MessageKey {
  return key.startsWith("errors.") || key.startsWith("notices.");
}
