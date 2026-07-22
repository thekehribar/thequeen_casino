const keyForm = document.querySelector("#keyForm");
const adminKeyInput = document.querySelector("#adminKey");
const statusEl = document.querySelector("#status");
const totalsEl = document.querySelector("#totals");
const playersBody = document.querySelector("#playersBody");
const playersCount = document.querySelector("#playersCount");
const pendingWithdrawalsEl = document.querySelector("#pendingWithdrawals");
const depositsEl = document.querySelector("#deposits");
const withdrawalsEl = document.querySelector("#withdrawals");
const chatMessagesEl = document.querySelector("#chatMessages");

adminKeyInput.value = localStorage.getItem("queenAdminKey") || "";

function formatNumber(value) {
  return new Intl.NumberFormat("tr-TR").format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function renderItems(element, items, renderer, emptyText) {
  element.innerHTML = items.length ? items.map(renderer).join("") : `<div class="item"><small>${emptyText}</small></div>`;
}

function render(data) {
  const totals = data.totals;
  totalsEl.innerHTML = [
    ["Oyuncu", formatNumber(totals.players)],
    ["Toplam Bakiye", formatNumber(totals.totalBalance)],
    ["Yatırım", `${formatNumber(totals.creditedDepositAmount)} / ${formatNumber(totals.creditedDeposits)} adet`],
    ["Çekim", `${formatNumber(totals.paidWithdrawalAmount)} / ${formatNumber(totals.paidWithdrawals)} adet`],
    ["Bekleyen Yatırım", formatNumber(totals.pendingDeposits)],
    ["Bekleyen Çekim", formatNumber(totals.pendingWithdrawals)],
    ["House Profit", formatNumber(totals.houseProfit)],
  ].map(([label, value]) => `<article class="card"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></article>`).join("");

  playersCount.textContent = `${data.players.length} kayıt`;
  playersBody.innerHTML = data.players.map((player) => `
    <tr>
      <td>${escapeHtml(player.name || "Oyuncu")}</td>
      <td>${formatNumber(player.balance)}</td>
      <td>${escapeHtml((player.accounts || []).map((item) => item.name).join(", ") || "Yok")}</td>
      <td>${escapeHtml(player.id)}</td>
    </tr>
  `).join("");

  renderItems(pendingWithdrawalsEl, data.pendingWithdrawals, (item) => `
    <div class="item"><strong>${escapeHtml(item.playerName)} <span class="pill">${formatNumber(item.amount)}</span></strong><small>${escapeHtml(item.targetPlayerName || item.targetPlayerId)} - ${formatDate(item.createdAt)}</small></div>
  `, "Bekleyen çekim yok.");

  renderItems(depositsEl, data.deposits, (item) => `
    <div class="item"><strong>${escapeHtml(item.playerName)} <span class="pill">${formatNumber(item.amount)}</span></strong><small>${escapeHtml(item.status)} - gönderilen ${formatNumber(item.uniqueAmount)} - ${formatDate(item.createdAt)}</small></div>
  `, "Yatırım kaydı yok.");

  renderItems(withdrawalsEl, data.withdrawals, (item) => `
    <div class="item"><strong>${escapeHtml(item.playerName)} <span class="pill">${formatNumber(item.amount)}</span></strong><small>${escapeHtml(item.status)} - ${escapeHtml(item.targetPlayerName || item.targetPlayerId)} - ${formatDate(item.createdAt)}</small></div>
  `, "Çekim kaydı yok.");

  renderItems(chatMessagesEl, data.chatMessages, (item) => `
    <div class="item"><strong>${escapeHtml(item.playerName)}</strong><small>${escapeHtml(item.text)} - ${formatDate(item.createdAt)}</small></div>
  `, "Chat mesajı yok.");
}

async function loadAdmin() {
  const key = adminKeyInput.value.trim();
  if (!key) {
    statusEl.textContent = "Admin anahtarını gir.";
    return;
  }

  localStorage.setItem("queenAdminKey", key);
  statusEl.textContent = "Yükleniyor...";
  const response = await fetch("/api/admin/summary", { headers: { "x-admin-key": key } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Admin verisi alınamadı.");
  render(data);
  statusEl.textContent = `Güncellendi: ${formatDate(new Date().toISOString())}`;
}

keyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadAdmin().catch((error) => {
    statusEl.textContent = error.message;
  });
});

if (adminKeyInput.value) loadAdmin().catch((error) => { statusEl.textContent = error.message; });
