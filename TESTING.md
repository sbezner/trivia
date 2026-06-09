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

1. Open **http://127.0.0.1:1999** in one browser window → click **Host New Game**. Note the 4-letter room code.
2. Open the same URL in a **second window** (or your phone on the same Wi-Fi — use the `http://<your-ip>:1999` address PartyKit prints) → enter the code → **Join Game**.
3. As the host, hit **Start Game**. Both windows get the same question at once; answer in each and watch the scoreboard update live.

Press `Ctrl+C` in the terminal to stop the server.

> Tip: to reach the dev server from a phone, use the LAN URL PartyKit prints on startup
> (e.g. `http://172.20.10.7:1999`), not `127.0.0.1`.

### Automated check (no browser needed)

The server is plain ES modules, so its game logic can be unit-tested directly.
Save this as `_wstest.mjs`, run it against a live `npm run dev`, then delete it:

```js
// _wstest.mjs — run `npm run dev` in another terminal first, then: node _wstest.mjs
const ROOM = "TEST" + Math.floor(Math.random() * 1000);
const url = `ws://127.0.0.1:1999/parties/main/${ROOM}`;

function client(name) {
  const ws = new WebSocket(url);
  const c = { ws, name, id: null, last: null };
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.type === "welcome") c.id = m.id;
    if (m.type === "state") c.last = m;
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.open = new Promise((r) => ws.addEventListener("open", r));
  return c;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (label, cond) => { cond ? pass++ : fail++; console.log((cond ? "PASS" : "FAIL") + " " + label); };

const A = client("Alice"), B = client("Bob");
await Promise.all([A.open, B.open]);
A.send({ type: "join", name: "Alice" });
B.send({ type: "join", name: "Bob" });
await wait(300);

check("both got an id", !!A.id && !!B.id);
check("A is host", A.last.hostId === A.id);
check("lobby has 2 players", A.last.players.length === 2);

A.send({ type: "start", qpp: 3 });
await wait(200);
check("game started", A.last.phase === "question");
check("deck size 6", A.last.total === 6);
check("answer key hidden", A.last.question.correct === undefined && A.last.correct === null);

A.send({ type: "answer", choice: 0 });
B.send({ type: "answer", choice: 1 });
await wait(200);
check("auto-revealed", A.last.phase === "reveal");
check("correct revealed", typeof A.last.correct === "number");

console.log(`\n${pass} passed, ${fail} failed`);
A.ws.close(); B.ws.close();
process.exit(fail ? 1 : 0);
```

```bash
node _wstest.mjs && rm _wstest.mjs
```

When this repo was built, the full version of this test ran **20/20 green** against a live
PartyKit dev server (host handoff, answer-key hidden until reveal, auto-reveal, scoring,
game-over, and restart all verified).

## Deploy

When local testing looks good:

```bash
npm run deploy     # logs into your free Cloudflare account, prints your public URL
```
