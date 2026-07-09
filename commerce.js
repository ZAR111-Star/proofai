const STORE_KEY = "proofai-commerce-v1";

const serviceCatalog = [
  {
    id: "evidence-basic",
    name: "标准证据包",
    category: "证据包",
    price: 99,
    unit: "份",
    delivery: "2 小时内",
    description: "整理作品指纹、素材来源、授权范围、修改记录和交付凭证。",
    features: ["PDF/HTML 证据包", "风险提示", "验真编号", "适合首单验证"],
  },
  {
    id: "evidence-pro",
    name: "深度证据包",
    category: "证据包",
    price: 299,
    unit: "份",
    delivery: "1 个工作日",
    description: "适合广告投放、短剧宣发、品牌视觉等需要更完整材料的交付。",
    features: ["素材逐项核对", "授权范围摘要", "项目台账", "客户验收版"],
  },
  {
    id: "chain-notary",
    name: "哈希上链存证",
    category: "链上存证",
    price: 199,
    unit: "次",
    delivery: "4 小时内",
    description: "仅将文件哈希和证据包摘要哈希写入联盟链/存证通道，不上传原文件。",
    features: ["链上交易编号", "时间戳", "摘要哈希", "适合企业版演示"],
  },
  {
    id: "legal-review",
    name: "律师版权审核",
    category: "法律协作",
    price: 799,
    unit: "次",
    delivery: "2 个工作日",
    description: "由合作律师根据材料进行版权、字体、图库、AI 工具条款风险审阅。",
    features: ["律师意见摘要", "风险等级", "整改建议", "不替代诉讼代理"],
  },
  {
    id: "team-ledger",
    name: "团队资产台账",
    category: "团队服务",
    price: 999,
    unit: "月",
    delivery: "开通即用",
    description: "适合 MCN、广告公司和设计工作室按项目管理证据包与素材授权。",
    features: ["40 份证据包额度", "项目归档", "素材来源表", "月度风险报表"],
  },
  {
    id: "enterprise-poc",
    name: "企业试点部署",
    category: "企业服务",
    price: 9800,
    unit: "项目",
    delivery: "10 个工作日",
    description: "为 AIGC 工具公司、内容平台或品牌方搭建试点流程与验真页。",
    features: ["需求梳理", "私有模板", "验真页配置", "接口方案"],
  },
];

const rechargeOptions = [
  { amount: 399, bonus: 0, label: "入门试用" },
  { amount: 999, bonus: 100, label: "小团队" },
  { amount: 1999, bonus: 300, label: "工作室" },
  { amount: 9800, bonus: 1500, label: "企业试点" },
];

const defaultCommerce = {
  balance: 0,
  bonusBalance: 0,
  orders: [],
  recharges: [],
  invoice: {
    title: "",
    taxNo: "",
    email: "",
    type: "增值税普通发票",
  },
};

let commerce = loadCommerce();
let activeWechatPayment = null;
let currentUser = null;

function loadCommerce() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    return saved ? { ...structuredClone(defaultCommerce), ...saved } : structuredClone(defaultCommerce);
  } catch {
    return structuredClone(defaultCommerce);
  }
}

function saveCommerce() {
  localStorage.setItem(STORE_KEY, JSON.stringify(commerce));
}

function yuan(value) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function nowText() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function newId(prefix) {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `${prefix}-${stamp}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function setText(id, value) {
  const node = document.querySelector(`#${id}`);
  if (node) node.textContent = value;
}

function refreshWallet() {
  setText("balanceText", yuan(commerce.balance + commerce.bonusBalance));
  setText("cashBalanceText", yuan(commerce.balance));
  setText("bonusBalanceText", yuan(commerce.bonusBalance));
  setText("orderCountText", commerce.orders.length);
  setText("rechargeCountText", commerce.recharges.length);
}

async function initPage() {
  // 强制登录守卫
  const user = await window.ProofAuth.requireAuth();
  if (!user) return;

  // 显示当前用户信息
  displayCurrentUser(user);

  const page = document.body.dataset.page;
  if (page === "services") initServicesPage();
  if (page === "recharge") initRechargePage();
  loadServerAccount();
  refreshWallet();
}

function displayCurrentUser(user) {
  const el = document.querySelector("#currentUserName");
  if (el) el.textContent = user.name || user.email;
  const modeEl = document.querySelector("#authModeLabel");
  if (modeEl && window.ProofAuth.isStandaloneMode()) {
    modeEl.textContent = "离线模式";
    modeEl.style.display = "";
  }
}

