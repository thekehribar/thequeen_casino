const tg = window.Telegram?.WebApp;

const symbols = ["🍒", "🍋", "⭐", "🔔", "💎", "7️⃣"];
const state = {
  playerId: null,
  balance: 0,
  bet: 50,
  spinning: false,
  profileLoading: false,
  accounts: [],
  rouletteBetType: "red",
};

const balanceEl = document.querySelector("#balance");
const playerNameEl = document.querySelector("#playerName");
const statusBadge = document.querySelector("#statusBadge");
const reels = [...document.querySelectorAll(".reel")];
const betInput = document.querySelector("#betAmount");
const spinButton = document.querySelector("#spinButton");
const resultText = document.querySelector("#resultText");
const chips = [...document.querySelectorAll(".chip")];
const depositAmount = document.querySelector("#depositAmount");
const createDepositButton = document.querySelector("#createDepositButton");
const depositBox = document.querySelector("#depositBox");
const withdrawAmount = document.querySelector("#withdrawAmount");
const withdrawAccount = document.querySelector("#withdrawAccount");
const withdrawButton = document.querySelector("#withdrawButton");
const withdrawBox = document.querySelector("#withdrawBox");
const walletBalance = document.querySelector("#walletBalance");
const walletPlayer = document.querySelector("#walletPlayer");
const linkedAccount = document.querySelector("#linkedAccount");
const tabButtons = [...document.querySelectorAll(".tab-button")];
const tabPanels = [...document.querySelectorAll(".tab-panel")];
const gameCards = [...document.querySelectorAll(".game-card")];
const gamePanels = [...document.querySelectorAll(".game-panel")];
const quickCards = [...document.querySelectorAll(".quick-card")];
const blackjackBet = document.querySelector("#blackjackBet");
const blackjackStart = document.querySelector("#blackjackStart");
const blackjackHit = document.querySelector("#blackjackHit");
const blackjackStand = document.querySelector("#blackjackStand");
const blackjackStatus = document.querySelector("#blackjackStatus");
const blackjackMessage = document.querySelector("#blackjackMessage");
const dealerHand = document.querySelector("#dealerHand");
const playerHand = document.querySelector("#playerHand");
const dealerValue = document.querySelector("#dealerValue");
const playerValue = document.querySelector("#playerValue");
const pvpStake = document.querySelector("#pvpStake");
const pvpJoin = document.querySelector("#pvpJoin");
const pvpCancel = document.querySelector("#pvpCancel");
const pvpHit = document.querySelector("#pvpHit");
const pvpStand = document.querySelector("#pvpStand");
const pvpStatus = document.querySelector("#pvpStatus");
const pvpMessage = document.querySelector("#pvpMessage");
const pvpRoomState = document.querySelector("#pvpRoomState");
const pvpSelfValue = document.querySelector("#pvpSelfValue");
const pvpOpponentValue = document.querySelector("#pvpOpponentValue");
const pvpOpponentName = document.querySelector("#pvpOpponentName");
const pvpSelfHand = document.querySelector("#pvpSelfHand");
const pvpOpponentHand = document.querySelector("#pvpOpponentHand");
const pvpRooms = document.querySelector("#pvpRooms");
const pvpTimer = document.querySelector("#pvpTimer");
const pvpSelfBalance = document.querySelector("#pvpSelfBalance");
const pvpOpponentBalance = document.querySelector("#pvpOpponentBalance");
const rouletteBet = document.querySelector("#rouletteBet");
const roulettePlay = document.querySelector("#roulettePlay");
const rouletteStatus = document.querySelector("#rouletteStatus");
const rouletteDial = document.querySelector("#rouletteDial");
const rouletteWheel = document.querySelector("#rouletteWheel");
const rouletteNumber = document.querySelector("#rouletteNumber");
const rouletteMessage = document.querySelector("#rouletteMessage");
const roulettePicks = [...document.querySelectorAll(".roulette-pick")];
const diceBet = document.querySelector("#diceBet");
const dicePlay = document.querySelector("#dicePlay");
const diceStatus = document.querySelector("#diceStatus");
const diceMessage = document.querySelector("#diceMessage");
const diceOne = document.querySelector("#diceOne");
const diceTwo = document.querySelector("#diceTwo");
const dicePicks = [...document.querySelectorAll(".dice-pick")];
let diceTarget = "over";
const rpsStake = document.querySelector("#rpsStake");
const rpsJoin = document.querySelector("#rpsJoin");
const rpsCancel = document.querySelector("#rpsCancel");
const rpsStatus = document.querySelector("#rpsStatus");
const rpsRooms = document.querySelector("#rpsRooms");
const rpsTimer = document.querySelector("#rpsTimer");
const rpsRoomState = document.querySelector("#rpsRoomState");
const rpsSelfChoice = document.querySelector("#rpsSelfChoice");
const rpsOpponentChoice = document.querySelector("#rpsOpponentChoice");
const rpsOpponentName = document.querySelector("#rpsOpponentName");
const rpsSelfBalance = document.querySelector("#rpsSelfBalance");
const rpsOpponentBalance = document.querySelector("#rpsOpponentBalance");
const rpsMessage = document.querySelector("#rpsMessage");
const rpsChoices = [...document.querySelectorAll(".rps-choice")];
const chatMessages = document.querySelector("#chatMessages");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const chatStatus = document.querySelector("#chatStatus");

