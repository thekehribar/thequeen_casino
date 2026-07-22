const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

loadEnvFile();

const PORT = Number(process.env.PORT) || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const DIPLOMACIA_TOKEN = process.env.DIPLOMACIA_TOKEN || "";
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const DATABASE_SSL = process.env.DATABASE_SSL !== "false";
const SYNC_INTERVAL_SECONDS = Math.max(10, Number(process.env.SYNC_INTERVAL_SECONDS) || 30);
const AUTO_PAY_WITHDRAWALS = process.env.AUTO_PAY_WITHDRAWALS !== "false";
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
let dbInitPromise = null;
let pgPool = null;

const symbols = ["🍒", "🍋", "⭐", "🔔", "💎", "7️⃣"];
const rouletteRedNumbers = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const cardRanks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const cardSuits = ["♠", "♥", "♦", "♣"];

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function defaultDb() {
  return { players: {}, deposits: [], withdrawals: [], processedTransfers: [], pvpGames: [], rpsGames: [], chatMessages: [], houseProfit: 0 };
}

function normalizeDb(db) {
  const normalized = db && typeof db === "object" ? db : defaultDb();
  if (!normalized.players || typeof normalized.players !== "object") normalized.players = {};
  if (!Array.isArray(normalized.deposits)) normalized.deposits = [];
  if (!Array.isArray(normalized.withdrawals)) normalized.withdrawals = [];
  if (!Array.isArray(normalized.processedTransfers)) normalized.processedTransfers = [];
  if (!Array.isArray(normalized.pvpGames)) normalized.pvpGames = [];
  if (!Array.isArray(normalized.rpsGames)) normalized.rpsGames = [];
  if (!Array.isArray(normalized.chatMessages)) normalized.chatMessages = [];
  if (typeof normalized.houseProfit !== "number") normalized.houseProfit = 0;
  return normalized;
}

function getInitialDb() {
  if (!fs.existsSync(DB_FILE)) return defaultDb();
  return normalizeDb(JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
}

function getPgPool() {
  if (!DATABASE_URL) return null;
  if (!pgPool) {
    const { Pool } = require("pg");
    pgPool = new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_SSL ? { rejectUnauthorized: false } : false });
  }
  return pgPool;
}

async function ensureDb() {
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    const pool = getPgPool();
    if (pool) {
      await pool.query("CREATE TABLE IF NOT EXISTS app_state (id integer PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())");
      await pool.query("INSERT INTO app_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING", [JSON.stringify(getInitialDb())]);
      return;
    }

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb(), null, 2));
  })();

  return dbInitPromise;
}