function initServicesPage() {
  renderServiceFilters();
  renderServices("全部");
  renderServiceOrders();
  document.querySelector("#customServiceForm").addEventListener("submit", submitCustomService);
  document.querySelector("#closePurchaseDialog").addEventListener("click", closePurchaseDialog);
  document.querySelector("#cancelPurchase").addEventListener("click", closePurchaseDialog);
  document.querySelector("#confirmPurchase").addEventListener("click", confirmPurchase);
  document.querySelector("#exportOrders").addEventListener("click", () => downloadJson(commerce.orders, "ProofAI_服务订单.json"));
}

function renderServiceFilters() {
  const categories = ["全部", ...new Set(serviceCatalog.map((item) => item.category))];
  document.querySelector("#serviceFilters").innerHTML = categories
    .map((category) => `<button class="chip ${category === "全部" ? "active" : ""}" data-category="${category}" type="button">${category}</button>`)
    .join("");
  document.querySelector("#serviceFilters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    document.querySelectorAll("#serviceFilters .chip").forEach((node) => node.classList.remove("active"));
    button.classList.add("active");
    renderServices(button.dataset.category);
  });
}

function renderServices(category) {
  const list = category === "全部" ? serviceCatalog : serviceCatalog.filter((item) => item.category === category);
  document.querySelector("#serviceGrid").innerHTML = list
    .map(
      (item) => `
        <article class="service-card">
          <header>
            <div>
              <span class="tag">${item.category}</span>
              <h3>${item.name}</h3>
            </div>
            <div>
              <div class="price">${yuan(item.price)}</div>
              <div class="unit">/${item.unit}</div>
            </div>
          </header>
          <p class="note">${item.description}</p>
          <ul class="feature-list">${item.features.map((feature) => `<li>${feature}</li>`).join("")}</ul>
          <div class="line"><span class="muted">交付时间</span><strong>${item.delivery}</strong></div>
          <button class="btn primary" data-buy="${item.id}" type="button">购买服务</button>
        </article>
      `
    )
    .join("");
  document.querySelectorAll("[data-buy]").forEach((button) => {
    button.addEventListener("click", () => openPurchaseDialog(button.dataset.buy));
  });
}

let pendingServiceId = null;

function openPurchaseDialog(id) {
  pendingServiceId = id;
  const service = serviceCatalog.find((item) => item.id === id);
  document.querySelector("#purchaseTitle").textContent = service.name;
  document.querySelector("#purchaseDetail").innerHTML = `
    <div class="order-summary">
      <div class="line"><span>服务类型</span><strong>${service.category}</strong></div>
      <div class="line"><span>服务价格</span><strong>${yuan(service.price)}</strong></div>
      <div class="line"><span>交付时间</span><strong>${service.delivery}</strong></div>
      <p class="note">${service.description}</p>
    </div>
  `;
  document.querySelector("#projectBrief").value = "";
  document.querySelector("#purchaseDialog").classList.add("open");
}

function closePurchaseDialog() {
  pendingServiceId = null;
  document.querySelector("#purchaseDialog").classList.remove("open");
}

async function confirmPurchase() {
  const service = serviceCatalog.find((item) => item.id === pendingServiceId);
  if (!service) return;

  const projectBrief = document.querySelector("#projectBrief").value.trim() || "客户暂未填写项目说明";
  const contact = document.querySelector("#purchaseContact").value.trim();
  const serverOrder = await purchaseServerOrder(service, projectBrief, contact);
  if (serverOrder) {
    closePurchaseDialog();
    toast("服务购买成功，已由服务端扣款并生成资金流水。");
    return;
  }

  const total = commerce.balance + commerce.bonusBalance;
  if (total < service.price) {
    toast("余额不足，请先充值。");
    window.location.href = "./recharge.html";
    return;
  }

  let remaining = service.price;
  const bonusUsed = Math.min(commerce.bonusBalance, remaining);
  commerce.bonusBalance -= bonusUsed;
  remaining -= bonusUsed;
  commerce.balance -= remaining;

  commerce.orders.unshift({
    id: newId("SVC"),
    serviceId: service.id,
    serviceName: service.name,
    category: service.category,
    amount: service.price,
    paidByBonus: bonusUsed,
    paidByCash: remaining,
    status: "待交付",
    projectBrief,
    contact,
    createdAt: nowText(),
  });
  saveCommerce();
  closePurchaseDialog();
  refreshWallet();
  renderServiceOrders();
  toast("服务购买成功，已生成订单。");
}

