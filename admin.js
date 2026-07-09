let adminCache = {
  users: [],
  orders: [],
  ledger: [],
  audit: [],
  payments: [],
  recharges: [],
  mode: "server",
};

function yuan(value) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

async function apiGet(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload;
}

async function apiPost(url, data = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(data),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---- Standalone 模式：从 localStorage 读取本地数据 ---- */
function loadStandaloneData() {
  const commerceRaw = localStorage.getItem("proofai-commerce-v1");
  let commerce = { orders: [], recharges: [], balance: 0, bonusBalance: 0 };
  try {
    if (commerceRaw) commerce = JSON.parse(commerceRaw);
  } catch {}

  const usersRaw = localStorage.getItem("proofai-users-v1");
  let users = [];
  try {
    if (usersRaw) users = JSON.parse(usersRaw);
  } catch {}
  // 去掉密码字段
  users = users.map((u) => {
    const { password, ...rest } = u;
    return rest;
  });

  const sessionRaw = localStorage.getItem("proofai-auth-v1");
  let currentUser = null;
  try {
    if (sessionRaw) currentUser = JSON.parse(sessionRaw).user;
  } catch {}

  const orders = (commerce.orders || []).map((o) => ({
    ...o,
    userId: currentUser?.id || "",
    userEmail: currentUser?.email || "",
  }));

  const recharges = (commerce.recharges || []).map((r) => ({
    ...r,
    userId: currentUser?.id || "",
  }));

  const ledger = [];
  for (const r of recharges) {
    ledger.push({
      id: r.id,
      userId: currentUser?.id || "",
      userEmail: currentUser?.email || "",
      type: "recharge",
      cashDelta: r.amount || 0,
      bonusDelta: r.bonus || 0,
      cashBalanceAfter: commerce.balance || 0,
      bonusBalanceAfter: commerce.bonusBalance || 0,
      summary: r.method || "充值",
      createdAt: r.createdAt || "",
    });
  }
  for (const o of orders) {
    ledger.push({
      id: o.id,
      userId: currentUser?.id || "",
      userEmail: currentUser?.email || "",
      type: "service_purchase",
      cashDelta: -(o.paidByCash || 0),
      bonusDelta: -(o.paidByBonus || 0),
      cashBalanceAfter: commerce.balance || 0,
      bonusBalanceAfter: commerce.bonusBalance || 0,
      summary: `购买：${o.serviceName || ""}`,
      createdAt: o.createdAt || "",
    });
  }

  const rechargeAmount = recharges.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const bonusIssued = recharges.reduce((s, r) => s + (Number(r.bonus) || 0), 0);
  const serviceRevenue = orders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const pendingOrders = orders.filter((o) => ["待交付", "待报价"].includes(o.status)).length;

  const serviceBreakdown = {};
  for (const o of orders) {
    const name = o.serviceName || "未知服务";
    serviceBreakdown[name] = serviceBreakdown[name] || { count: 0, amount: 0 };
    serviceBreakdown[name].count += 1;
    serviceBreakdown[name].amount = Math.round((serviceBreakdown[name].amount + (Number(o.amount) || 0)) * 100) / 100;
  }

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const day = d.toISOString().slice(0, 10);
    const recharge = recharges
      .filter((r) => (r.createdAt || "").slice(0, 10) === day)
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const orderCount = orders.filter((o) => (o.createdAt || "").slice(0, 10) === day).length;
    days.push({ day, recharge: Math.round(recharge * 100) / 100, orders: orderCount });
  }

  const auditLogs = [
    { id: "AUD-1", userId: currentUser?.id || "", action: "system.mode", summary: "Standalone 离线管理模式", ip: "local", createdAt: new Date().toISOString() },
  ];

  return {
    summary: {
      userCount: users.length || 1,
      activeUsers: users.filter((u) => u.status === "active").length || 1,
      rechargeAmount: Math.round(rechargeAmount * 100) / 100,
      bonusIssued: Math.round(bonusIssued * 100) / 100,
      serviceRevenue: Math.round(serviceRevenue * 100) / 100,
      pendingOrders,
      paymentCount: recharges.length,
      successfulPaymentCount: recharges.filter((r) => r.status === "已入账").length,
      ledgerCount: ledger.length,
    },
    days,
    serviceBreakdown: Object.entries(serviceBreakdown).map(([name, value]) => ({ name, ...value })),
    users,
    orders,
    recharges,
    ledger,
    audit: auditLogs,
    latestOrders: orders.slice(0, 10),
    latestLedger: ledger.slice(0, 20),
  };
}

