import { QUESTIONS } from "./questions.js";

// ---- helpers ----
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const POINTS = 100;
const DEFAULT_N = 10;
const MIN_N = 3, MAX_N = 20;

/**
 * One Server instance == one game room (a Cloudflare Durable Object).
 *
 * NO HOST. Anyone in the room can start a new game; everyone then answers the
 * SAME shared deck, each advancing at their own pace. Answering reveals a
 * question just for that player; Next advances only that player. Scores are
 * shared and update live.
 *
 * IDENTITY IS STABLE. Players are keyed by a client-generated id (`cid`) kept
 * in the browser's localStorage — NOT by the websocket connection id. So a
 * refresh, a dropped phone, or an accidental tab-close reconnects as the SAME
 * player and resumes exactly where they left off (same question, same score).
 * Disconnecting never deletes a player; it only marks them offline.
 */
export default class Server {
  constructor(room) {
    this.room = room;
    this.players = new Map();   // cid -> player (survives disconnects)
    this.conns = new Map();     // connId -> cid (live websocket routing)
    this.phase = "lobby";       // lobby | playing
    this.deck = [];             // shared questions for the round
    this.tallies = [];          // per question index: [n,n,n,n] of picks across all players
    this.qN = DEFAULT_N;        // remembered question count for the next New Game
  }

  newPlayer(cid) {
    return {
      id: cid, name: "", score: 0, pindex: 0,
      answered: false, choice: null, correct: false, done: false,
      online: true,
    };
  }

  onConnect(conn) {
    // We don't know who this is until the client sends its stable id in "join".
    conn.send(JSON.stringify({ type: "welcome" }));
    // Send current state immediately so late/refreshing clients paint without delay.
    conn.send(JSON.stringify(this.stateFor(null)));
  }

  onClose(conn) {
    const cid = this.conns.get(conn.id);
    this.conns.delete(conn.id);
    if (cid) {
      // Keep the player's progress so a refresh/rejoin resumes. Only flag them
      // offline if they have no other live connection open.
      const stillConnected = [...this.conns.values()].includes(cid);
      const p = this.players.get(cid);
      if (p && !stillConnected) p.online = false;
    }
    this.sync();
  }

  onMessage(raw, sender) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // "join" carries the stable client id and (re)binds this connection to a player.
    if (msg.type === "join") {
      const cid = String(msg.cid || "").slice(0, 64);
      if (!cid) return;
      let p = this.players.get(cid);
      if (!p) {
        // A brand-new player. If they arrive mid-game they'll start the shared
        // deck from the top (pindex 0); an existing player keeps their place.
        p = this.newPlayer(cid);
        this.players.set(cid, p);
      }
      // 24 UTF-16 units: room for an emoji avatar prefix (2 units) + a 13-char name.
      p.name = String(msg.name || "").trim().slice(0, 24) || p.name || "Player";
      p.online = true;
      this.conns.set(sender.id, cid);
      this.sync();
      return;
    }

    const cid = this.conns.get(sender.id);
    const p = cid ? this.players.get(cid) : null;
    if (!p) return;

    switch (msg.type) {
      case "answer":  this.handleAnswer(p, msg.choice); break;
      case "next":    this.advance(p); break;
      case "newgame": this.startGame(msg.n); break;   // anyone can start / re-deal
      case "leave":
        // Explicit exit (chose to leave / start fresh) — drop the record entirely.
        this.players.delete(cid);
        this.conns.delete(sender.id);
        break;
    }
    this.sync();
  }

  // ---- game flow ----
  startGame(n) {
    const count = Math.min(Math.max(Number(n) || this.qN, MIN_N), MAX_N, QUESTIONS.length);
    this.qN = count;
    this.deck = shuffle(QUESTIONS).slice(0, count);
    this.tallies = this.deck.map(() => [0, 0, 0, 0]);
    this.phase = "playing";
    // Everyone currently in the room (online or not) joins the fresh round at Q1.
    for (const p of this.players.values()) {
      p.score = 0; p.pindex = 0; p.answered = false; p.choice = null; p.correct = false; p.done = false;
    }
  }

  handleAnswer(p, choice) {
    if (this.phase !== "playing" || p.done || p.answered) return;
    if (typeof choice !== "number" || choice < 0 || choice > 3) return;
    const q = this.deck[p.pindex];
    if (!q) return;
    p.answered = true;
    p.choice = choice;
    p.correct = choice === q.correct;
    if (p.correct) p.score += POINTS;
    this.tallies[p.pindex][choice]++;
  }

  advance(p) {
    // A player can only advance their OWN question, and only after answering it.
    if (this.phase !== "playing" || p.done || !p.answered) return;
    p.pindex++;
    if (p.pindex >= this.deck.length) p.done = true;
    p.answered = false; p.choice = null; p.correct = false;
  }

  // ---- per-connection state (each player sees their OWN question) ----
  scoreboard() {
    return [...this.players.values()].map(p => ({
      id: p.id,
      name: p.name || "…",
      score: p.score,
      // How many questions this player has answered so far.
      progress: p.done ? this.deck.length : Math.min(p.pindex + (p.answered ? 1 : 0), this.deck.length),
      done: p.done,
      online: p.online,
    }));
  }

  stateFor(cid) {
    const p = cid ? this.players.get(cid) : null;
    const playing = this.phase === "playing";
    const q = playing && p && !p.done ? this.deck[p.pindex] : null;
    const answered = !!(p && p.answered);
    const showTally = playing && answered && !!q;
    const tally = showTally ? this.tallies[p.pindex] : null;
    return {
      type: "state",
      phase: this.phase,
      total: this.deck.length,
      qN: this.qN,
      // "me" fields are null when this connection hasn't joined as a player yet.
      myId: p ? p.id : null,
      myIndex: p ? p.pindex : 0,
      done: !!(p && p.done),
      answered,
      // The answer key is only included once this player has answered.
      question: q ? { cat: q.cat, q: q.q, a: q.a } : null,
      myChoice: answered ? p.choice : null,
      correct: answered && q ? q.correct : null,
      iCorrect: answered ? p.correct : null,
      tally,
      answeredCount: tally ? tally.reduce((a, b) => a + b, 0) : 0,
      players: this.scoreboard(),
    };
  }

  sync() {
    // Each connection gets a state tailored to its own player.
    for (const conn of this.room.getConnections()) {
      const cid = this.conns.get(conn.id) || null;
      conn.send(JSON.stringify(this.stateFor(cid)));
    }
  }
}
