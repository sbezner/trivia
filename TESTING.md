# Testing

Two games live in this repo, tested two different ways.

## 1. Pass-and-play (`index.html`) — just open it

No server, no build. Open the file in any browser:

```bash
open index.html          # macOS
# or: xdg-open index.html (Linux), start index.html (Windows)
```

Click **Insert Coin**, set up 1–6 players, and play. Nothing to install.

## 2. Online multiplayer — run the server locally

You need [Node.js](https://nodejs.org). One-time install:

```bash
npm install
```

### Play it in real browsers (the fun way)

```bash
npm run dev
```

This starts the PartyKit server at **http://127.0.0.1:1999**. Then:

1. Open **http://127.0.0.1:1999** in one browser window. You're auto-dealt an 80s persona (tap the dice/face/name to change it). Tap the big 🚀 **START** card. Note the 2-digit room code.
2. Open the same URL in a **second window** (or your phone on the same Wi-Fi — use the `http://<your-ip>:1999` address PartyKit prints) → tap 🔢 **JOIN** → punch the code on the keypad (the second digit auto-joins).
3. In either window, hit **Start Game** (there's no host — anyone can start). Each window gets the shared deck at its own pace; watch the race-track scoreboard move and the callout toasts (lead changes, streaks, finishes) flash in both windows.
4. **Refresh either tab** mid-game — it reconnects and resumes on the same question with the same score and persona (identity is stored in `localStorage`).
5. Finish a round to see the podium + confetti, then **New Game** — 🏆 win chips persist across rounds; scores reset.

Press `Ctrl+C` in the terminal to stop the server.

> Tip: to reach the dev server from a phone, use the LAN URL PartyKit prints on startup
> (e.g. `http://172.20.10.7:1999`), not `127.0.0.1`.

### Automated check (no browser needed)

The server is plain ES modules, so its game logic can be unit-tested directly.
Save this as `_wstest.mjs`, run it against a live `npm run dev`, then delete it:

```js
// _wstest.mjs — run `npm run dev` in another terminal first, then: node _wstest.mjs
// Players are keyed by a stable client id (cid) sent in "join" — NOT the socket.
const ROOM = String(Math.floor(Math.random() * 90) + 10);  // 2-digit code
const url = `ws://127.0.0.1:1999/parties/main/${ROOM}`;

function client(cid, name) {
  let ws = new WebSocket(url);
  const c = { cid, name, last: null };
  const wire = (s) => s.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.type === "state") c.last = m;
  });
  wire(ws);
  c.send = (o) => ws.send(JSON.stringify(o));
  c.open = new Promise((r) => ws.addEventListener("open", r));
  c.join = () => c.send({ type: "join", cid, name });
  c.close = () => ws.close();
  c.reconnect = () => { ws = new WebSocket(url); wire(ws); return new Promise((r) => ws.addEventListener("open", r)); };
  return c;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (label, cond) => { cond ? pass++ : fail++; console.log((cond ? "PASS" : "FAIL") + " " + label); };

const A = client("cid-alice", "Alice"), B = client("cid-bob", "Bob");
await Promise.all([A.open, B.open]);
A.join(); B.join();
await wait(300);

check("A's id is its stable cid", A.last.myId === "cid-alice");
check("no host concept", A.last.hostId === undefined);
check("lobby has 2 players", A.last.players.length === 2);

B.send({ type: "newgame", n: 4 });   // anyone can start
await wait(200);
check("non-creator started game", A.last.phase === "playing");
check("deck size honored (4)", A.last.total === 4);
check("answer key hidden", A.last.question.correct === undefined && A.last.correct === null);

A.send({ type: "answer", choice: 0 });
await wait(150);
const idx = A.last.myIndex, score = A.last.players.find(p => p.id === "cid-alice").score;

A.close();                            // simulate a refresh / dropped phone
await wait(250);
check("dropped player not deleted", !!B.last.players.find(p => p.id === "cid-alice"));
check("dropped player marked offline", B.last.players.find(p => p.id === "cid-alice").online === false);

await A.reconnect(); A.join();         // reconnect with the SAME cid
await wait(250);
check("resumed same question", A.last.myIndex === idx);
check("resumed same score", A.last.players.find(p => p.id === "cid-alice").score === score);
check("back online", B.last.players.find(p => p.id === "cid-alice").online === true);

console.log(`\n${pass} passed, ${fail} failed`);
A.close(); B.close();
process.exit(fail ? 1 : 0);
```

```bash
node _wstest.mjs && rm _wstest.mjs
```

When this rework landed, this suite ran green against a live PartyKit dev server
(no-host start, stable-identity resume after a drop, offline marking, answer-key hidden,
scoring, and New Game all verified).

To also exercise the social layer, extend the script: collect `{type:"event"}` messages
(kinds: `lead`, `streak`, `finish`, `win`), play a full round with two clients
(`answer` + `next` in a loop), and assert that a `win` event fires, `players[].wins`
increments exactly once per round, and wins survive both a reconnect and a `newgame`.
The full-flow suite ran **15/15 green** when the race-track/wins/podium pass landed.

## Deploy

When local testing looks good:

```bash
npm run deploy     # logs into your free Cloudflare account, prints your public URL
```