async function readDb() {
  await ensureDb();
  const pool = getPgPool();
  if (pool) {
    const result = await pool.query("SELECT data FROM app_state WHERE id = 1");
    return normalizeDb(result.rows[0]?.data);
  }

  return normalizeDb(JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
}

async function writeDb(db) {
  const normalized = normalizeDb(db);
  const pool = getPgPool();
  if (pool) {
    await ensureDb();
    await pool.query("UPDATE app_state SET data = $1::jsonb, updated_at = now() WHERE id = 1", [JSON.stringify(normalized)]);
    return;
  }

  await ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(normalized, null, 2));
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function requireAdmin(req, res) {
  if (!ADMIN_KEY || req.headers["x-admin-key"] !== ADMIN_KEY) {
    sendJson(res, 401, { error: "Admin anahtarı hatalı." });
    return false;
  }
  return true;
}

function sumBy(items, selector) {
  return items.reduce((total, item) => total + (Number(selector(item)) || 0), 0);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function verifyTelegramInitData(initData) {
  if (!BOT_TOKEN) {
    return { id: "dev-user", name: "Dev Oyuncu" };
  }

  const params = new URLSearchParams(initData || "");
  const hash = params.get("hash");
  if (!hash) return null;

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const expectedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const hashBuffer = Buffer.from(hash, "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  if (hashBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(hashBuffer, expectedBuffer)) return null;

  const user = JSON.parse(params.get("user") || "{}");
  if (!user.id) return null;

  return {
    id: String(user.id),
    name: user.first_name || user.username || "Telegram Oyuncusu",
  };
}

function getUser(req) {
  return verifyTelegramInitData(req.headers["x-telegram-init-data"] || "");
}

function requireUser(req, res) {
  const user = getUser(req);
  if (!user) {
    sendJson(res, 401, { error: "Telegram doğrulaması başarısız." });
    return null;
  }
  return user;
}

function getPlayer(db, user) {
  if (!db.players[user.id]) {
    db.players[user.id] = {
      id: user.id,
      name: user.name,
      balance: 1000,
      diplomaciaAccounts: [],
      createdAt: new Date().toISOString(),
    };
  }
  db.players[user.id].name = user.name;
  if (!Array.isArray(db.players[user.id].diplomaciaAccounts)) db.players[user.id].diplomaciaAccounts = [];
  return db.players[user.id];
}

function rememberDiplomaciaAccount(player, metaRef) {
  if (!metaRef?.id || !metaRef?.name) return;
  if (!Array.isArray(player.diplomaciaAccounts)) player.diplomaciaAccounts = [];

  const existing = player.diplomaciaAccounts.find((account) => account.id === metaRef.id);
  if (existing) {
    existing.name = metaRef.name;
    existing.lastSeenAt = new Date().toISOString();
    return;
  }

  player.diplomaciaAccounts.push({
    id: metaRef.id,
    name: metaRef.name,
    lastSeenAt: new Date().toISOString(),
  });
}

function calculateMultiplier(result) {
  const [first, second, third] = result;
  if (first === "💎" && second === "💎" && third === "💎") return 7;
  if (first === second && second === third) return 3;
  if (first === second || first === third || second === third) return 1;
  return 0;
}

function pickResult() {
  return [0, 1, 2].map(() => symbols[Math.floor(Math.random() * symbols.length)]);
}

function createDeck() {
  const deck = [];
  for (const suit of cardSuits) {
    for (const rank of cardRanks) deck.push({ rank, suit });
  }

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }

  return deck;
}

function drawCard(deck) {
  return deck.pop();
}

function handValue(hand) {
  let value = 0;
  let aces = 0;

  for (const card of hand) {
    if (card.rank === "A") {
      value += 11;
      aces += 1;
    } else if (["J", "Q", "K"].includes(card.rank)) {
      value += 10;
    } else {
      value += Number(card.rank);
    }
  }

  while (value > 21 && aces > 0) {
    value -= 10;
    aces -= 1;
  }

  return value;
}

function publicBlackjackGame(game, revealDealer = false) {
  if (!game) return null;

  return {
    bet: game.bet,
    status: game.status,
    message: game.message,
    playerHand: game.playerHand,
    dealerHand: revealDealer || game.status !== "playing" ? game.dealerHand : [game.dealerHand[0], { rank: "?", suit: "" }],
    playerValue: handValue(game.playerHand),
    dealerValue: revealDealer || game.status !== "playing" ? handValue(game.dealerHand) : null,
  };
}

function finishPvpGame(db, game) {
  const [first, second] = game.players;
  const firstValue = handValue(first.hand);
  const secondValue = handValue(second.hand);
  const firstValid = firstValue <= 21;
  const secondValid = secondValue <= 21;
  let winner = null;

  if (firstValid && (!secondValid || firstValue > secondValue)) winner = first;
  if (secondValid && (!firstValid || secondValue > firstValue)) winner = second;

  const pot = game.stake * 2;
  const fee = winner ? Math.floor(pot * 0.1) : 0;
  const payout = winner ? pot - fee : game.stake;

  if (winner) {
    db.players[winner.id].balance += payout;
    db.houseProfit += fee;
    game.message = `${winner.name} kazandı. Net kazanç ${payout}.`;
    game.winnerId = winner.id;
    game.fee = fee;
    game.payout = payout;
  } else {
    db.players[first.id].balance += game.stake;
    db.players[second.id].balance += game.stake;
    game.message = "Berabere. Bahisler iade edildi.";
    game.winnerId = null;
    game.fee = 0;
    game.payout = game.stake;
  }

  game.status = "finished";
  game.finishedAt = new Date().toISOString();
}

function applyPvpTimers(db, game) {
  if (!game || game.status === "finished") return;

  const now = Date.now();
  if (game.status === "waiting" && game.waitEndsAt && now >= new Date(game.waitEndsAt).getTime()) {
    const seat = game.players[0];
    if (seat && db.players[seat.id]) db.players[seat.id].balance += game.stake;
    game.status = "finished";
    game.message = "Oda süresi doldu. Bahis iade edildi.";
    game.finishedAt = new Date().toISOString();
    return;
  }

  if (game.status === "playing" && game.playEndsAt && now >= new Date(game.playEndsAt).getTime()) {
    for (const seat of game.players) seat.stood = true;
    finishPvpGame(db, game);
  }
}

function publicPvpGame(db, game, userId) {
  if (!game) return null;
  applyPvpTimers(db, game);

  const endsAt = game.status === "waiting" ? game.waitEndsAt : game.status === "playing" ? game.playEndsAt : null;

  return {
    id: game.id,
    stake: game.stake,
    status: game.status,
    message: game.message,
    winnerId: game.winnerId || null,
    fee: game.fee || 0,
    payout: game.payout || 0,
    endsAt,
    secondsLeft: endsAt ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000)) : 0,
    players: game.players.map((player) => {
      const isSelf = player.id === userId;
      const reveal = isSelf || game.status === "finished";
      return {
        id: player.id,
        name: player.name,
        balance: db.players[player.id]?.balance ?? 0,
        ready: player.ready,
        stood: player.stood,
        busted: handValue(player.hand) > 21,
        value: reveal ? handValue(player.hand) : null,
        cardCount: player.hand.length,
        hand: reveal ? player.hand : player.hand.map(() => ({ rank: "?", suit: "" })),
      };
    }),
  };
}

function getActivePvpGame(db, playerId) {
  for (const game of db.pvpGames) applyPvpTimers(db, game);
  return db.pvpGames.find((game) => ["waiting", "playing"].includes(game.status) && game.players.some((player) => player.id === playerId));
}