async function purchaseServerOrder(service, projectBrief, contact) {
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ serviceId: service.id, projectBrief, contact }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = "./login.html";
      return true;
    }
    if (response.status === 402) {
      toast(payload.error || "余额不足，请先充值。");
      window.location.href = "./recharge.html";
      return true;
    }
    if (!response.ok) throw new Error(payload.error || "购买失败");
    upsertOrder(payload.order);
    applyUserWallet(payload.user);
    saveCommerce();
    refreshWallet();
    renderServiceOrders();
    return payload.order;
  } catch {
    return null;
  }
}

function renderServiceOrders() {
  const rows = commerce.orders;
  const body = document.querySelector("#serviceOrderRows");
  body.innerHTML = rows.length
    ? rows
        .map(
          (order) => `
            <tr>
              <td>${order.id}<br><span class="muted">${order.createdAt}</span></td>
              <td>${order.serviceName}<br><span class="muted">${order.projectBrief}</span></td>
              <td>${yuan(order.amount)}</td>
              <td><span class="status pending">${order.status}</span></td>
              <td>${order.contact || "待补充"}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="5"><div class="empty">暂无服务订单。购买一个标准证据包即可生成首单记录。</div></td></tr>`;
}

function submitCustomService(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  commerce.orders.unshift({
    id: newId("CUS"),
    serviceId: "custom",
    serviceName: data.needType,
    category: "定制咨询",
    amount: 0,
    paidByBonus: 0,
    paidByCash: 0,
    status: "待报价",
    projectBrief: data.requirement,
    contact: data.contact,
    createdAt: nowText(),
  });
  syncServerOrder(commerce.orders[0]);
  saveCommerce();
  form.reset();
  renderServiceOrders();
  refreshWallet();
  toast("定制需求已记录，下一步可按此给客户报价。");
}

function initRechargePage() {
  let selectedAmount = rechargeOptions[1].amount;
  let selectedMethod = "微信支付";

  renderRechargeOptions(selectedAmount);
  renderRechargeRows();
  hydrateInvoice();
  updateRechargeSummary(selectedAmount);

  document.querySelector("#amountOptions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-amount]");
    if (!button) return;
    selectedAmount = Number(button.dataset.amount);
    document.querySelector("#customAmount").value = "";
    renderRechargeOptions(selectedAmount);
    updateRechargeSummary(selectedAmount);
  });

  document.querySelector("#customAmount").addEventListener("input", (event) => {
    const value = Math.max(0, Number(event.target.value || 0));
    selectedAmount = value;
    document.querySelectorAll(".amount-option").forEach((node) => node.classList.remove("active"));
    updateRechargeSummary(selectedAmount);
  });

  document.querySelector("#paymentMethods").addEventListener("click", (event) => {
    const button = event.target.closest("[data-method]");
    if (!button) return;
    selectedMethod = button.dataset.method;
    document.querySelectorAll(".method-option").forEach((node) => node.classList.remove("active"));
    button.classList.add("active");
  });

  document.querySelector("#coupon").addEventListener("input", () => updateRechargeSummary(selectedAmount));
  document.querySelector("#confirmRecharge").addEventListener("click", () => confirmRecharge(selectedAmount, selectedMethod));
  document.querySelector("#closeWechatPay").addEventListener("click", closeWechatPayDialog);
  document.querySelector("#queryWechatPay").addEventListener("click", queryWechatPayStatus);
  document.querySelector("#mockWechatPaid").addEventListener("click", confirmMockWechatPaid);
  document.querySelector("#invoiceForm").addEventListener("input", saveInvoice);
  document.querySelector("#invoiceForm").addEventListener("change", saveInvoice);
  document.querySelector("#exportRecharges").addEventListener("click", () => downloadJson(commerce.recharges, "ProofAI_充值记录.json"));
  document.querySelector("#clearDemoLedger").addEventListener("click", clearDemoLedger);
}

function renderRechargeOptions(selectedAmount) {
  document.querySelector("#amountOptions").innerHTML = rechargeOptions
    .map(
      (item) => `
        <button class="amount-option ${item.amount === selectedAmount ? "active" : ""}" data-amount="${item.amount}" type="button">
          <strong>${yuan(item.amount)}</strong>
          <span>${item.label}${item.bonus ? ` · 赠 ${yuan(item.bonus)}` : ""}</span>
        </button>
      `
    )
    .join("");
}

function getRechargeBonus(amount) {
  const matched = rechargeOptions.find((item) => item.amount === amount);
  const baseBonus = matched ? matched.bonus : Math.floor(amount * 0.05);
  const coupon = document.querySelector("#coupon")?.value.trim().toUpperCase();
  return baseBonus + (coupon === "PROOFAI100" ? 100 : 0);
}

