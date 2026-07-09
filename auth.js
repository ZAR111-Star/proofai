async function postJson(url, data) {
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

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function showMessage(message) {
  const node = document.querySelector("#authMessage");
  if (node) node.textContent = message;
}

function redirectAfterLogin(user) {
  const saved = sessionStorage.getItem("proofai-redirect");
  sessionStorage.removeItem("proofai-redirect");
  if (saved && !saved.includes("login.html") && !saved.includes("register.html")) {
    window.location.href = saved;
    return;
  }
  window.location.href = user.role === "admin" ? "./admin.html" : "./services.html";
}

function initAuthPage() {
  const page = document.body.dataset.page;

  if (page === "login") {
    document.querySelector("#loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = formData(event.currentTarget);
      // 1) 尝试服务端登录
      try {
        const payload = await postJson("/api/auth/login", data);
        showMessage("登录成功，正在跳转...");
        redirectAfterLogin(payload.user);
        return;
      } catch (serverErr) {
        // 2) 服务端不可用，尝试客户端登录
        try {
          const session = window.ProofAuth.clientLogin(data.email, data.password);
          showMessage("离线模式登录成功，正在跳转...");
          redirectAfterLogin(session.user);
        } catch (clientErr) {
          showMessage(clientErr.message || serverErr.message);
        }
      }
    });
  }

  if (page === "register") {
    document.querySelector("#registerForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = formData(event.currentTarget);
      // 1) 尝试服务端注册
      try {
        await postJson("/api/auth/register", data);
        showMessage("注册成功，正在跳转...");
        window.location.href = "./services.html";
        return;
      } catch (serverErr) {
        // 2) 服务端不可用，尝试客户端注册
        try {
          window.ProofAuth.clientRegister(data);
          showMessage("离线模式注册成功，正在跳转...");
          window.location.href = "./services.html";
        } catch (clientErr) {
          showMessage(clientErr.message || serverErr.message);
        }
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", initAuthPage);
