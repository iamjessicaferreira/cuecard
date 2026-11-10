# Cuecard

Cuecard is a phone-in-hand parlor game for people in the same room. One player gives clues, their side guesses out loud, and the other side listens for forbidden words. The working name lives in one place, `GAME_NAME` in `src/shared/config.ts`. The catch-word on the big button is `BONK_LABEL` in that same file (default `BONK!`, identical in Portuguese and English).

## How a match works

A match uses one deck and two rounds over those same cards.

1. **Free talk / Fala solto.** The clue-giver can use sentences and stories. The card's own word and its five forbidden words are off limits.
2. **One word / Uma palavra só.** The same cards are shuffled again, with no memory of who saw which card. The clue-giver may say only one word per card. Forbidden words still count.

The clock is **per turn**, not per card (60, 90, or 120 seconds). The clue-giver taps **Start / Iniciar**, then burns through as many cards as they can. The only scoring button is **Got it! / Acertamos!**. There is no skip and no "missed" button.

- A correct guess scores 1, the word is shown to everyone for a moment (the clock is paused), and the next card appears.
- When time runs out mid-card, that card goes to the **end** of the shared pile and the turn passes.
- The pile is one queue for every team. A guessed card leaves the round. The round ends when the pile is empty.
- Round 2 rebuilds the pile by shuffling **all** of the match cards again.

### Who sees what

- The clue-giver sees the word and the forbidden list.
- Guessing teammates see the timer, the score, and how many cards are left. Not the card.
- Opponents see **only the forbidden words**, plus the big button. The host can turn on "Opponents see the full card".
- After a correct guess, the word is revealed to every phone. A card that goes back on the pile is **not** revealed, so the next clue isn't spoiled.

### BONK

`BONK!` means "you said a forbidden word". One press is enough: extra presses in the same moment are ignored. A valid BONK plays a sound and a full-screen splash on every phone, gives that team a strike, puts the current card at the end of the pile, and ends the turn.

Strikes show as three little cards by the score. The first two fill in yellow. The third turns red.

- **Teams:** three strikes and that team loses the match immediately.
- **Together (2–3 players):** a strike subtracts 1 from the shared score (never below zero) and ends the turn. It does **not** end the match, so a small group can finish both rounds. This is the chosen cooperative rule; the alternative was ending the run at three strikes.

If contesting is on (the default), the clue-giver has a few seconds to accept the BONK or wave it off. A self-report ("I said a forbidden word") sticks immediately. In a together-game, any player who isn't giving the clue can press the button. On teams, only the opposing side can.

### Who plays how

- **2–3 players:** together. No teams. Players rotate as clue-giver. Everyone else guesses and may BONK. One shared score, compared with the best this phone remembers for the same setup.
- **4 or more:** two teams by default (up to four). Each phone shows its team color. During a turn it also shows the role: clue-giver, guessing teammate, or opponent.
- Auto picks from the head count. The host can force together for a bigger group. Team play itself asks for at least four people and two on every side, so someone is always there to guess. Uneven sides (3 and 2, for example) are fine above that.
- People can join or leave mid-match. Someone without a team is seated on the smaller side between turns. If the phone giving clues locks or refreshes, the clock pauses for about 20 seconds and then the turn passes.

## Run it locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:4317 . Create a room, then open the same address with `?room=CODE` in other tabs (or scan the QR code from a phone on the same network, using this machine's LAN address).

Other commands:

```bash
npm test                 # game rules and the content validator
npm run validate:content # check /content only
npm run typecheck
npm run build            # client bundle + server bundle
npm start                # production mode, still on $PORT or 4317
```

The production build is the installable PWA: it serves a web manifest and `public/sw.js`. Add it to the home screen from a phone. The dev server also serves the manifest and the service worker.

Rooms live in the server's memory. A restart clears them. That keeps the cost at one small web service.

## Deploy on Render