function updateRechargeSummary(amount) {
  const bonus = getRechargeBonus(amount);
  setText("summaryAmount", yuan(amount));
  setText("summaryBonus", yuan(bonus));
  setText("summaryTotal", yuan(amount + bonus));
}

async function confirmRecharge(amount, method) {
  if (!amount || amount < 1) {
    toast("请输入有效充值金额。");
    return;
  }
  saveInvoice();
  const bonus = getRechargeBonus(amount);
  if (method === "微信支付") {
    const created = await createWechatPayment(amount, bonus);
    if (created) return;
  }
  const serverRecharge = await createServerRecharge(amount, bonus, method);
  if (serverRecharge) return;
  const order = {
    id: newId("PAY"),
    amount,
    bonus,
    method,
    status: "已入账",
    createdAt: nowText(),
    invoice: { ...commerce.invoice },
  };
  commerce.balance += amount;
  commerce.bonusBalance += bonus;
  commerce.recharges.unshift(order);
  saveCommerce();
  refreshWallet();
  renderRechargeRows();
  updateRechargeSummary(amount);
  toast("充值已模拟入账。真实版本需接入微信、支付宝或企业转账确认。");
}

async function createServerRecharge(amount, bonus, method) {
  try {
    const response = await fetch("/api/recharges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        amount,
        bonus,
        method,
        invoice: commerce.invoice,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = "./login.html";
      return true;
    }
    if (!response.ok) throw new Error(payload.error || "充值失败");
    applyRechargeRecord(payload.recharge, false);
    applyUserWallet(payload.user);
    saveCommerce();
    refreshWallet();
    renderRechargeRows();
    updateRechargeSummary(amount);
    toast("充值已由服务端入账并写入资金流水。");
    return payload.recharge;
  } catch {
    return null;
  }
}

async function createWechatPayment(amount, bonus) {
  try {
    const response = await fetch("/api/pay/wechat/native", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        amount,
        bonus,
        description: "ProofAI 服务充值",
        invoice: commerce.invoice,
      }),
    });
    if (response.status === 401) {
      window.location.href = "./login.html";
      return true;
    }
    if (!response.ok) throw new Error("后端支付接口暂不可用");
    const payload = await response.json();
    activeWechatPayment = payload.payment;
    openWechatPayDialog(payload);
    return true;
  } catch (error) {
    console.warn(error);
    return false;
  }
}

function openWechatPayDialog(payload) {
  const payment = payload.payment;
  document.querySelector("#wechatPayOrderNo").textContent = payment.outTradeNo;
  document.querySelector("#wechatPayAmount").textContent = yuan(payment.amount);
  document.querySelector("#wechatPayMode").textContent = payload.mode === "wechat" ? "真实微信支付" : "演示模式";
  document.querySelector("#wechatPayCodeUrl").value = payload.codeUrl || "";
  document.querySelector("#wechatPayDialog").classList.add("open");
  renderQrCode(payload.codeUrl || "");
  toast(payload.mode === "wechat" ? "微信支付订单已创建，请扫码付款。" : "当前未配置微信商户，已打开演示支付。");
}

function closeWechatPayDialog() {
  document.querySelector("#wechatPayDialog").classList.remove("open");
}

function renderQrCode(text) {
  const canvas = document.querySelector("#wechatQrCanvas");
  if (window.QRCode?.toCanvas) {
    window.QRCode.toCanvas(canvas, text || "ProofAI", { width: 220, margin: 2 }, () => {});
    return;
  }
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#202124";
  ctx.font = "14px sans-serif";
  ctx.fillText("QR 库未加载", 56, 104);
  ctx.fillText("请复制支付链接", 48, 128);
}

async function queryWechatPayStatus() {
  if (!activeWechatPayment?.outTradeNo) {
    toast("暂无微信支付单。");
    return;
  }
  try {
    const response = await fetch(`/api/pay/wechat/status/${encodeURIComponent(activeWechatPayment.outTradeNo)}`, { credentials: "same-origin" });
    if (!response.ok) throw new Error("查询失败");
    const payload = await response.json();
    if (payload.payment?.status === "SUCCESS") {
      applyRechargeRecord({
        id: payload.payment.id,
        amount: payload.payment.amount,
        bonus: payload.payment.bonus,
        method: "微信支付",
        status: "已入账",
        invoice: payload.payment.invoice,
        createdAt: payload.payment.paidAt || nowText(),
      });
      if (payload.user) applyUserWallet(payload.user);
      closeWechatPayDialog();
      toast("微信支付已确认并入账。");
      return;
    }
    toast(payload.wechat?.trade_state_desc || "暂未支付成功。");
  } catch (error) {
    toast("暂时无法查询支付状态。");
  }
}