async function initAdmin() {
  // 使用统一的 auth guard 检查管理员权限
  const user = await window.ProofAuth.requireAdmin();
  if (!user) return;

  document.querySelector("#adminUserText").textContent = `管理员：${user.email}${window.ProofAuth.isStandaloneMode() ? "（离线模式）" : ""}`;
  document.querySelector("#adminLogout").addEventListener("click", () => window.ProofAuth.logout());
  document.querySelector("#refreshAdmin").addEventListener("click", loadAdminData);

  await loadAdminData();
}

async function loadAdminData() {
  if (window.ProofAuth.isStandaloneMode()) {
    // Standalone 模式：从 localStorage 读取
    const data = loadStandaloneData();
    adminCache = {
      users: data.users,
      orders: data.orders,
      payments: data.recharges,
      recharges: data.recharges,
      ledger: data.ledger,
      audit: data.audit,
      mode: "standalone",
    };
    renderStats(data.summary);
    renderTrend(data.days);
    renderServiceBreakdown(data.serviceBreakdown);
    renderUsers(data.users);
    renderOrders(data.orders, data.users);
    renderLedger(data.ledger);
    renderAudit(data.audit);
    setupExportButtons();
    return;
  }

  // Server 模式：调用 API
  try {
    const [analytics, users, orders, payments, ledger, audit] = await Promise.all([
      apiGet("/api/admin/analytics"),
      apiGet("/api/admin/users"),
      apiGet("/api/admin/orders"),
      apiGet("/api/admin/payments"),
      apiGet("/api/admin/ledger"),
      apiGet("/api/admin/audit"),
    ]);
    adminCache = {
      users: users.users,
      orders: orders.orders,
      payments: payments.payments,
      recharges: payments.recharges,
      ledger: ledger.ledger,
      audit: audit.auditLogs,
      mode: "server",
    };
    renderStats(analytics.summary);
    renderTrend(analytics.days);
    renderServiceBreakdown(analytics.serviceBreakdown);
    renderUsers(adminCache.users);
    renderOrders(adminCache.orders, adminCache.users);
    renderLedger(adminCache.ledger);
    renderAudit(adminCache.audit);
    setupExportButtons();
  } catch (error) {
    document.querySelector("#adminUserText").textContent = "数据加载失败：" + error.message;
  }
}

function setupExportButtons() {
  document.querySelector("#exportLedgerCsv").addEventListener("click", () =>
    exportCsv("ProofAI_资金流水.csv", adminCache.ledger)
  );
  document.querySelector("#exportOrdersCsv").addEventListener("click", () =>
    exportCsv("ProofAI_订单.csv", adminCache.orders)
  );
}

