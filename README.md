# 🕹️ Totally Rad 80's Trivia

A neon-soaked 80's trivia game. It comes in **two flavors**:

1. **Pass-and-play** (`index.html`) — a single self-contained file, no server, no build step. Just open it. 1–6 players share one device.
2. **Online multiplayer** (`public/` + `party/`) — Kahoot-style live play where everyone joins from their own phone with a room code. Powered by [PartyKit](https://www.partykit.io/) on Cloudflare.

## Pass-and-play (local)

```bash
open index.html
```

Or play it live via GitHub Pages once enabled: **Settings → Pages → Deploy from branch → main / root**.

## Online multiplayer (Kahoot-style)

Everyone plays the **same question at the same time** on their own device; the answer key never leaves the server. Free to run on Cloudflare's free tier.

### Deploy it

You'll need [Node.js](https://nodejs.org) and a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

```bash
npm install            # installs PartyKit
npm run dev            # test locally at http://127.0.0.1:1999
npm run deploy         # logs into Cloudflare and deploys; prints your live URL
```

`npm run deploy` gives you a public URL that hosts **both** the game UI (`public/index.html`) and the realtime backend (`party/server.js`). Share that URL with friends.

### How it works

- **No host.** Anyone starts a **New Game** → gets a 2-digit room code (and a copyable invite link).
- **Others join** by entering the code on their phones — they can hop in any time, even mid-game.
- Self-paced: everyone answers the same shared deck at their own speed. Answering reveals the question (and the live answer-distribution) just for you; **Next** advances only you. Scores are shared and update live.
- **Refresh-proof.** Identity is stored in the browser, so a refresh or a dropped phone reconnects as the same player and resumes exactly where you left off. Any player can start the next **New Game**; everyone stays in the room.
- 100 points per correct answer; final leaderboard crowns the winner (ties handled).

### Architecture

| File | Role |
|---|---|
| `party/server.js` | Authoritative game server — one instance per room (a Cloudflare Durable Object). Holds state, hides the answer key until reveal. |
| `party/questions.js` | The question bank **with answers** — server-side only, never shipped to players. |
| `public/index.html` | The player UI (new-game/join/lobby/question/leaderboard). Stores a stable client id in `localStorage` for refresh-proof resume; never sees the answer key early. |
| `partykit.json` | PartyKit/Cloudflare config. |

### Known limitations (MVP)

- Game state lives in memory while players are connected; if everyone disconnects, the room resets.
- A dropped connection rejoins as a fresh player (score resets) — a future improvement is persistent session IDs via `localStorage`.

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