async function confirmMockWechatPaid() {
  if (!activeWechatPayment) {
    toast("暂无演示支付单。");
    return;
  }
  const confirmed = await confirmServerMockPayment();
  if (confirmed) return;
  applyRechargeRecord({
    id: activeWechatPayment.id,
    amount: activeWechatPayment.amount,
    bonus: activeWechatPayment.bonus,
    method: "微信支付",
    status: "演示已入账",
    invoice: activeWechatPayment.invoice,
    createdAt: nowText(),
  });
  closeWechatPayDialog();
  toast("演示支付已入账。真实上线时必须以微信支付回调为准。");
}

async function confirmServerMockPayment() {
  try {
    const response = await fetch("/api/pay/mock/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ paymentId: activeWechatPayment.id }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = "./login.html";
      return true;
    }
    if (!response.ok) throw new Error(payload.error || "演示确认失败");
    if (payload.user) applyUserWallet(payload.user);
    await loadServerAccount();
    closeWechatPayDialog();
    toast("演示支付已由服务端入账并写入资金流水。");
    return true;
  } catch {
    return false;
  }
}

function applyRechargeRecord(order, sync = true) {
  const exists = commerce.recharges.some((item) => item.id === order.id);
  if (exists) return;
  commerce.balance += Number(order.amount || 0);
  commerce.bonusBalance += Number(order.bonus || 0);
  commerce.recharges.unshift(order);
  if (sync) syncServerRecharge(order);
  saveCommerce();
  refreshWallet();
  renderRechargeRows();
}

async function loadServerAccount() {
  try {
    const me = await fetch("/api/auth/me", { credentials: "same-origin" }).then((res) => res.json());
    currentUser = me.user || null;
    if (!currentUser) return;
    applyUserWallet(currentUser);
    const rows = await fetch("/api/orders", { credentials: "same-origin" }).then((res) => (res.ok ? res.json() : null));
    if (rows) {
      commerce.orders = rows.orders || commerce.orders;
      commerce.recharges = rows.recharges || commerce.recharges;
    }
    saveCommerce();
    refreshWallet();
    if (document.body.dataset.page === "services") renderServiceOrders();
    if (document.body.dataset.page === "recharge") renderRechargeRows();
  } catch {
    // 本地文件演示时没有服务端，继续使用 localStorage。
  }
}

function applyUserWallet(user) {
  if (!user) return;
  currentUser = user;
  commerce.balance = Number(user.walletBalance || 0);
  commerce.bonusBalance = Number(user.bonusBalance || 0);
}

function upsertOrder(order) {
  if (!order) return;
  const index = commerce.orders.findIndex((item) => item.id === order.id);
  if (index >= 0) commerce.orders[index] = order;
  else commerce.orders.unshift(order);
}

async function syncServerOrder(order) {
  try {
    await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(order),
    });
  } catch {
    // 本地双击 HTML 时没有后端，保留浏览器本地账本即可。
  }
}

async function syncServerRecharge(order) {
  try {
    await fetch("/api/recharges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(order),
    });
  } catch {
    // 本地演示模式无需服务器。
  }
}

function renderRechargeRows() {
  const body = document.querySelector("#rechargeRows");
  body.innerHTML = commerce.recharges.length
    ? commerce.recharges
        .map(
          (item) => `
            <tr>
              <td>${item.id}<br><span class="muted">${item.createdAt}</span></td>
              <td>${item.method}</td>
              <td>${yuan(item.amount)}</td>
              <td>${yuan(item.bonus)}</td>
              <td><span class="status done">${item.status}</span></td>
              <td>${item.invoice?.title || "未填写"}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="6"><div class="empty">暂无充值记录。选择金额后点击确认即可生成演示入账。</div></td></tr>`;
}

function hydrateInvoice() {
  const form = document.querySelector("#invoiceForm");
  Object.entries(commerce.invoice || {}).forEach(([key, value]) => {
    const field = form.elements[key];
    if (field) field.value = value || "";
  });
}

function saveInvoice() {
  const form = document.querySelector("#invoiceForm");
  commerce.invoice = Object.fromEntries(new FormData(form).entries());
  saveCommerce();
}

function clearDemoLedger() {
  const ok = confirm("确定清空本地演示账户、充值记录和服务订单？");
  if (!ok) return;
  commerce = structuredClone(defaultCommerce);
  saveCommerce();
  window.location.reload();
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded", initPage);