function renderStats(summary) {
  const cards = [
    ["用户数", summary.userCount],
    ["充值金额", yuan(summary.rechargeAmount)],
    ["服务收入", yuan(summary.serviceRevenue)],
    ["待处理订单", summary.pendingOrders],
    ["成功支付", summary.successfulPaymentCount],
    ["流水条数", summary.ledgerCount],
  ];
  document.querySelector("#adminStats").innerHTML = cards
    .map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`)
    .join("");
}

function renderTrend(days) {
  const max = Math.max(1, ...days.map((item) => item.recharge));
  document.querySelector("#trendChart").innerHTML = days
    .map((item) => {
      const height = Math.max(8, Math.round((item.recharge / max) * 120));
      return `
        <div class="bar-item">
          <div class="bar-value">${yuan(item.recharge)}</div>
          <div class="bar" style="height:${height}px"></div>
          <div class="bar-label">${item.day.slice(5)}<br>${item.orders} 单</div>
        </div>
      `;
    })
    .join("");
}

function renderServiceBreakdown(rows) {
  document.querySelector("#serviceBreakdownRows").innerHTML = rows.length
    ? rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${row.count}</td><td>${yuan(row.amount)}</td></tr>`).join("")
    : `<tr><td colspan="3"><div class="empty">暂无服务销售数据</div></td></tr>`;
}

function renderUsers(users) {
  document.querySelector("#adminUserRows").innerHTML = users
    .map(
      (user) => `
        <tr>
          <td>${escapeHtml(user.name)}<br><span class="muted">${escapeHtml(user.email)}</span></td>
          <td>${escapeHtml(user.role)}</td>
          <td>${yuan(user.walletBalance)}</td>
          <td>${yuan(user.bonusBalance)}</td>
          <td>${formatTime(user.createdAt)}</td>
        </tr>
      `
    )
    .join("");
}

function renderOrders(orders, users) {
  const userMap = new Map(users.map((user) => [user.id, user]));
  document.querySelector("#adminOrderRows").innerHTML = orders.length
    ? orders
        .map((order) => {
          const user = userMap.get(order.userId);
          return `
            <tr>
              <td>${order.id}<br><span class="muted">${formatTime(order.createdAt)}</span></td>
              <td>${escapeHtml(user?.email || order.userId || "")}</td>
              <td>${escapeHtml(order.serviceName)}</td>
              <td>${yuan(order.amount)}</td>
              <td><span class="status pending">${escapeHtml(order.status)}</span></td>
              <td>${escapeHtml(order.projectBrief || "")}</td>
              <td>
                ${adminCache.mode === "server"
                  ? `<button class="btn secondary small" data-deliver="${order.id}" type="button">标记已交付</button>`
                  : `<span class="muted">离线模式</span>`}
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="7"><div class="empty">暂无订单</div></td></tr>`;

  if (adminCache.mode === "server") {
    document.querySelectorAll("[data-deliver]").forEach((button) => {
      button.addEventListener("click", async () => {
        await apiPost(`/api/admin/orders/${button.dataset.deliver}`, { status: "已交付" });
        await loadAdminData();
      });
    });
  }
}

function renderLedger(rows) {
  document.querySelector("#ledgerRows").innerHTML = rows.length
    ? rows
        .map(
          (row) => `
            <tr>
              <td>${formatTime(row.createdAt)}</td>
              <td>${escapeHtml(row.userEmail || row.userId)}</td>
              <td>${escapeHtml(row.type)}</td>
              <td>${yuan(row.cashDelta)}</td>
              <td>${yuan(row.bonusDelta)}</td>
              <td>${yuan(row.cashBalanceAfter)} / ${yuan(row.bonusBalanceAfter)}</td>
              <td>${escapeHtml(row.summary)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="7"><div class="empty">暂无资金流水</div></td></tr>`;
}

function renderAudit(rows) {
  document.querySelector("#auditRows").innerHTML = rows.length
    ? rows
        .slice(0, 100)
        .map(
          (row) => `
            <tr>
              <td>${formatTime(row.createdAt)}</td>
              <td>${escapeHtml(row.userId)}</td>
              <td>${escapeHtml(row.action)}</td>
              <td>${escapeHtml(row.summary)}</td>
              <td>${escapeHtml(row.ip)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="5"><div class="empty">暂无审计日志</div></td></tr>`;
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function exportCsv(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const content = [headers.join(","), ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(","))].join("\n");
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

document.addEventListener("DOMContentLoaded", initAdmin);
