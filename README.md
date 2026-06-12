# 🕹️ Totally Rad 80's Trivia

A neon-soaked 80's trivia game. It comes in **two flavors**:

1. **Pass-and-play** (`index.html`) — a single self-contained file, no server, no build step. Just open it. 1–6 players share one device.
2. **Online multiplayer** (`public/` + `party/`) — Kahoot-style live play where everyone joins from their own phone with a room code. Powered by [PartyKit](https://www.partykit.io/) on Cloudflare.

## Pass-and-play (local)

```bash
open index.html
```

Or play it live via GitHub Pages once enabled: **Settings → Pages → Deploy from branch → main / root**.

## Online multiplayer (the main game)

**Live now at: https://rad-trivia.sbezner.partykit.dev**

Designed for a group in one room — grandparents to 5-year-olds — phones out, talking trash, fighting for bragging rights. Free to run on Cloudflare's free tier.

### Deploy it

You'll need [Node.js](https://nodejs.org) and a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

```bash
npm install            # installs PartyKit
npm run dev            # test locally at http://127.0.0.1:1999
npm run deploy         # bumps the build stamp, deploys to Cloudflare, prints the URL
```

`npm run deploy` hosts **both** the game UI (`public/index.html`) and the realtime backend (`party/server.js`) at one URL. The build number in the page's corner auto-increments each deploy (`scripts/bump-build.mjs`).

### How it works

- **Zero typing required.** Every visitor is auto-dealt an 80s persona with an emoji avatar (👾 Rad Max). Tap the dice to re-roll, tap the face to pick an emoji, tap the name to type one — all optional.
- **No host.** Two giant cards: 🚀 **START** deals a new game with a 2-digit room code (10–99); 🔢 **JOIN** opens an arcade-style number pad — punch in the code you heard across the room and the second digit auto-joins. Invite links (`?room=NN`) work too.
- **Self-paced.** Everyone answers the same shared deck at their own speed. Answering reveals the answer (and the live answer-distribution bars) just for you; **NEXT** advances only you.
- **The race track.** The scoreboard is a live race: each player's avatar runs toward a 🏁 as they answer, crown on the leader. Callout toasts flash on every phone — lead changes, 3+/5+/10+ streaks, finishes, round wins. Wrong answers are never broadcast (kids in the room).
- **Refresh-proof.** Identity is a stable client id in `localStorage`; a refresh or dropped phone reconnects as the same player and resumes the exact question, score, and reveal state. Disconnected players are kept (marked AWAY), never deleted.
- **Bragging rights.** The server tracks round **wins per player for the session** (🏆×N chips everywhere). Game over is a podium — 🥇🥈🥉 award stand, confetti, and correctness-based superlatives (💯 Perfect Round, 🔥 streaks). Anyone can press **New Game**; wins carry over, scores reset.
- 100 points per correct answer. **No timers anywhere, ever** — no time pressure by design.

### Architecture

| File | Role |
|---|---|
| `party/server.js` | Authoritative game server — one instance per room (a Cloudflare Durable Object). Players keyed by stable `cid`, not connection. Holds state, tracks session wins, broadcasts callout events, hides the answer key until each player answers. |
| `party/questions.js` | The question bank **with answers** — server-side only, never shipped to players. |
| `public/index.html` | The entire client, one file (HTML+CSS+JS, no build step). Arcade entry, keypad join, race track, toasts, podium. Stores `trivia.cid` / `trivia.name` / `trivia.avatar` / `trivia.room` in `localStorage` for refresh-proof resume. |
| `partykit.json` | PartyKit/Cloudflare config (serves `public/`, zero cache TTLs). |
| `scripts/bump-build.mjs` | Auto-increments the on-page build stamp before each deploy. |

### Protocol (WebSocket, JSON)

Client → server: `{type:"join", cid, name}` · `{type:"newgame", n}` · `{type:"answer", choice}` · `{type:"next"}` · `{type:"leave"}`
Server → client: `{type:"welcome"}` · per-connection `{type:"state", ...}` (answer key only after you've answered) · broadcast `{type:"event", kind:"lead"|"streak"|"finish"|"win", cid, name, n}`

### Known limitations

- Room state (scores, session wins) lives in the Durable Object's memory; if Cloudflare evicts an idle room, the session resets.
- 2-digit codes mean only 90 rooms — perfect for a living room, not for strangers at scale.

## Features (pass-and-play)

- 👥 **Pass-and-play multiplayer** (1–6 players) — take turns on one device, with a "pass the device" hand-off between turns
- 🎲 Random questions from a 90+ question bank (pick 3–10 questions per player)
- 🗂️ Seven categories: Movies, Music, TV, Games & Tech, Fads & Culture, History & World, Sports
- 🟰 Live scoreboard during play and a final leaderboard with a winner (handles ties)
- ✅ Instant feedback with the correct answer — no clock, no time pressure
- 🏆 Solo runs get an 80's "rank" (from *Bogus run* to *80's Legend*)
- ⌨️ Keyboard support: `1-4` / `A-D` to answer, `Enter` / `Space` to advance or pass

## Scoring

- 100 points per correct answer
- In multiplayer, each player answers their own questions in turn; highest total wins

Built with plain HTML, CSS, and vanilla JavaScript.