function apiHeaders() {
  return {
    "Content-Type": "application/json",
    "x-telegram-init-data": tg?.initData || "",
  };
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...apiHeaders(), ...(options.headers || {}) },
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "İstek başarısız.");
  }

  return data;
}

function bootTelegram() {
  if (!tg) return;

  tg.ready();
  tg.expand();
  tg.setHeaderColor("#11121a");
  tg.setBackgroundColor("#11121a");

  const user = tg.initDataUnsafe?.user;
  if (user) {
    playerNameEl.textContent = user.first_name || user.username || "Telegram Oyuncusu";
  }

  tg.MainButton?.hide();
}

function updateUi() {
  balanceEl.textContent = state.balance;
  walletBalance.textContent = state.balance;
  betInput.value = state.bet;
  spinButton.disabled = state.spinning || state.balance < state.bet;
  withdrawButton.disabled = state.accounts.length === 0;
  statusBadge.textContent = state.spinning ? "Dönüyor" : "Hazır";
  linkedAccount.textContent = state.accounts[0]?.name || "Yok";

  chips.forEach((chip) => {
    chip.classList.toggle("active", Number(chip.dataset.bet) === state.bet);
  });

  tg?.MainButton?.hide();
}

function openTab(tabName) {
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tabName);
  });
}

function openGame(gameName) {
  gameCards.forEach((card) => {
    card.classList.toggle("active", card.dataset.game === gameName);
  });

  gamePanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.gamePanel === gameName);
  });
}

function renderAccounts() {
  withdrawAccount.innerHTML = "";

  if (state.accounts.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Önce para yatırarak hesap bağla";
    withdrawAccount.append(option);
    return;
  }

  for (const account of state.accounts) {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = `${account.name} hesabına gönder`;
    withdrawAccount.append(option);
  }
}

function renderCard(card) {
  const element = document.createElement("span");
  element.className = "playing-card";
  element.textContent = card.rank === "?" ? "?" : `${card.rank}${card.suit}`;
  if (card.suit === "♥" || card.suit === "♦") element.classList.add("red");
  return element;
}

function renderBlackjack(game) {
  dealerHand.innerHTML = "";
  playerHand.innerHTML = "";

  for (const card of game?.dealerHand || []) dealerHand.append(renderCard(card));
  for (const card of game?.playerHand || []) playerHand.append(renderCard(card));

  dealerValue.textContent = game?.dealerValue ?? "-";
  playerValue.textContent = game?.playerValue ?? "-";
  blackjackStatus.textContent = game?.status === "playing" ? "Oynanıyor" : "Hazır";
  blackjackMessage.textContent = game?.message || "Bahis seç ve başla.";
  blackjackHit.disabled = game?.status !== "playing";
  blackjackStand.disabled = game?.status !== "playing";
  blackjackStart.disabled = game?.status === "playing";
}