function finishRpsGame(db, game) {
  const [first, second] = game.players;
  const beats = { rock: "scissors", scissors: "paper", paper: "rock" };
  let winner = null;

  if (first.choice && second.choice && first.choice !== second.choice) {
    winner = beats[first.choice] === second.choice ? first : second;
  }

  if (winner) {
    const pot = game.stake * 2;
    const fee = Math.floor(pot * 0.1);
    const payout = pot - fee;
    db.players[winner.id].balance += payout;
    db.houseProfit += fee;
    game.winnerId = winner.id;
    game.payout = payout;
    game.message = `${winner.name} kazandı. Net kazanç ${payout}.`;
  } else {
    for (const seat of game.players) db.players[seat.id].balance += game.stake;
    game.winnerId = null;
    game.payout = game.stake;
    game.message = "Berabere. Bahisler iade edildi.";
  }

  game.status = "finished";
  game.finishedAt = new Date().toISOString();
}

function applyRpsTimers(db, game) {
  if (!game || game.status === "finished") return;

  const now = Date.now();
  if (game.status === "waiting" && game.waitEndsAt && now >= new Date(game.waitEndsAt).getTime()) {
    const seat = game.players[0];
    if (seat && db.players[seat.id]) db.players[seat.id].balance += game.stake;
    game.status = "finished";
    game.message = "Oda süresi doldu. Bahis iade edildi.";
    game.finishedAt = new Date().toISOString();
    return;
  }

  if (game.status === "playing" && game.playEndsAt && now >= new Date(game.playEndsAt).getTime()) {
    for (const seat of game.players) {
      if (!seat.choice) seat.choice = "rock";
    }
    finishRpsGame(db, game);
  }
}

function publicRpsGame(db, game, userId) {
  if (!game) return null;
  applyRpsTimers(db, game);

  const endsAt = game.status === "waiting" ? game.waitEndsAt : game.status === "playing" ? game.playEndsAt : null;
  return {
    id: game.id,
    stake: game.stake,
    status: game.status,
    message: game.message,
    winnerId: game.winnerId || null,
    payout: game.payout || 0,
    secondsLeft: endsAt ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000)) : 0,
    players: game.players.map((seat) => ({
      id: seat.id,
      name: seat.name,
      balance: db.players[seat.id]?.balance ?? 0,
      picked: Boolean(seat.choice),
      choice: game.status === "finished" || seat.id === userId ? seat.choice || null : null,
    })),
  };
}

function getActiveRpsGame(db, playerId) {
  for (const game of db.rpsGames) applyRpsTimers(db, game);
  return db.rpsGames.find((game) => ["waiting", "playing"].includes(game.status) && game.players.some((player) => player.id === playerId));
}

function getActiveOnlineGame(db, playerId) {
  const pvp21 = getActivePvpGame(db, playerId);
  if (pvp21) return { type: "Online 21", game: pvp21 };

  const rps = getActiveRpsGame(db, playerId);
  if (rps) return { type: "Taş Kağıt Makas", game: rps };

  return null;
}

function settleBlackjack(player, game) {
  const playerValue = handValue(game.playerHand);
  const dealerValue = handValue(game.dealerHand);
  let payout = 0;

  if (playerValue > 21) {
    game.message = "Bust. Kaybettin.";
  } else if (dealerValue > 21 || playerValue > dealerValue) {
    payout = game.bet * 2;
    game.message = `Kazandın. +${payout}`;
  } else if (playerValue === dealerValue) {
    payout = game.bet;
    game.message = "Berabere. Bahis iade.";
  } else {
    game.message = "Kasa kazandı.";
  }

  player.balance += payout;
  game.status = "finished";
  game.payout = payout;
}

function createUniqueDepositAmount(db, amount) {
  for (let attempt = 0; attempt < 999; attempt += 1) {
    const code = crypto.randomInt(1, 1000);
    const uniqueAmount = amount + code;
    const exists = db.deposits.some((deposit) => deposit.status === "pending" && deposit.uniqueAmount === uniqueAmount);
    if (!exists) return { code, uniqueAmount };
  }
  throw new Error("Benzersiz yatırım kodu üretilemedi.");
}

async function fetchEconomyHistory() {
  if (!DIPLOMACIA_TOKEN) throw new Error("DIPLOMACIA_TOKEN tanımlı değil.");

  const url = "https://diplomacia.com.tr/api/players/economy-history?page=1&limit=50&categories=transfer_in%2Ctransfer_out";
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${DIPLOMACIA_TOKEN}`,
    },
  });

  if (!response.ok) throw new Error(`Diplomacia API hata döndürdü: ${response.status}`);
  return response.json();
}

async function sendDiplomaciaTransfer(recipientId, amount) {
  if (!DIPLOMACIA_TOKEN) throw new Error("DIPLOMACIA_TOKEN tanımlı değil.");

  const response = await fetch("https://diplomacia.com.tr/api/transfer/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIPLOMACIA_TOKEN}`,
    },
    body: JSON.stringify({ recipient_id: recipientId, amount }),
  });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || `Diplomacia transfer hatası: ${response.status}`);
  }

  return data;
}

