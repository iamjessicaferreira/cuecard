import { io, type Socket } from "socket.io-client";
import type { PlayerView } from "../src/shared/types";

const url = process.env.SMOKE_URL ?? "http://127.0.0.1:4317";

function connect(): Promise<{ socket: Socket; next: () => Promise<PlayerView> }> {
  const socket = io(url, { transports: ["websocket"] });
  const queue: PlayerView[] = [];
  let waiting: ((view: PlayerView) => void) | null = null;
  socket.on("state", (view: PlayerView) => {
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(view);
    } else {
      queue.push(view);
    }
  });
  const next = () =>
    new Promise<PlayerView>((resolve) => {
      const queued = queue.shift();
      if (queued) resolve(queued);
      else waiting = resolve;
    });
  return new Promise((resolve) => socket.on("connect", () => resolve({ socket, next })));
}

function ask(socket: Socket, event: string, payload: unknown): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

async function main() {
  const host = await connect();
  const created = await ask(host.socket, "create", {
    playerId: "player-host-1",
    nickname: "Ana",
    settings: {
      cardLang: "en",
      themeIds: ["art"],
      deckId: "art-en-1",
      mix: false,
      cardCount: 5,
      turnSeconds: 60,
      opponentsSeeFullCard: false,
      contestEnabled: false,
      mode: "cooperative",
      teamCount: 2,
    },
    seenIds: [],
  });
  if (!created.ok) throw new Error(`create ${created.error}`);
  const opened = await host.next();
  console.log("room", opened.code, opened.phase);

  const beto = await connect();
  const caio = await connect();
  const joinedB = await ask(beto.socket, "join", { code: opened.code, playerId: "player-beto-1", nickname: "Beto", seenIds: [] });
  const joinedC = await ask(caio.socket, "join", { code: opened.code, playerId: "player-caio-1", nickname: "Caio", seenIds: [] });
  if (!joinedB.ok || !joinedC.ok) throw new Error(`join ${joinedB.error} ${joinedC.error}`);

  const started = await ask(host.socket, "action", { type: "start" });
  if (!started.ok) throw new Error(`start ${started.error}`);
  let view = await host.next();
  while (view.phase === "lobby") view = await host.next();
  if (view.phase !== "round_intro" || view.mode !== "cooperative") {
    throw new Error(`bad start ${view.phase} ${view.mode}`);
  }

  const advanced = await ask(host.socket, "action", { type: "advance" });
  if (!advanced.ok) throw new Error(`advance ${advanced.error}`);
  view = await host.next();
  while (view.phase === "round_intro") view = await host.next();

  const began = await ask(host.socket, "action", { type: "begin-turn" });
  if (!began.ok) throw new Error(`begin ${began.error}`);
  let giver = await host.next();
  while (giver.phase !== "turn") giver = await host.next();
  let guesser = await beto.next();
  while (guesser.phase !== "turn") guesser = await beto.next();

  if (giver.card.kind !== "full") throw new Error(`giver card ${giver.card.kind}`);
  if (guesser.card.kind !== "hidden") throw new Error(`guesser card ${guesser.card.kind}`);
  if (!guesser.you.canBonk) throw new Error("guesser should bonk");
  const secret = giver.card.kind === "full" ? giver.card.word : "";
  if (JSON.stringify(guesser).includes(secret)) throw new Error("word leaked");
  console.log("hidden from guesser; word is", secret, "left", giver.cardsLeft);

  const got = await ask(host.socket, "action", { type: "got-it" });
  if (!got.ok) throw new Error(`got ${got.error}`);
  let revealed = await beto.next();
  while (revealed.phase !== "reveal") revealed = await beto.next();
  if (revealed.card.kind !== "reveal" || revealed.card.word !== secret) throw new Error("reveal mismatch");
  console.log("revealed", revealed.card.word);

  host.socket.close();
  beto.socket.close();
  caio.socket.close();
  console.log("smoke ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