function renderPvpGame(game) {
  pvpSelfHand.innerHTML = "";
  pvpOpponentHand.innerHTML = "";

  if (!game) {
    pvpStatus.textContent = "Hazır";
    pvpMessage.textContent = "Bahis seç ve rakip ara.";
    pvpSelfValue.textContent = "-";
    pvpOpponentValue.textContent = "-";
    pvpOpponentName.textContent = "Rakip";
    pvpTimer.textContent = "-";
    pvpRoomState.textContent = "Oda kur veya açık odalardan birine gir.";
    pvpRoomState.className = "room-state";
    pvpSelfBalance.textContent = state.balance;
    pvpOpponentBalance.textContent = "-";
    pvpHit.disabled = true;
    pvpStand.disabled = true;
    pvpJoin.disabled = false;
    pvpCancel.disabled = true;
    return;
  }

  const self = game.players.find((player) => player.id === state.playerId) || game.players[0];
  const opponent = game.players.find((player) => player.id !== state.playerId);

  for (const card of self?.hand || []) pvpSelfHand.append(renderCard(card));
  for (const card of opponent?.hand || []) pvpOpponentHand.append(renderCard(card));

  pvpSelfValue.textContent = self?.value ?? "-";
  pvpOpponentValue.textContent = opponent?.value ?? "-";
  pvpOpponentName.textContent = opponent?.name || "Rakip bekleniyor";
  pvpSelfBalance.textContent = self?.balance ?? state.balance;
  pvpOpponentBalance.textContent = opponent?.balance ?? "-";
  pvpTimer.textContent = game.secondsLeft > 0 ? `${game.secondsLeft}sn` : "-";
  pvpStatus.textContent = game.status === "waiting" ? "Bekliyor" : game.status === "playing" ? "Oynanıyor" : "Bitti";
  pvpMessage.textContent = game.message || "";
  pvpRoomState.textContent =
    game.status === "waiting" ? `Odan aktif. Rakip bekleniyor (${game.stake}).` : game.status === "playing" ? `Oyun başladı. Bahis ${game.stake}.` : game.message || "Oyun bitti.";
  pvpRoomState.className = game.status === "playing" ? "room-state playing" : "room-state";

  const canPlay = game.status === "playing" && !self?.stood && !self?.busted;
  pvpHit.disabled = !canPlay;
  pvpStand.disabled = !canPlay;
  pvpJoin.disabled = game.status === "waiting" || game.status === "playing";
  pvpCancel.disabled = game.status !== "waiting";
  pvpJoin.textContent = game.status === "finished" ? "Yeni Oda Kur / Eşleş" : "Oda Kur / Eşleş";
}

function renderPvpRooms(rooms) {
  pvpRooms.innerHTML = "";

  if (!rooms.length) {
    const empty = document.createElement("p");
    empty.className = "room-empty";
    empty.textContent = "Açık oda yok.";
    pvpRooms.append(empty);
    return;
  }

  for (const room of rooms) {
    const button = document.createElement("button");
    button.className = "room-button";
    button.innerHTML = `
      <span>${room.hostName}</span>
      <strong>${room.stake}</strong>
      <small>${room.secondsLeft}sn · bakiye ${room.hostBalance}</small>
    `;
    button.addEventListener("click", () => {
      pvpStake.value = room.stake;
      pvpAction("/api/pvp21/join", { stake: room.stake });
    });
    pvpRooms.append(button);
  }
}

function choiceLabel(choice, hidden = false) {
  if (hidden) return "?";
  return { rock: "✊", paper: "✋", scissors: "✌" }[choice] || "?";
}

