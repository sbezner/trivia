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

/**
 * One Server instance == one game room (a Cloudflare Durable Object).
 *
 * SELF-PACED model: everyone answers the SAME shared deck, but each player
 * advances through it at their own pace. Answering a question reveals it just
 * for that player; pressing Next only advances that player. No host or other
 * player can move anyone else along. Scores are shared and update live.
 */
export default class Server {
  constructor(room) {
    this.room = room;
    this.players = new Map();   // id -> player
    this.hostId = null;
    this.phase = "lobby";       // lobby | playing
    this.deck = [];             // shared questions for the round
    this.tallies = [];          // per question index: [n,n,n,n] of picks across all players
    this.qN = 5;                // remembered question count, so New Game re-deals the same size
  }

  newPlayer(id) {
    return { id, name: "", score: 0, pindex: 0, answered: false, choice: null, correct: false, done: false };
  }

  onConnect(conn) {
    if (!this.hostId) this.hostId = conn.id;          // first in is the host
    this.players.set(conn.id, this.newPlayer(conn.id));
    conn.send(JSON.stringify({ type: "welcome", id: conn.id }));
    this.sync();
  }

  onClose(conn) {
    this.players.delete(conn.id);
    if (conn.id === this.hostId) {
      this.hostId = this.players.size ? [...this.players.keys()][0] : null;
    }
    this.sync();
  }

  onMessage(raw, sender) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const p = this.players.get(sender.id);
    if (!p) return;

    switch (msg.type) {
      case "join":
        p.name = String(msg.name || "").trim().slice(0, 16) || "Player";
        break;
      case "start":
        if (sender.id === this.hostId) this.startGame(msg.qpp);
        break;
      case "answer":
        this.handleAnswer(p, msg.choice);
        break;
      case "next":
        this.advance(p);
        break;
      case "restart":
        // Host's "New Game" — immediately re-deal a fresh round for everyone,
        // same room/code, no lobby trip.
        if (sender.id === this.hostId) this.startGame(this.qN);
        break;
    }
    this.sync();
  }

  // ---- game flow ----
  startGame(qpp) {
    const n = Math.min(Math.max(Number(qpp) || this.qN, 3), 10, QUESTIONS.length);
    this.qN = n;
    this.deck = shuffle(QUESTIONS).slice(0, n);
    this.tallies = this.deck.map(() => [0, 0, 0, 0]);
    this.phase = "playing";
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
    if (p.pindex >= this.deck.length) {
      p.done = true;
    }
    p.answered = false; p.choice = null; p.correct = false;
  }

  resetToLobby() {
    this.phase = "lobby";
    this.deck = [];
    this.tallies = [];
    for (const p of this.players.values()) {
      p.score = 0; p.pindex = 0; p.answered = false; p.choice = null; p.correct = false; p.done = false;
    }
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
    }));
  }

  stateFor(id) {
    const p = this.players.get(id);
    const playing = this.phase === "playing";
    const q = playing && p && !p.done ? this.deck[p.pindex] : null;
    const answered = !!(p && p.answered);
    const showTally = playing && answered && !!q;
    const tally = showTally ? this.tallies[p.pindex] : null;
    return {
      type: "state",
      phase: this.phase,
      hostId: this.hostId,
      total: this.deck.length,
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
      conn.send(JSON.stringify(this.stateFor(conn.id)));
    }
  }
}
