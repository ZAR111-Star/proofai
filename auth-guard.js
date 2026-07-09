/* ProofAI Auth Guard — 统一认证模块
 * 双模式运行：
 *   Server 模式 — 调用 /api/auth/me 等服务端 API
 *   Standalone 模式 — localStorage 模拟（GitHub Pages 等纯静态托管）
 */

const AUTH_KEY = "proofai-auth-v1";
const USERS_KEY = "proofai-users-v1";

/* ---- 默认用户（Standalone 模式种子数据）---- */
const SEED_USERS = [
  {
    id: "USR-20260709-ADMIN",
    email: "admin@proofai.local",
    name: "ProofAI 管理员",
    phone: "",
    role: "admin",
    status: "active",
    walletBalance: 0,
    bonusBalance: 0,
    password: "ProofAI@2026!",
    createdAt: new Date().toISOString(),
  },
];

/* ---- 内部工具 ---- */
function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : structuredClone(SEED_USERS);
  } catch {
    return structuredClone(SEED_USERS);
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(AUTH_KEY);
}

/* ---- 公开 API ---- */

/** 获取当前用户（Server 优先，Standalone 降级） */
async function getCurrentUser() {
  // 1) 尝试服务端
  try {
    const res = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        saveSession({ user: data.user, csrfToken: data.csrfToken, mode: "server" });
        return data.user;
      }
    }
  } catch {
    // 服务端不可达，降级到本地
  }

  // 2) 降级到 localStorage
  const session = loadSession();
  return session?.user || null;
}

/** 强制登录守卫 — 未登录则保存当前 URL 并跳转登录页 */
async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    sessionStorage.setItem("proofai-redirect", window.location.href);
    window.location.href = "./login.html";
    return null;
  }
  return user;
}

/** 管理员守卫 */
async function requireAdmin() {
  const user = await requireAuth();
  if (!user) return null;
  if (user.role !== "admin") {
    alert("需要管理员权限，即将跳转到服务中心。");
    window.location.href = "./services.html";
    return null;
  }
  return user;
}

/** 客户端登录（Standalone 模式） */
function clientLogin(email, password) {
  const users = loadUsers();
  const user = users.find(
    (u) => u.email === email && u.password === password && u.status === "active"
  );
  if (!user) {
    const err = new Error("邮箱或密码错误。");
    err.status = 401;
    throw err;
  }
  const safe = { ...user };
  delete safe.password;
  const session = {
    user: safe,
    csrfToken: crypto.randomUUID().replace(/-/g, ""),
    mode: "standalone",
    loginTime: new Date().toISOString(),
  };
  saveSession(session);
  return session;
}

/** 客户端注册（Standalone 模式） */
function clientRegister(data) {
  const email = String(data.email || "").trim().toLowerCase();
  const password = String(data.password || "");
  const name = String(data.name || "").trim() || email.split("@")[0];
  if (!email.includes("@")) {
    const err = new Error("请输入有效邮箱。");
    err.status = 400;
    throw err;
  }
  if (password.length < 8) {
    const err = new Error("密码至少 8 位。");
    err.status = 400;
    throw err;
  }
  const users = loadUsers();
  if (users.some((u) => u.email === email)) {
    const err = new Error("该邮箱已注册。");
    err.status = 400;
    throw err;
  }
  const user = {
    id: "USR-" + Date.now().toString(36).toUpperCase(),
    email,
    name,
    phone: String(data.phone || "").trim(),
    role: "user",
    status: "active",
    walletBalance: 0,
    bonusBalance: 0,
    password,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  const safe = { ...user };
  delete safe.password;
  const session = {
    user: safe,
    csrfToken: crypto.randomUUID().replace(/-/g, ""),
    mode: "standalone",
    loginTime: new Date().toISOString(),
  };
  saveSession(session);
  return session;
}

/** 退出登录 */
async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  } catch {
    // 无服务端也正常
  }
  clearSession();
  window.location.href = "./login.html";
}

/** 更新本地用户数据（Standalone 模式下同步余额等） */
function updateLocalUser(updates) {
  const session = loadSession();
  if (!session?.user) return;
  Object.assign(session.user, updates);
  saveSession(session);
  const users = loadUsers();
  const idx = users.findIndex((u) => u.id === session.user.id);
  if (idx >= 0) {
    Object.assign(users[idx], updates);
    saveUsers(users);
  }
}

/** 判断当前是否为 standalone 模式 */
function isStandaloneMode() {
  const session = loadSession();
  return session?.mode === "standalone";
}

/** 获取当前会话模式 */
function getSessionMode() {
  const session = loadSession();
  return session?.mode || "unknown";
}

/* 挂载到全局，方便其他脚本调用 */
window.ProofAuth = {
  getCurrentUser,
  requireAuth,
  requireAdmin,
  clientLogin,
  clientRegister,
  logout,
  updateLocalUser,
  isStandaloneMode,
  getSessionMode,
};