function renderRpsGame(game) {
  if (!game) {
    rpsStatus.textContent = "Hazır";
    rpsMessage.textContent = "Bahis seç ve rakip ara.";
    rpsTimer.textContent = "-";
    rpsRoomState.textContent = "Oda kur veya açık odalardan birine gir.";
    rpsRoomState.className = "room-state";
    rpsSelfChoice.textContent = "?";
    rpsOpponentChoice.textContent = "?";
    rpsOpponentName.textContent = "Rakip";
    rpsSelfBalance.textContent = state.balance;
    rpsOpponentBalance.textContent = "-";
    rpsJoin.disabled = false;
    rpsCancel.disabled = true;
    rpsChoices.forEach((button) => (button.disabled = true));
    return;
  }

  const self = game.players.find((player) => player.id === state.playerId) || game.players[0];
  const opponent = game.players.find((player) => player.id !== state.playerId);
  const canPick = game.status === "playing" && !self?.picked;

  rpsStatus.textContent = game.status === "waiting" ? "Bekliyor" : game.status === "playing" ? "Oynanıyor" : "Bitti";
  rpsMessage.textContent = game.message || "";
  rpsRoomState.textContent =
    game.status === "waiting" ? `Odan aktif. Rakip bekleniyor (${game.stake}).` : game.status === "playing" ? `Oyun başladı. Bahis ${game.stake}.` : game.message || "Oyun bitti.";
  rpsRoomState.className = game.status === "playing" ? "room-state playing" : "room-state";
  rpsTimer.textContent = game.secondsLeft > 0 ? `${game.secondsLeft}sn` : "-";
  rpsSelfChoice.textContent = choiceLabel(self?.choice);
  rpsOpponentChoice.textContent = choiceLabel(opponent?.choice, game.status !== "finished" && Boolean(opponent));
  rpsOpponentName.textContent = opponent?.name || "Rakip bekleniyor";
  rpsSelfBalance.textContent = self?.balance ?? state.balance;
  rpsOpponentBalance.textContent = opponent?.balance ?? "-";
  rpsJoin.disabled = game.status === "waiting" || game.status === "playing";
  rpsCancel.disabled = game.status !== "waiting";
  rpsJoin.textContent = game.status === "finished" ? "Yeni Oda Kur / Eşleş" : "Oda Kur / Eşleş";
  rpsChoices.forEach((button) => (button.disabled = !canPick));
}

function renderRpsRooms(rooms) {
  rpsRooms.innerHTML = "";

  if (!rooms.length) {
    const empty = document.createElement("p");
    empty.className = "room-empty";
    empty.textContent = "Açık oda yok.";
    rpsRooms.append(empty);
    return;
  }

  for (const room of rooms) {
    const button = document.createElement("button");
    button.className = "room-button";
    button.innerHTML = `
      <span>${room.hostName}</span>
      <strong>${room.stake}</strong>
      <small>${room.secondsLeft}sn · bakiye ${room.hostBalance}</small>
    `;
    button.addEventListener("click", () => {
      rpsStake.value = room.stake;
      rpsAction("/api/rps/join", { stake: room.stake });
    });
    rpsRooms.append(button);
  }
}

function setBet(value) {
  const nextBet = Math.max(10, Math.floor(Number(value) || 10));
  state.bet = nextBet;
  resultText.textContent = "Bahis güncellendi.";
  resultText.className = "result-text";
  updateUi();
}

function calculateMultiplier(result) {
  const [first, second, third] = result;

  if (first === "💎" && second === "💎" && third === "💎") return 7;
  if (first === second && second === third) return 3;
  if (first === second || first === third || second === third) return 1;
  return 0;
}

function pickResult() {
  return reels.map(() => symbols[Math.floor(Math.random() * symbols.length)]);
}

function animateReels(finalResult) {
  reels.forEach((reel) => reel.classList.add("spinning"));

  const intervals = reels.map((reel) =>
    setInterval(() => {
      reel.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    }, 80),
  );

  return Promise.all(
    reels.map(
      (reel, index) =>
        new Promise((resolve) => {
          setTimeout(() => {
            clearInterval(intervals[index]);
            reel.textContent = finalResult[index];
            reel.classList.remove("spinning");
            resolve();
          }, 650 + index * 280);
        }),
    ),
  );
}