async function syncDeposits() {
  const db = await readDb();
  const history = await fetchEconomyHistory();
  const logs = Array.isArray(history.logs) ? history.logs : [];
  const credited = [];

  for (const log of logs) {
    if (log.category !== "transfer_in" || log.type !== "income") continue;

    const existingDeposit = db.deposits.find((item) => item.transferId === String(log.id));
    if (existingDeposit) {
      const existingPlayer = db.players[existingDeposit.playerId];
      if (existingPlayer) rememberDiplomaciaAccount(existingPlayer, log.meta_ref);
      if (!existingDeposit.senderId) existingDeposit.senderId = log.meta_ref?.id || null;
      if (!existingDeposit.senderName) existingDeposit.senderName = log.meta_ref?.name || null;
      continue;
    }

    if (db.processedTransfers.includes(String(log.id))) continue;

    const deposit = db.deposits.find((item) => item.status === "pending" && item.uniqueAmount === Number(log.amount));
    if (!deposit) continue;

    const player = db.players[deposit.playerId];
    if (!player) continue;

    player.balance += deposit.amount;
    rememberDiplomaciaAccount(player, log.meta_ref);
    deposit.status = "credited";
    deposit.transferId = String(log.id);
    deposit.senderName = log.meta_ref?.name || null;
    deposit.senderId = log.meta_ref?.id || null;
    deposit.creditedAt = new Date().toISOString();
    db.processedTransfers.push(String(log.id));
    credited.push({ playerId: player.id, playerName: player.name, amount: deposit.amount, sentAmount: deposit.uniqueAmount });
  }

  await writeDb(db);
  return credited;
}

