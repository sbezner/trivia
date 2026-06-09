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
const MIN_PLAYERS_TO_START = 1;

/**
 * One Server instance == one game room (a Cloudflare Durable Object).
 * All state is held in memory while at least one player is connected.
 */
export default class Server {
  constructor(room) {
    this.room = room;
    this.players = new Map();   // connectionId -> { id, name, score, answered, choice, correct }
    this.hostId = null;
    this.phase = "lobby";       // lobby | question | reveal | gameover
    this.deck = [];             // [{ cat, q, a:[...], correct }]
    this.index = 0;
  }

  onConnect(conn) {
    // First player to connect becomes the host.
    if (!this.hostId) this.hostId = conn.id;
    this.players.set(conn.id, {
      id: conn.id, name: "", score: 0, answered: false, choice: null, correct: false,
    });
    // Tell this connection who it is, then send everyone the current state.
    conn.send(JSON.stringify({ type: "welcome", id: conn.id }));
    this.broadcastState();
  }

  onClose(conn) {
    this.players.delete(conn.id);
    // If the host left, hand the crown to whoever's next.
    if (conn.id === this.hostId) {
      this.hostId = this.players.size ? [...this.players.keys()][0] : null;
    }
    // A disconnect might mean everyone remaining has now answered.
    this.maybeAutoReveal();
    this.broadcastState();
  }

  onMessage(raw, sender) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const player = this.players.get(sender.id);
    if (!player) return;

    switch (msg.type) {
      case "join":
        player.name = String(msg.name || "").trim().slice(0, 16) || "Player";
        break;

      case "start":
        if (sender.id !== this.hostId) break;
        if (this.players.size < MIN_PLAYERS_TO_START) break;
        this.startGame(msg.qpp);
        break;

      case "answer":
        if (this.phase !== "question" || player.answered) break;
        if (typeof msg.choice !== "number" || msg.choice < 0 || msg.choice > 3) break;
        player.answered = true;
        player.choice = msg.choice;
        player.correct = msg.choice === this.deck[this.index].correct;
        if (player.correct) player.score += POINTS;
        this.maybeAutoReveal();
        break;

      case "reveal":            // host can force the reveal before everyone answers
        if (sender.id === this.hostId && this.phase === "question") this.reveal();
        break;

      case "next":              // host advances to the next question / results
        if (sender.id === this.hostId && this.phase === "reveal") this.next();
        break;

      case "restart":           // host sends everyone back to the lobby
        if (sender.id === this.hostId) this.resetToLobby();
        break;
    }
    this.broadcastState();
  }

  // ---- game flow ----
  startGame(qpp) {
    const perPlayer = Math.min(10, Math.max(3, Number(qpp) || 5));
    const total = Math.min(this.players.size * perPlayer, QUESTIONS.length);
    this.deck = shuffle(QUESTIONS).slice(0, Math.max(total, perPlayer));
    this.index = 0;
    for (const p of this.players.values()) { p.score = 0; }
    this.beginQuestion();
  }

  beginQuestion() {
    this.phase = "question";
    for (const p of this.players.values()) { p.answered = false; p.choice = null; p.correct = false; }
  }

  maybeAutoReveal() {
    if (this.phase !== "question") return;
    const active = [...this.players.values()];
    if (active.length > 0 && active.every(p => p.answered)) this.reveal();
  }

  reveal() { this.phase = "reveal"; }

  next() {
    if (this.index + 1 < this.deck.length) {
      this.index++;
      this.beginQuestion();
    } else {
      this.phase = "gameover";
    }
  }

  resetToLobby() {
    this.phase = "lobby";
    this.deck = [];
    this.index = 0;
    for (const p of this.players.values()) {
      p.score = 0; p.answered = false; p.choice = null; p.correct = false;
    }
  }

  // ---- state broadcast (answer key hidden until reveal) ----
  publicState() {
    const q = this.deck[this.index];
    const showQuestion = (this.phase === "question" || this.phase === "reveal") && q;
    return {
      type: "state",
      phase: this.phase,
      hostId: this.hostId,
      index: this.index,
      total: this.deck.length,
      // During "question" we send the text + options but NOT the correct index.
      question: showQuestion ? { cat: q.cat, q: q.q, a: q.a } : null,
      correct: this.phase === "reveal" ? q.correct : null,
      players: [...this.players.values()].map(p => ({
        id: p.id,
        name: p.name || "…",
        score: p.score,
        answered: p.answered,
        // Reveal each player's own pick only after the reveal.
        choice: this.phase === "reveal" ? p.choice : null,
        correct: this.phase === "reveal" ? p.correct : null,
      })),
    };
  }

  broadcastState() {
    this.room.broadcast(JSON.stringify(this.publicState()));
  }
}