async function spin() {
  if (state.spinning) return;

  if (state.balance < state.bet) {
    resultText.textContent = "Yetersiz bakiye. Bahisi düşür.";
    resultText.className = "result-text lose";
    return;
  }

  state.spinning = true;
  resultText.textContent = "Şans dönüyor...";
  resultText.className = "result-text";
  updateUi();

  try {
    const spinResult = await apiRequest("/api/spin", {
      method: "POST",
      body: JSON.stringify({ bet: state.bet }),
    });

    await animateReels(spinResult.result);
    state.balance = spinResult.balance;

    if (spinResult.winAmount > 0) {
      resultText.textContent = `Kazandın! ${spinResult.multiplier}x ödeme: +${spinResult.winAmount}`;
      resultText.className = "result-text win";
      tg?.HapticFeedback?.notificationOccurred("success");
    } else {
      resultText.textContent = "Kaybettin. Tekrar dene.";
      resultText.className = "result-text lose";
      tg?.HapticFeedback?.notificationOccurred("error");
    }
  } catch (error) {
    resultText.textContent = error.message;
    resultText.className = "result-text lose";
  } finally {
    state.spinning = false;
    updateUi();
  }
}

async function loadProfile() {
  if (state.profileLoading) return;
  state.profileLoading = true;

  try {
    const data = await apiRequest("/api/me");
    state.playerId = data.player.id;
    state.balance = data.player.balance;
    state.accounts = data.player.diplomaciaAccounts || [];
    playerNameEl.textContent = data.player.name;
    walletPlayer.textContent = data.player.name;
    renderAccounts();
    updateUi();
  } finally {
    state.profileLoading = false;
  }
}

async function createDeposit() {
  createDepositButton.disabled = true;
  depositBox.className = "notice";
  depositBox.textContent = "Kod hazırlanıyor...";

  try {
    const data = await apiRequest("/api/deposits", {
      method: "POST",
      body: JSON.stringify({ amount: depositAmount.value }),
    });

    depositBox.innerHTML = `
      <strong>${data.deposit.uniqueAmount}</strong>
      <span>TheQueeN hesabına tam bu tutarı gönder.</span>
    `;
  } catch (error) {
    depositBox.textContent = error.message;
    depositBox.className = "notice error";
  } finally {
    createDepositButton.disabled = false;
  }
}

async function createWithdrawal() {
  withdrawButton.disabled = true;
  withdrawBox.className = "notice";
  withdrawBox.textContent = "Talep oluşturuluyor...";

  try {
    const data = await apiRequest("/api/withdrawals", {
      method: "POST",
      body: JSON.stringify({ amount: withdrawAmount.value, recipientId: withdrawAccount.value }),
    });

    state.balance = data.balance;
    const isPaid = data.withdrawal.status === "paid";
    withdrawBox.innerHTML = `
      <strong>${isPaid ? "Ödeme gönderildi" : "Talep alındı"}</strong>
      <span>${data.withdrawal.amount} bakiye ${data.withdrawal.targetPlayerName} hesabına ${isPaid ? "gönderildi" : "ödenecek"}.</span>
    `;
    updateUi();
  } catch (error) {
    withdrawBox.textContent = error.message;
    withdrawBox.className = "notice error";
  } finally {
    withdrawButton.disabled = false;
  }
}

async function blackjackAction(path, body = {}) {
  blackjackMessage.textContent = "İşleniyor...";

  try {
    const data = await apiRequest(path, {
      method: "POST",
      body: JSON.stringify(body),
    });

    state.balance = data.balance;
    renderBlackjack(data.game);
    updateUi();
  } catch (error) {
    blackjackMessage.textContent = error.message;
  }
}

async function pvpAction(path, body = {}, silent = false) {
  if (!silent) pvpMessage.textContent = "İşleniyor...";

  try {
    const data = await apiRequest(path, {
      method: path.endsWith("/state") ? "GET" : "POST",
      body: path.endsWith("/state") ? undefined : JSON.stringify(body),
    });

    state.balance = data.balance;
    renderPvpGame(data.game);
    updateUi();
  } catch (error) {
    if (!silent) pvpMessage.textContent = error.message;
  }
}