`render.yaml` defines one free Docker web service. `Dockerfile` builds the app, runs the tests, and starts `node server-dist/index.js`. The process listens on `0.0.0.0:$PORT`.

From the Render dashboard, create a Blueprint from this repo (or point a web service at the Dockerfile). Do not put secrets in the repo; this app doesn't need any. Health check: `/health`.

The free instance sleeps after a stretch of idle time. The first request after that wakes it up.

## Card files

The live bank is already in the repo: six themes, three decks of 50 cards, in `pt-BR` and `en` (1,800 cards). Files are ordered easy to hard. A match does not play them in that order. When the room starts, the chosen cards are shuffled into the round-1 pile, and round 2 shuffles the same set again.

Replace a file, or the whole `content/pt-BR` and `content/en` trees, and restart. The filename (without `.json`) must match `theme_id`. Current ids: `art`, `music`, `geography`, `pop_culture`, `cooking`, `history`.

```text
content/{lang}/{theme_id}.json
content/validate.py
```

`lang` is `pt-BR` or `en`. `version` is optional.

```json
{
  "theme_id": "art",
  "lang": "en",
  "theme_name": "Art",
  "decks": [
    {
      "deck_id": "en-art-1",
      "name": "Deck 1",
      "cards": [
        {
          "id": "en-art-1-001",
          "word": "Mona Lisa",
          "forbidden": ["Leonardo", "smile", "Louvre", "painting", "Paris"],
          "difficulty": "easy"
        }
      ]
    }
  ]
}
```

`npm run validate:content` checks the drop-in shape:

- Every card id is unique across `content/`, and every deck id is unique too.
- `forbidden` is exactly five non-empty strings, with no duplicates on a card.
- A forbidden word must not contain the main word (accents and case ignored).
- Main words are unique across the decks of one theme in one language.
- `difficulty` is `easy`, `medium`, or `hard`.
- If `version` is present, it is a positive integer.

`python3 content/validate.py` is the bank's own checker (3 decks × 50 cards, 20/20/10 difficulty mix, and a stricter root check). It prints warnings for near-duplicate titles and exits 0 when there are no errors.

The host picks one deck, or **Mix**, which draws the requested count from the chosen themes and prefers cards this room's phones have not seen. Seen ids are stored in `localStorage` on each phone and sent to the room. Within a round, a guessed card does not come back; an unfinished card returns to the end of the queue on purpose.

A match size larger than the chosen deck just uses the whole deck. The setup screen offers 8, 15, 20, 30, and 50.

## Sounds

There are no audio files. `src/client/audio.ts` synthesizes everything with the Web Audio API: a square-wave clown-horn plus a sine thud for BONK, a falling pair of notes when time runs out, and a short rise when a card is guessed. That synthesis is original to this project. It isn't copied from a recording, and it doesn't need a license or attribution. Each phone can turn sound and vibration off.

## Layout of the code

- `src/shared/engine.ts` — the rules. The server calls this and is the authority for the clock, the pile, scores, strikes, and whose turn it is.
- `src/shared/validateContent.ts` — the card-file checks.
- `src/server/index.ts` — Express, the static app, and Socket.IO. Each phone gets a view with the words it is allowed to see. Reconnect uses the player id kept in the tab.
- `src/server/extensions.ts` — empty seams for a future voice bridge and for matchmaking. Neither is called. Voice would attach a media room to a game code without taking over the rules. Matchmaking would create rooms for people who are not sitting together.
- `src/client` — the React PWA. All interface copy is in `src/client/locales`. The card language of a room is separate from the language of the buttons.

## Tests

`npm test` covers turn rotation and roles in both modes, scoring, the shared pile (guess removes a card, timeout and BONK park it at the end), round 2 reshuffling every match card, strike-out for teams, the cooperative point penalty, BONK debounce and contesting, word redaction, unseen-card preference, and the content validator.

With the dev server running, `npx tsx scripts/smoke-room.ts` opens three sockets, plays a together-mode turn, and checks that a guesser never receives the secret word.