function startDepositSyncLoop() {
  if (!DIPLOMACIA_TOKEN) {
    console.log("DIPLOMACIA_TOKEN yok, otomatik yatırım kontrolü kapalı.");
    return;
  }

  const runSync = async () => {
    try {
      const credited = await syncDeposits();
      if (credited.length > 0) {
        console.log(`Yatırım işlendi: ${credited.length}`);
      }
    } catch (error) {
      console.error(`Yatırım kontrol hatası: ${error.message}`);
    }
  };

  runSync();
  setInterval(runSync, SYNC_INTERVAL_SECONDS * 1000);
  console.log(`Otomatik yatırım kontrolü ${SYNC_INTERVAL_SECONDS} saniyede bir çalışıyor.`);
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/admin/summary" && req.method === "GET") {
    if (!requireAdmin(req, res)) return;

    const db = await readDb();
    const players = Object.values(db.players).sort((a, b) => (b.balance || 0) - (a.balance || 0));
    const creditedDeposits = db.deposits.filter((item) => item.status === "credited");
    const pendingDeposits = db.deposits.filter((item) => item.status === "pending");
    const paidWithdrawals = db.withdrawals.filter((item) => item.status === "paid");
    const pendingWithdrawals = db.withdrawals.filter((item) => item.status === "pending");

    sendJson(res, 200, {
      totals: {
        players: players.length,
        totalBalance: sumBy(players, (player) => player.balance),
        creditedDeposits: creditedDeposits.length,
        creditedDepositAmount: sumBy(creditedDeposits, (item) => item.amount),
        pendingDeposits: pendingDeposits.length,
        paidWithdrawals: paidWithdrawals.length,
        paidWithdrawalAmount: sumBy(paidWithdrawals, (item) => item.amount),
        pendingWithdrawals: pendingWithdrawals.length,
        houseProfit: db.houseProfit,
      },
      players: players.slice(0, 100).map((player) => ({
        id: player.id,
        name: player.name,
        balance: player.balance,
        accounts: player.diplomaciaAccounts || [],
        createdAt: player.createdAt,
      })),
      deposits: db.deposits.slice(-100).reverse(),
      withdrawals: db.withdrawals.slice(-100).reverse(),
      pendingWithdrawals: pendingWithdrawals.slice(-100).reverse(),
      chatMessages: db.chatMessages.slice(-100).reverse(),
    });
    return;
  }

  if (pathname === "/api/me" && req.method === "GET") {
    const user = requireUser(req, res);
    if (!user) return;

    const db = await readDb();
    const player = getPlayer(db, user);
    await writeDb(db);
    sendJson(res, 200, {
      player,
      deposits: db.deposits.filter((deposit) => deposit.playerId === player.id).slice(-5).reverse(),
      withdrawals: db.withdrawals.filter((withdrawal) => withdrawal.playerId === player.id).slice(-5).reverse(),
    });
    return;
  }

  if (pathname === "/api/chat/messages" && req.method === "GET") {
    const user = requireUser(req, res);
    if (!user) return;

    const db = await readDb();
    getPlayer(db, user);
    await writeDb(db);
    sendJson(res, 200, { messages: db.chatMessages.slice(-50) });
    return;
  }

  if (pathname === "/api/chat/messages" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;

    const body = await readBody(req);
    const text = String(body.text || "").trim().slice(0, 240);
    if (!text) {
      sendJson(res, 400, { error: "Mesaj boş olamaz." });
      return;
    }

    const db = await readDb();
    const player = getPlayer(db, user);
    const message = {
      id: crypto.randomUUID(),
      playerId: player.id,
      playerName: player.name,
      text,
      createdAt: new Date().toISOString(),
    };

    db.chatMessages.push(message);
    db.chatMessages = db.chatMessages.slice(-200);
    await writeDb(db);
    sendJson(res, 201, { message });
    return;
  }

  if (pathname === "/api/spin" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;

    const body = await readBody(req);
    const bet = Math.max(10, Math.floor(Number(body.bet) || 10));
    const db = await readDb();
    const player = getPlayer(db, user);

    if (player.balance < bet) {
      sendJson(res, 400, { error: "Yetersiz bakiye.", balance: player.balance });
      return;
    }

    player.balance -= bet;
    const result = pickResult();
    const multiplier = calculateMultiplier(result);
    const winAmount = bet * multiplier;
    player.balance += winAmount;
    await writeDb(db);

    sendJson(res, 200, { result, multiplier, winAmount, balance: player.balance });
    return;
  }

  if (pathname === "/api/roulette/play" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;

    const body = await readBody(req);
    const bet = Math.max(10, Math.floor(Number(body.bet) || 10));
    const betType = String(body.betType || "red");
    const selectedNumber = Math.floor(Number(body.number));
    const db = await readDb();
    const player = getPlayer(db, user);

    if (!["red", "black", "even", "odd", "number"].includes(betType)) {
      sendJson(res, 400, { error: "Geçersiz rulet seçimi." });
      return;
    }

    if (betType === "number" && (selectedNumber < 0 || selectedNumber > 36)) {
      sendJson(res, 400, { error: "Sayı 0 ile 36 arasında olmalı." });
      return;
    }

    if (player.balance < bet) {
      sendJson(res, 400, { error: "Yetersiz bakiye.", balance: player.balance });
      return;
    }

    player.balance -= bet;
    const number = crypto.randomInt(0, 37);
    const color = number === 0 ? "green" : rouletteRedNumbers.has(number) ? "red" : "black";
    const isEven = number !== 0 && number % 2 === 0;
    const isOdd = number % 2 === 1;
    const won =
      (betType === "red" && color === "red") ||
      (betType === "black" && color === "black") ||
      (betType === "even" && isEven) ||
      (betType === "odd" && isOdd) ||
      (betType === "number" && selectedNumber === number);
    const multiplier = betType === "number" ? 36 : 2;
    const payout = won ? bet * multiplier : 0;
    player.balance += payout;
    await writeDb(db);

    sendJson(res, 200, {
      number,
      color,
      betType,
      selectedNumber: betType === "number" ? selectedNumber : null,
      won,
      multiplier: won ? multiplier : 0,
      payout,
      profit: payout - bet,
      balance: player.balance,
      message: won ? `Kazandın. Net +${payout - bet}` : "Kaybettin.",
    });
    return;
  }

  if (pathname === "/api/dice/play" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;

    const body = await readBody(req);
    const bet = Math.max(10, Math.floor(Number(body.bet) || 10));
    const target = String(body.target || "over");
    const db = await readDb();
    const player = getPlayer(db, user);

    if (!["over", "under", "double"].includes(target)) {
      sendJson(res, 400, { error: "Geçersiz zar seçimi." });
      return;
    }
    if (player.balance < bet) {
      sendJson(res, 400, { error: "Yetersiz bakiye.", balance: player.balance });
      return;
    }

    player.balance -= bet;
    const first = crypto.randomInt(1, 7);
    const second = crypto.randomInt(1, 7);
    const total = first + second;
    const won = (target === "over" && total > 7) || (target === "under" && total < 7) || (target === "double" && first === second);
    const multiplier = target === "double" ? 5 : 1.8;
    const payout = won ? Math.floor(bet * multiplier) : 0;
    player.balance += payout;
    await writeDb(db);

    sendJson(res, 200, {
      dice: [first, second],
      total,
      target,
      won,
      payout,
      profit: payout - bet,
      balance: player.balance,
      message: won ? `Kazandın. Net +${payout - bet}` : "Kaybettin.",
    });
    return;
  }

  if (pathname === "/api/blackjack/start" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;

    const body = await readBody(req);
    const bet = Math.max(10, Math.floor(Number(body.bet) || 10));
    const db = await readDb();
    const player = getPlayer(db, user);

    if (player.balance < bet) {
      sendJson(res, 400, { error: "Yetersiz bakiye.", balance: player.balance });
      return;
    }

    player.balance -= bet;
    const deck = createDeck();
    const game = {
      deck,
      bet,
      status: "playing",
      playerHand: [drawCard(deck), drawCard(deck)],
      dealerHand: [drawCard(deck), drawCard(deck)],
      message: "Kart çek veya dur.",
      createdAt: new Date().toISOString(),
    };

    if (handValue(game.playerHand) === 21) {
      while (handValue(game.dealerHand) < 17) game.dealerHand.push(drawCard(game.deck));
      settleBlackjack(player, game);
    }

    player.blackjack = game;
    await writeDb(db);
    sendJson(res, 200, { game: publicBlackjackGame(game), balance: player.balance });
    return;
  }

  if (pathname === "/api/blackjack/hit" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;

    const db = await readDb();
    const player = getPlayer(db, user);
    const game = player.blackjack;

    if (!game || game.status !== "playing") {
      sendJson(res, 400, { error: "Aktif 21 oyunu yok." });
      return;
    }

    game.playerHand.push(drawCard(game.deck));
    if (handValue(game.playerHand) >= 21) {
      while (handValue(game.dealerHand) < 17 && handValue(game.playerHand) <= 21) game.dealerHand.push(drawCard(game.deck));
      settleBlackjack(player, game);
    }

    await writeDb(db);
    sendJson(res, 200, { game: publicBlackjackGame(game), balance: player.balance });
    return;
  }

  if (pathname === "/api/blackjack/stand" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;

    const db = await readDb();
    const player = getPlayer(db, user);
    const game = player.blackjack;

    if (!game || game.status !== "playing") {
      sendJson(res, 400, { error: "Aktif 21 oyunu yok." });
      return;
    }

    while (handValue(game.dealerHand) < 17) game.dealerHand.push(drawCard(game.deck));
    settleBlackjack(player, game);
    await writeDb(db);
    sendJson(res, 200, { game: publicBlackjackGame(game, true), balance: player.balance });
    return;
  }

  if (pathname === "/api/pvp21/join" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;

    const body = await readBody(req);
    const stake = Math.max(100, Math.floor(Number(body.stake) || 100));
    const db = await readDb();
    const player = getPlayer(db, user);
    const activeOnlineGame = getActiveOnlineGame(db, player.id);

    if (activeOnlineGame?.type === "Online 21") {
      await writeDb(db);
      sendJson(res, 200, { game: publicPvpGame(db, activeOnlineGame.game, player.id), balance: player.balance });
      return;
    }

    if (activeOnlineGame) {
      sendJson(res, 400, { error: `Önce ${activeOnlineGame.type} odanı kapat veya oyunu bitir.` });
      return;
    }

    if (player.balance < stake) {
      sendJson(res, 400, { error: "Yetersiz bakiye.", balance: player.balance });
      return;
    }

    const waitingGame = db.pvpGames.find((game) => game.status === "waiting" && game.stake === stake && !game.players.some((item) => item.id === player.id));
    player.balance -= stake;

    if (waitingGame) {
      const deck = waitingGame.deck;
      waitingGame.players.push({
        id: player.id,
        name: player.name,
        hand: [drawCard(deck), drawCard(deck)],
        stood: false,
        ready: true,
      });
      waitingGame.players[0].hand = [drawCard(deck), drawCard(deck)];
      waitingGame.status = "playing";
      waitingGame.message = "Oyun başladı.";
      waitingGame.startedAt = new Date().toISOString();
      waitingGame.playEndsAt = new Date(Date.now() + 10_000).toISOString();
      await writeDb(db);
      sendJson(res, 200, { game: publicPvpGame(db, waitingGame, player.id), balance: player.balance });
      return;
    }

    const game = {
      id: crypto.randomUUID(),
      stake,
      deck: createDeck(),
      status: "waiting",
      message: "Rakip bekleniyor.",
      players: [{ id: player.id, name: player.name, hand: [], stood: false, ready: true }],
      createdAt: new Date().toISOString(),
      waitEndsAt: new Date(Date.now() + 60_000).toISOString(),
    };

    db.pvpGames.push(game);
    await writeDb(db);
    sendJson(res, 200, { game: publicPvpGame(db, game, player.id), balance: player.balance });
    return;
  }

  if (pathname === "/api/pvp21/rooms" && req.method === "GET") {
    const user = requireUser(req, res);
    if (!user) return;

    const db = await readDb();
    const player = getPlayer(db, user);
    const rooms = db.pvpGames
      .filter((game) => {
        applyPvpTimers(db, game);
        return game.status === "waiting" && !game.players.some((seat) => seat.id === player.id);
      })
      .map((game) => ({
        id: game.id,
        stake: game.stake,
        hostName: game.players[0]?.name || "Oyuncu",
        hostBalance: db.players[game.players[0]?.id]?.balance ?? 0,
        secondsLeft: game.waitEndsAt ? Math.max(0, Math.ceil((new Date(game.waitEndsAt).getTime() - Date.now()) / 1000)) : 0,
      }));

    await writeDb(db);
    sendJson(res, 200, { rooms, balance: player.balance });
    return;
  }

  if (pathname === "/api/pvp21/state" && req.method === "GET") {
    const user = requireUser(req, res);
    if (!user) return;

    const db = await readDb();
    const player = getPlayer(db, user);
    const game = getActivePvpGame(db, player.id) || db.pvpGames.findLast?.((item) => item.players.some((p) => p.id === player.id)) || null;
    await writeDb(db);
    sendJson(res, 200, { game: publicPvpGame(db, game, player.id), balance: player.balance });
    return;
  }

  if (pathname === "/api/pvp21/cancel" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;

    const db = await readDb();
    const player = getPlayer(db, user);
    const game = getActivePvpGame(db, player.id);
    if (!game || game.status !== "waiting" || game.players.length !== 1) {
      sendJson(res, 400, { error: "Kapatılabilecek bekleyen oda yok." });
      return;
    }

    player.balance += game.stake;
    game.status = "finished";
    game.message = "Oda kapatıldı. Bahis iade edildi.";
    game.finishedAt = new Date().toISOString();
    await writeDb(db);
    sendJson(res, 200, { game: publicPvpGame(db, game, player.id), balance: player.balance });
    return;
  }

  if (pathname === "/api/pvp21/hit" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;

    const db = await readDb();
    const player = getPlayer(db, user);
    const game = getActivePvpGame(db, player.id);
    if (!game || game.status !== "playing") {
      sendJson(res, 400, { error: "Aktif online 21 oyunu yok." });
      return;
    }

    const seat = game.players.find((item) => item.id === player.id);
    if (seat.stood || handValue(seat.hand) > 21) {
      sendJson(res, 400, { error: "Bu elde artık kart çekemezsin." });
      return;
    }

    seat.hand.push(drawCard(game.deck));
    if (handValue(seat.hand) >= 21) seat.stood = true;
    if (game.players.every((item) => item.stood || handValue(item.hand) > 21)) finishPvpGame(db, game);

    await writeDb(db);
    sendJson(res, 200, { game: publicPvpGame(db, game, player.id), balance: player.balance });
    return;
  }

  if (pathname === "/api/pvp21/stand" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;

    const db = await readDb();
    const player = getPlayer(db, user);
    const game = getActivePvpGame(db, player.id);
    if (!game || game.status !== "playing") {
      sendJson(res, 400, { error: "Aktif online 21 oyunu yok." });
      return;
    }

    const seat = game.players.find((item) => item.id === player.id);
    seat.stood = true;
    if (game.players.every((item) => item.stood || handValue(item.hand) > 21)) finishPvpGame(db, game);

    await writeDb(db);
    sendJson(res, 200, { game: publicPvpGame(db, game, player.id), balance: player.balance });
    return;
  }

  if (pathname === "/api/rps/join" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;

    const body = await readBody(req);
    const stake = Math.max(100, Math.floor(Number(body.stake) || 100));
    const db = await readDb();
    const player = getPlayer(db, user);
    const activeOnlineGame = getActiveOnlineGame(db, player.id);

    if (activeOnlineGame?.type === "Taş Kağıt Makas") {
      await writeDb(db);
      sendJson(res, 200, { game: publicRpsGame(db, activeOnlineGame.game, player.id), balance: player.balance });
      return;
    }

    if (activeOnlineGame) {
      sendJson(res, 400, { error: `Önce ${activeOnlineGame.type} odanı kapat veya oyunu bitir.` });
      return;
    }

    if (player.balance < stake) {
      sendJson(res, 400, { error: "Yetersiz bakiye.", balance: player.balance });
      return;
    }

    const waitingGame = db.rpsGames.find((game) => game.status === "waiting" && game.stake === stake && !game.players.some((seat) => seat.id === player.id));
    player.balance -= stake;

    if (waitingGame) {
      waitingGame.players.push({ id: player.id, name: player.name, choice: null });
      waitingGame.status = "playing";
      waitingGame.message = "Oyun başladı. Seçimini yap.";
      waitingGame.startedAt = new Date().toISOString();
      waitingGame.playEndsAt = new Date(Date.now() + 10_000).toISOString();
      await writeDb(db);
      sendJson(res, 200, { game: publicRpsGame(db, waitingGame, player.id), balance: player.balance });
      return;
    }

    const game = {
      id: crypto.randomUUID(),
      stake,
      status: "waiting",
      message: "Rakip bekleniyor.",
      players: [{ id: player.id, name: player.name, choice: null }],
      createdAt: new Date().toISOString(),
      waitEndsAt: new Date(Date.now() + 60_000).toISOString(),
    };

    db.rpsGames.push(game);
    await writeDb(db);
    sendJson(res, 200, { game: publicRpsGame(db, game, player.id), balance: player.balance });
    return;
  }

  if (pathname === "/api/rps/rooms" && req.method === "GET") {
    const user = requireUser(req, res);
    if (!user) return;

    const db = await readDb();
    const player = getPlayer(db, user);
    const rooms = db.rpsGames
      .filter((game) => {
        applyRpsTimers(db, game);
        return game.status === "waiting" && !game.players.some((seat) => seat.id === player.id);
      })
      .map((game) => ({
        id: game.id,
        stake: game.stake,
        hostName: game.players[0]?.name || "Oyuncu",
        hostBalance: db.players[game.players[0]?.id]?.balance ?? 0,
        secondsLeft: game.waitEndsAt ? Math.max(0, Math.ceil((new Date(game.waitEndsAt).getTime() - Date.now()) / 1000)) : 0,
      }));

    await writeDb(db);
    sendJson(res, 200, { rooms, balance: player.balance });
    return;
  }

  if (pathname === "/api/rps/state" && req.method === "GET") {
    const user = requireUser(req, res);
    if (!user) return;

    const db = await readDb();
    const player = getPlayer(db, user);
    const game = getActiveRpsGame(db, player.id) || db.rpsGames.findLast?.((item) => item.players.some((p) => p.id === player.id)) || null;
    await writeDb(db);
    sendJson(res, 200, { game: publicRpsGame(db, game, player.id), balance: player.balance });
    return;
  }

  if (pathname === "/api/rps/cancel" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;

    const db = await readDb();
    const player = getPlayer(db, user);
    const game = getActiveRpsGame(db, player.id);
    if (!game || game.status !== "waiting" || game.players.length !== 1) {
      sendJson(res, 400, { error: "Kapatılabilecek bekleyen oda yok." });
      return;
    }

    player.balance += game.stake;
    game.status = "finished";
    game.message = "Oda kapatıldı. Bahis iade edildi.";
    game.finishedAt = new Date().toISOString();
    await writeDb(db);
    sendJson(res, 200, { game: publicRpsGame(db, game, player.id), balance: player.balance });
    return;
  }

  if (pathname === "/api/rps/choose" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;

    const body = await readBody(req);
    const choice = String(body.choice || "");
    if (!["rock", "paper", "scissors"].includes(choice)) {
      sendJson(res, 400, { error: "Geçersiz seçim." });
      return;
    }

    const db = await readDb();
    const player = getPlayer(db, user);
    const game = getActiveRpsGame(db, player.id);
    if (!game || game.status !== "playing") {
      sendJson(res, 400, { error: "Aktif taş kağıt makas oyunu yok." });
      return;
    }

    const seat = game.players.find((item) => item.id === player.id);
    seat.choice = choice;
    if (game.players.every((item) => item.choice)) finishRpsGame(db, game);

    await writeDb(db);
    sendJson(res, 200, { game: publicRpsGame(db, game, player.id), balance: player.balance });
    return;
  }

  if (pathname === "/api/deposits" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;

    const body = await readBody(req);
    const amount = Math.floor(Number(body.amount) || 0);
    if (amount < 1000) {
      sendJson(res, 400, { error: "Minimum yatırım 1000 oyun parası." });
      return;
    }

    const db = await readDb();
    const player = getPlayer(db, user);
    const { code, uniqueAmount } = createUniqueDepositAmount(db, amount);
    const deposit = {
      id: crypto.randomUUID(),
      playerId: player.id,
      playerName: player.name,
      amount,
      code,
      uniqueAmount,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    db.deposits.push(deposit);
    await writeDb(db);
    sendJson(res, 201, { deposit });
    return;
  }

  if (pathname === "/api/withdrawals" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return;

    const body = await readBody(req);
    const amount = Math.floor(Number(body.amount) || 0);
    const recipientId = String(body.recipientId || "").trim();

    if (amount < 1000 || !recipientId) {
      sendJson(res, 400, { error: "Tutar ve kayıtlı Diplomacia hesabı gerekli." });
      return;
    }

    const db = await readDb();
    const player = getPlayer(db, user);
    const account = player.diplomaciaAccounts.find((item) => item.id === recipientId);
    if (!account) {
      sendJson(res, 400, { error: "Bu Telegram hesabına bağlı kayıtlı Diplomacia hesabı bulunamadı. Önce para yatırması gerekiyor." });
      return;
    }

    if (player.balance < amount) {
      sendJson(res, 400, { error: "Yetersiz bakiye." });
      return;
    }

    player.balance -= amount;
    const withdrawal = {
      id: crypto.randomUUID(),
      playerId: player.id,
      playerName: player.name,
      targetPlayerId: account.id,
      targetPlayerName: account.name,
      amount,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    db.withdrawals.push(withdrawal);

    if (AUTO_PAY_WITHDRAWALS) {
      try {
        const transfer = await sendDiplomaciaTransfer(withdrawal.targetPlayerId, withdrawal.amount);
        withdrawal.status = "paid";
        withdrawal.paidAt = new Date().toISOString();
        withdrawal.transferResult = transfer;
      } catch (error) {
        player.balance += amount;
        withdrawal.status = "failed";
        withdrawal.failedAt = new Date().toISOString();
        withdrawal.failureReason = error.message;
        withdrawal.refundedAt = new Date().toISOString();
        await writeDb(db);
        sendJson(res, 502, { error: `Transfer başarısız, bakiye iade edildi: ${error.message}`, balance: player.balance });
        return;
      }
    }

    await writeDb(db);
    sendJson(res, 201, { withdrawal, balance: player.balance });
    return;
  }

  if (pathname === "/api/admin/sync-deposits" && req.method === "POST") {
    if (!requireAdmin(req, res)) return;

    const credited = await syncDeposits();
    sendJson(res, 200, { credited });
    return;
  }

  if (pathname === "/api/admin/withdrawals" && req.method === "GET") {
    if (!requireAdmin(req, res)) return;

    const db = await readDb();
    sendJson(res, 200, { withdrawals: db.withdrawals.filter((item) => item.status === "pending") });
    return;
  }

  const payMatch = pathname.match(/^\/api\/admin\/withdrawals\/([^/]+)\/pay$/);
  if (payMatch && req.method === "POST") {
    if (!requireAdmin(req, res)) return;

    const db = await readDb();
    const withdrawal = db.withdrawals.find((item) => item.id === payMatch[1]);
    if (!withdrawal) {
      sendJson(res, 404, { error: "Çekim talebi bulunamadı." });
      return;
    }
    if (withdrawal.status !== "pending") {
      sendJson(res, 400, { error: "Bu çekim talebi zaten işlenmiş." });
      return;
    }
    if (!withdrawal.targetPlayerId) {
      sendJson(res, 400, { error: "Çekim talebinde Diplomacia oyuncu ID yok." });
      return;
    }

    const transfer = await sendDiplomaciaTransfer(withdrawal.targetPlayerId, withdrawal.amount);
    withdrawal.status = "paid";
    withdrawal.paidAt = new Date().toISOString();
    withdrawal.transferResult = transfer;
    await writeDb(db);
    sendJson(res, 200, { withdrawal, transfer });
    return;
  }

  sendJson(res, 404, { error: "API bulunamadı." });
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(__dirname, safePath));

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    const contentType = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
    }[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname);
      return;
    }

    serveStatic(req, res, pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Sunucu hatası." });
  }
});

server.listen(PORT, () => {
  console.log(`Lucky Mini Casino running on http://localhost:${PORT}`);
  startDepositSyncLoop();
});