async function playRoulette() {
  roulettePlay.disabled = true;
  rouletteStatus.textContent = "Dönüyor";
  rouletteMessage.textContent = "Çark dönüyor...";
  rouletteMessage.className = "result-text";
  rouletteWheel.classList.add("spinning");

  try {
    const data = await apiRequest("/api/roulette/play", {
      method: "POST",
      body: JSON.stringify({ bet: rouletteBet.value, betType: state.rouletteBetType, number: rouletteNumber.value }),
    });

    await new Promise((resolve) => setTimeout(resolve, 900));
    state.balance = data.balance;
    rouletteDial.textContent = data.number;
    rouletteDial.className = `roulette-center ${data.color}`;
    rouletteMessage.textContent = `${data.number} ${data.color === "red" ? "kırmızı" : data.color === "black" ? "siyah" : "yeşil"}. ${data.message}`;
    rouletteMessage.className = data.won ? "result-text win" : "result-text lose";
    rouletteStatus.textContent = data.won ? "Kazandı" : "Kaybetti";
    updateUi();
  } catch (error) {
    rouletteMessage.textContent = error.message;
    rouletteMessage.className = "result-text lose";
    rouletteStatus.textContent = "Hata";
  } finally {
    rouletteWheel.classList.remove("spinning");
    roulettePlay.disabled = false;
  }
}

function setRouletteBetType(type) {
  state.rouletteBetType = type;
  rouletteNumber.disabled = type !== "number";

  roulettePicks.forEach((button) => {
    button.classList.toggle("active", button.dataset.roulette === type);
  });
}

function setDiceTarget(target) {
  diceTarget = target;
  dicePicks.forEach((button) => {
    button.classList.toggle("active", button.dataset.dice === target);
  });
}

async function playDice() {
  const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  dicePlay.disabled = true;
  diceStatus.textContent = "Atılıyor";
  diceMessage.textContent = "Zarlar dönüyor...";
  diceOne.classList.add("rolling");
  diceTwo.classList.add("rolling");

  try {
    const data = await apiRequest("/api/dice/play", {
      method: "POST",
      body: JSON.stringify({ bet: diceBet.value, target: diceTarget }),
    });

    await new Promise((resolve) => setTimeout(resolve, 700));
    state.balance = data.balance;
    diceOne.textContent = faces[data.dice[0] - 1];
    diceTwo.textContent = faces[data.dice[1] - 1];
    diceMessage.textContent = `Toplam ${data.total}. ${data.message}`;
    diceMessage.className = data.won ? "result-text win" : "result-text lose";
    diceStatus.textContent = data.won ? "Kazandı" : "Kaybetti";
    updateUi();
  } catch (error) {
    diceMessage.textContent = error.message;
    diceMessage.className = "result-text lose";
    diceStatus.textContent = "Hata";
  } finally {
    diceOne.classList.remove("rolling");
    diceTwo.classList.remove("rolling");
    dicePlay.disabled = false;
  }
}

async function loadPvpRooms() {
  const data = await apiRequest("/api/pvp21/rooms", { method: "GET" });
  state.balance = data.balance;
  renderPvpRooms(data.rooms || []);
  updateUi();
}

async function rpsAction(path, body = {}, silent = false) {
  if (!silent) rpsMessage.textContent = "İşleniyor...";

  try {
    const data = await apiRequest(path, {
      method: path.endsWith("/state") ? "GET" : "POST",
      body: path.endsWith("/state") ? undefined : JSON.stringify(body),
    });

    state.balance = data.balance;
    renderRpsGame(data.game);
    updateUi();
  } catch (error) {
    if (!silent) rpsMessage.textContent = error.message;
  }
}

async function loadRpsRooms() {
  const data = await apiRequest("/api/rps/rooms", { method: "GET" });
  state.balance = data.balance;
  renderRpsRooms(data.rooms || []);
  updateUi();
}

