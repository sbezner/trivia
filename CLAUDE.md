# CLAUDE.md — project context for AI sessions

Totally Rad 80's Trivia — a multiplayer trivia game (80s questions, modern sleek UI)
for a group of people in one living room, each on their own phone, talking trash and
fighting for bragging rights. Owner: Steve Bezner (sbezner@gmail.com).

## Current state (June 2026)

- **Live at: https://rad-trivia.sbezner.partykit.dev** (PartyKit on Cloudflare, free tier).
- Active branch: `self-paced-resume-no-host` (PR #1 → main). All recent work is here.
- The root `index.html` is a LEGACY single-device pass-and-play version. The real
  product is `public/index.html` (client) + `party/server.js` (server). Don't confuse them.

## Commands

```bash
npm install        # one-time; installs PartyKit
npm run dev        # local server at http://127.0.0.1:1999 (LAN URL printed for phones)
npm run deploy     # bumps build stamp (scripts/bump-build.mjs), deploys to Cloudflare
```

No test framework. Verification = throwaway WebSocket scripts against `npm run dev`
(see TESTING.md for a ready-made suite) plus `node --check` on the extracted
`<script type="module">` from public/index.html.

## Design rules (owner's explicit preferences — do not violate)

1. **NO timers, countdowns, or time pressure anywhere.** Ever. Streaks/superlatives
   must be correctness-based only.
2. **No host concept.** Anyone can start a game or the next round; everyone is equal.
3. **Senior-and-kid proof.** Big type, ≥48px touch targets, zero typing required
   (auto-dealt emoji personas), one obvious action per moment, never-shaming feedback
   (no wrong-answer broadcasts — kids in the room).
4. **Modern, sleek visual language** (the old neon look was retired June 2026 at the
   owner's request — do NOT bring back glows/scanlines/Courier/all-caps). Dark theme
   tuned for a living room at night, design tokens in `:root` of public/index.html:
   page `#0F1117`, cards `#181C26` with 1px `#2C3242` borders + soft shadows; violet
   primary `#6C5CE7` (active tab, primary buttons, race fills), amber accent `#FFC857`
   (scores, room codes, win chips, attention dot), mint `#3DDC97` (correct / done /
   connected), soft rose `#FF8A9B` (gentle miss, quit, reconnecting). System font
   stack (`ui-rounded`/`system-ui`, no webfonts), sentence case + small uppercase
   eyebrow labels only, radius 10/14/20px, every text/surface pair WCAG AA. The fun
   comes from color, motion, and the emoji personas — keep it playful, never neon.
5. **2-digit room codes (10–99)**, `?room=NN` invite links. Optimized for "shout the
   number across the room".
6. Phones first (375px wide must look great); desktop secondary.

## Architecture

- **`party/server.js`** — one Durable Object per room. Players keyed by stable
  client id (`cid`), NOT websocket connection: disconnect marks a player offline but
  never deletes them, so refresh/drop resumes exactly (question, score, reveal state).
  Self-paced model: shared deck, each player advances independently; the answer key
  is only sent to a player AFTER they answer. Tracks session `wins` per cid
  (survives New Game re-deals). Broadcasts callout events.
- **`party/questions.js`** — question bank WITH answers; server-side only.
- **`public/index.html`** — the entire client in one file (HTML+CSS+JS, no build
  step; PartySocket via esm.sh). localStorage keys: `trivia.cid`, `trivia.name`,
  `trivia.avatar`, `trivia.room` (drives auto-rejoin on load), `trivia.version`.
  **Version gate**: at boot, if the build stamp differs from stored
  `trivia.version`, ALL trivia.* keys are cleared (quit saved game, fresh
  identity) before identity/auto-rejoin logic runs — new deploys start every
  device fresh. Boot tab rule: in a game → Game tab; not in a game → Controls.
- **`scripts/bump-build.mjs`** — predeploy hook; regexes for `id="version">v(\d+)<`
  in public/index.html and increments it. NEVER change that element's shape.

### WebSocket protocol

Client → server:
`{type:"join", cid, name}` (binds connection to player; name ≤24 UTF-16 units, may
carry an emoji-avatar prefix like "👾 Max") · `{type:"newgame", n}` (anyone; n=3–20)
· `{type:"answer", choice}` · `{type:"next"}` (advances only the sender) ·
`{type:"leave"}` (explicit exit, deletes player).

Server → client:
`{type:"welcome"}` · per-connection `{type:"state", phase, total, qN, myId, myIndex,
done, answered, question, myChoice, correct, iCorrect, tally, answeredCount,
players[]}` where `players[]` = `{id, name, score, progress, done, online, wins,
bestStreak}` · broadcast `{type:"event", kind:"lead"|"streak"|"finish"|"win", cid,
name, n}` for callout toasts.

## UX flow (as shipped)

0. **Navigation**: fixed TOP bar = GAME | CONTROLS segmented tabs (active tab is a
   solid violet pill; amber attention dot appears on GAME when the game surface
   changes while you're on CONTROLS). Connection status lives at the top-right of
   the same bar: quiet green dot when connected, rose "● reconnecting…" pill when
   not. Callout toasts anchor at the BOTTOM of the screen (visible from either tab).
1. **Landing**: auto-dealt 80s persona (dice re-rolls, face picks emoji, name is
   tappable to type). Two giant cards: 🚀 START | 🔢 JOIN (arcade keypad; 2nd digit
   auto-joins).
2. **Lobby**: room number billboard-huge, copy-invite-link, player list, questions
   stepper (3–20, default 10), giant Start anyone can press.
3. **Question**: big type, 64px answer buttons, answer → huge result banner
   ("✔ Tubular! +100" / gentle miss line) → giant NEXT directly below → race-track
   scoreboard (avatar runners → 🏁, crown on leader). Toasts flash on lead changes,
   3/5/10 streaks, finishes, wins.
4. **Game over**: podium (2nd-1st-3rd, 🥇🥈🥉), confetti, 🏆×N session-win chips,
   superlatives (💯 Perfect Round, 🔥 streak). New Game keeps wins, resets scores.

## Known limitations / future ideas

- Room state (incl. session wins) is in DO memory; idle eviction resets the session.
  (Could persist via PartyKit storage API if it ever matters.)
- 90 possible rooms — fine for living rooms, collision-prone at scale.
- Rendering verified by code-walk + parse checks; on-device animation feel
  (race track, toasts, confetti) reviewed by the owner on real phones.