function renderChatMessages(messages) {
  chatMessages.innerHTML = "";

  if (!messages.length) {
    const empty = document.createElement("p");
    empty.className = "room-empty";
    empty.textContent = "Henüz mesaj yok.";
    chatMessages.append(empty);
    return;
  }

  for (const message of messages) {
    const item = document.createElement("div");
    item.className = message.playerId === state.playerId ? "chat-message mine" : "chat-message";
    const time = new Date(message.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    item.innerHTML = `
      <div><strong>${message.playerName}</strong><span>${time}</span></div>
      <p></p>
    `;
    item.querySelector("p").textContent = message.text;
    chatMessages.append(item);
  }

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function loadChatMessages() {
  const data = await apiRequest("/api/chat/messages", { method: "GET" });
  renderChatMessages(data.messages || []);
  chatStatus.textContent = "";
}

async function sendChatMessage(event) {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = "";
  chatStatus.textContent = "Gönderiliyor...";

  try {
    await apiRequest("/api/chat/messages", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    await loadChatMessages();
  } catch (error) {
    chatStatus.textContent = error.message;
  }
}

chips.forEach((chip) => {
  chip.addEventListener("click", () => setBet(chip.dataset.bet));
});

betInput.addEventListener("change", () => setBet(betInput.value));
spinButton.addEventListener("click", spin);
createDepositButton.addEventListener("click", createDeposit);
withdrawButton.addEventListener("click", createWithdrawal);
blackjackStart.addEventListener("click", () => blackjackAction("/api/blackjack/start", { bet: blackjackBet.value }));
blackjackHit.addEventListener("click", () => blackjackAction("/api/blackjack/hit"));
blackjackStand.addEventListener("click", () => blackjackAction("/api/blackjack/stand"));
pvpJoin.addEventListener("click", () => pvpAction("/api/pvp21/join", { stake: pvpStake.value }));
pvpCancel.addEventListener("click", () => pvpAction("/api/pvp21/cancel"));
pvpHit.addEventListener("click", () => pvpAction("/api/pvp21/hit"));
pvpStand.addEventListener("click", () => pvpAction("/api/pvp21/stand"));
roulettePlay.addEventListener("click", playRoulette);
roulettePicks.forEach((button) => {
  button.addEventListener("click", () => setRouletteBetType(button.dataset.roulette));
});
dicePlay.addEventListener("click", playDice);
dicePicks.forEach((button) => {
  button.addEventListener("click", () => setDiceTarget(button.dataset.dice));
});
rpsJoin.addEventListener("click", () => rpsAction("/api/rps/join", { stake: rpsStake.value }));
rpsCancel.addEventListener("click", () => rpsAction("/api/rps/cancel"));
rpsChoices.forEach((button) => {
  button.addEventListener("click", () => rpsAction("/api/rps/choose", { choice: button.dataset.rps }));
});
chatForm.addEventListener("submit", sendChatMessage);
gameCards.forEach((card) => {
  card.addEventListener("click", () => openGame(card.dataset.game));
});
quickCards.forEach((card) => {
  card.addEventListener("click", () => openTab(card.dataset.tabTarget));
});
tabButtons.forEach((button) => {
  button.addEventListener("click", () => openTab(button.dataset.tab));
});

bootTelegram();
updateUi();
loadProfile().catch((error) => {
  resultText.textContent = error.message;
  resultText.className = "result-text lose";
});

setInterval(() => {
  if (!state.spinning) {
    loadProfile().catch(() => {});
  }
}, 10000);

setInterval(() => {
  pvpAction("/api/pvp21/state", {}, true).catch(() => {});
  loadPvpRooms().catch(() => {});
  rpsAction("/api/rps/state", {}, true).catch(() => {});
  loadRpsRooms().catch(() => {});
  loadChatMessages().catch(() => {});
}, 3000);

loadPvpRooms().catch(() => {});
loadRpsRooms().catch(() => {});
loadChatMessages().catch(() => {});
