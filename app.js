const form = document.querySelector("#evidenceForm");
const reportPreview = document.querySelector("#reportPreview");
const fileRows = document.querySelector("#fileRows");
const materialRows = document.querySelector("#materialRows");
const changeRows = document.querySelector("#changeRows");
const evidenceIdText = document.querySelector("#evidenceIdText");
const fileInput = document.querySelector("#fileInput");
const fileDrop = document.querySelector("#fileDrop");

const STORAGE_KEY = "proofai-mvp-state-v1";

const today = new Date();
const pad = (value) => String(value).padStart(2, "0");
const todayText = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

const defaultState = {
  evidenceId: `PAI-${todayText.replaceAll("-", "")}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
  files: [],
  materials: [
    {
      name: "主视觉 AI 生成图",
      source: "AI 生成",
      license: "平台商用条款",
      usage: "海报主画面",
      proof: "生成记录与平台条款截图",
    },
    {
      name: "品牌字体",
      source: "图库/字体库",
      license: "购买授权",
      usage: "海报标题",
      proof: "字体订单截图",
    },
  ],
  changes: [
    {
      time: `${todayText}T10:00`,
      owner: "设计师",
      content: "生成首版视觉方向并完成初稿排版",
      version: "v1.0",
    },
    {
      time: `${todayText}T15:30`,
      owner: "项目经理",
      content: "根据客户反馈调整品牌露出与发布尺寸",
      version: "v1.1",
    },
  ],
};

let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...defaultState, ...saved } : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  const formData = Object.fromEntries(new FormData(form).entries());
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, formData }));
}

function hydrateForm() {
  const data = state.formData || {};
  if (!data.deliveryDate) data.deliveryDate = todayText;
  Object.entries(data).forEach(([key, value]) => {
    const field = form.elements[key];
    if (field) field.value = value;
  });
  if (!form.elements.deliveryDate.value) form.elements.deliveryDate.value = todayText;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getFormData() {
  return Object.fromEntries(new FormData(form).entries());
}

function readableSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

async function sha256(buffer) {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return sha256Fallback(new Uint8Array(buffer));
}

function sha256Fallback(bytes) {
  const rightRotate = (value, amount) => (value >>> amount) | (value << (32 - amount));
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const words = [];
  const hash = [];
  const k = [];
  let primeCounter = 0;
  const isComposite = {};

  for (let candidate = 2; primeCounter < 64; candidate += 1) {
    if (!isComposite[candidate]) {
      for (let multiple = candidate * candidate; multiple < 312; multiple += candidate) {
        isComposite[multiple] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter += 1;
    }
  }

  const bitLength = bytes.length * 8;
  for (let i = 0; i < bytes.length; i += 1) {
    words[i >> 2] |= bytes[i] << ((3 - i) % 4) * 8;
  }
  words[bitLength >> 5] |= 0x80 << (24 - (bitLength % 32));
  words[(((bitLength + 64) >> 9) << 4) + 15] = bitLength;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);
    for (let i = 0; i < 64; i += 1) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash.unshift((temp1 + temp2) | 0);
      hash[4] = (hash[4] + temp1) | 0;
      hash.pop();
    }
    for (let i = 0; i < 8; i += 1) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  return hash.map((h) => (h >>> 0).toString(16).padStart(8, "0")).join("");
}

async function addFiles(files) {
  const incoming = [...files];
  for (const file of incoming) {
    const buffer = await file.arrayBuffer();
    const hash = await sha256(buffer);
    state.files.push({
      id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now() + Math.random()),
      name: file.name,
      type: file.type || "未知类型",
      size: file.size,
      lastModified: new Date(file.lastModified).toLocaleString("zh-CN"),
      purpose: inferPurpose(file.name),
      version: "v1.0",
      hash,
    });
  }
  saveState();
  render();
}

function inferPurpose(name) {
  const lower = name.toLowerCase();
  if (/\.(png|jpg|jpeg|webp|psd|ai|fig)$/.test(lower)) return "视觉素材/设计稿";
  if (/\.(mp4|mov|avi|mkv)$/.test(lower)) return "视频交付物";
  if (/\.(docx|doc|txt|md|pdf)$/.test(lower)) return "文案/说明文件";
  return "项目交付物";
}

function renderFiles() {
  if (!state.files.length) {
    fileRows.innerHTML = `<tr><td colspan="6" class="muted">暂未添加文件。你可以先用客户样例文件演示。</td></tr>`;
    return;
  }
  fileRows.innerHTML = state.files
    .map(
      (file) => `
        <tr>
          <td>
            <strong>${escapeHtml(file.name)}</strong>
            <div class="muted">${escapeHtml(file.type)} · ${escapeHtml(file.lastModified)}</div>
          </td>
          <td>${readableSize(file.size)}</td>
          <td><input data-file-id="${file.id}" data-field="purpose" value="${escapeHtml(file.purpose)}" /></td>
          <td><input data-file-id="${file.id}" data-field="version" value="${escapeHtml(file.version)}" /></td>
          <td><div class="hash">${escapeHtml(file.hash)}</div></td>
          <td><button class="icon danger" data-remove-file="${file.id}" type="button">删除</button></td>
        </tr>
      `
    )
    .join("");
}

function renderMaterials() {
  materialRows.innerHTML = state.materials.map((item, index) => rowFromTemplate("materialTemplate", item, index)).join("");
}

function renderChanges() {
  changeRows.innerHTML = state.changes.map((item, index) => rowFromTemplate("changeTemplate", item, index)).join("");
}

function rowFromTemplate(templateId, item, index) {
  const template = document.querySelector(`#${templateId}`).innerHTML;
  const wrapper = document.createElement("tbody");
  wrapper.innerHTML = template.trim();
  const row = wrapper.firstElementChild;
  row.dataset.index = index;
  row.querySelectorAll("[data-field]").forEach((field) => {
    const key = field.dataset.field;
    field.value = item[key] || "";
    field.dataset.index = index;
    if (field.tagName === "SELECT") {
      [...field.options].forEach((option) => {
        if (option.value === field.value) option.setAttribute("selected", "selected");
        else option.removeAttribute("selected");
      });
    } else {
      field.setAttribute("value", field.value);
    }
  });
  return row.outerHTML;
}

function collectRisks(data) {
  const risks = [];
  if (!data.projectName || !data.clientName) risks.push("项目名称或客户名称不完整，证据包对外使用前需要补齐。");
  if (!state.files.length) risks.push("尚未添加作品文件，无法形成文件指纹和验真依据。");
  if (data.aiUsed !== "否" && (!data.aiTools || !data.promptSummary)) risks.push("使用了 AI 工具，但工具名称或生成说明不完整。");
  if (data.commercialUse !== "允许商用") risks.push("商用授权状态不是“允许商用”，建议先确认合同、平台条款或授权文件。");
  if (!data.platforms || !data.licensePeriod) risks.push("使用平台或使用期限不完整，后续容易出现授权范围争议。");
  const weakMaterials = state.materials.filter((item) => !item.proof || item.source === "待确认");
  if (weakMaterials.length) risks.push(`${weakMaterials.length} 项素材证明材料不完整或来源待确认。`);
  if (!data.deliveryProof) risks.push("交付凭证为空，建议保留邮件、聊天截图或网盘记录。");
  return risks;
}

function renderReport() {
  const data = getFormData();
  const verifyUrl = `${data.verifyBase || ""}${state.evidenceId}`;
  const risks = collectRisks(data);
  evidenceIdText.textContent = state.evidenceId;

  reportPreview.innerHTML = `
    <div class="report-document">
      <section class="report-cover">
        <div class="report-title-row">
          <div>
            <p class="panel-kicker">ProofAI Evidence Pack</p>
            <h2 class="big-title">${escapeHtml(data.projectName || "未命名项目")}</h2>
          </div>
          <div class="meta">
            <span>证据包编号：${escapeHtml(state.evidenceId)}</span>
            <span>生成日期：${escapeHtml(todayText)}</span>
            <span>验真链接：${escapeHtml(verifyUrl)}</span>
          </div>
        </div>
      </section>

      <section class="metrics">
        <div class="metric"><strong>${state.files.length}</strong><span>作品文件</span></div>
        <div class="metric"><strong>${state.materials.length}</strong><span>素材记录</span></div>
        <div class="metric"><strong>${risks.length}</strong><span>风险提示</span></div>
      </section>

      <section class="report-section">
        <h3>1. 项目基本信息</h3>
        <div class="kv">
          ${kv("客户名称", data.clientName)}
          ${kv("服务团队", data.providerName)}
          ${kv("项目负责人", data.ownerName)}
          ${kv("联系方式", data.contact)}
          ${kv("合同/订单编号", data.contractId)}
          ${kv("交付日期", data.deliveryDate)}
        </div>
      </section>

      <section class="report-section">
        <h3>2. 作品文件与指纹</h3>
        ${fileTable()}
      </section>

      <section class="report-section">
        <h3>3. 创作与 AI 生成说明</h3>
        <div class="kv">
          ${kv("是否使用 AI", data.aiUsed)}
          ${kv("使用工具", data.aiTools)}
          ${kv("内容创作人", data.creatorName)}
          ${kv("最终确认人", data.finalApprover)}
        </div>
        <h4>生成说明</h4>
        <p>${escapeHtml(data.promptSummary || "暂无")}</p>
        <h4>人工修改说明</h4>
        <p>${escapeHtml(data.manualEdits || "暂无")}</p>
      </section>

      <section class="report-section">
        <h3>4. 素材来源与授权证明</h3>
        ${materialTable()}
      </section>

      <section class="report-section">
        <h3>5. 授权范围</h3>
        <div class="kv">
          ${kv("商用状态", data.commercialUse)}
          ${kv("使用平台", data.platforms)}
          ${kv("使用地域", data.region)}
          ${kv("使用期限", data.licensePeriod)}
          ${kv("二次修改", data.derivativeAllowed)}
          ${kv("转授权", data.sublicenseAllowed)}
        </div>
        <h4>主要限制</h4>
        <p>${escapeHtml(data.restrictions || "暂无")}</p>
      </section>

      <section class="report-section">
        <h3>6. 修改与交付记录</h3>
        ${changeTable()}
        <div class="kv">
          ${kv("交付方式", data.deliveryMethod)}
          ${kv("交付对象", data.deliveryTarget)}
          ${kv("验收状态", data.acceptanceStatus)}
          ${kv("交付凭证", data.deliveryProof)}
        </div>
      </section>

      <section class="report-section">
        <h3>7. 风险提示</h3>
        ${
          risks.length
            ? `<ul class="risk-list">${risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join("")}</ul>`
            : `<p class="ok-note">当前材料已覆盖基础商用证据字段，建议在正式交付前补充合同、授权页和交付截图原件。</p>`
        }
      </section>

      <section class="report-section">
        <h3>8. 声明</h3>
        <p class="disclaimer">本证据包用于辅助记录内容创作、素材来源、授权范围、文件指纹和交付过程，不替代专业法律意见，不对作品权属作最终法律认定。涉及重大商业发布、争议处理或诉讼时，应咨询专业律师或公证机构。</p>
      </section>
    </div>
  `;
}

function kv(label, value) {
  return `<div><span>${escapeHtml(label)}</span><span>${escapeHtml(value || "暂无")}</span></div>`;
}

function fileTable() {
  if (!state.files.length) return `<p class="muted">暂未添加作品文件。</p>`;
  return `
    <table class="report-table">
      <thead><tr><th>文件名</th><th>用途</th><th>版本</th><th>大小</th><th>SHA-256 指纹</th></tr></thead>
      <tbody>
        ${state.files
          .map(
            (file) => `
              <tr>
                <td>${escapeHtml(file.name)}</td>
                <td>${escapeHtml(file.purpose)}</td>
                <td>${escapeHtml(file.version)}</td>
                <td>${readableSize(file.size)}</td>
                <td>${escapeHtml(file.hash)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function materialTable() {
  if (!state.materials.length) return `<p class="muted">暂未登记素材。</p>`;
  return `
    <table class="report-table">
      <thead><tr><th>素材名称</th><th>来源</th><th>授权方式</th><th>使用位置</th><th>证明材料</th></tr></thead>
      <tbody>
        ${state.materials
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.name)}</td>
                <td>${escapeHtml(item.source)}</td>
                <td>${escapeHtml(item.license)}</td>
                <td>${escapeHtml(item.usage)}</td>
                <td>${escapeHtml(item.proof)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function changeTable() {
  if (!state.changes.length) return `<p class="muted">暂未登记修改记录。</p>`;
  return `
    <table class="report-table">
      <thead><tr><th>时间</th><th>修改人</th><th>修改内容</th><th>版本</th></tr></thead>
      <tbody>
        ${state.changes
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.time)}</td>
                <td>${escapeHtml(item.owner)}</td>
                <td>${escapeHtml(item.content)}</td>
                <td>${escapeHtml(item.version)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function render() {
  renderFiles();
  renderMaterials();
  renderChanges();
  renderReport();
}

function bindEvents() {
  const handleEdit = (event) => {
    const fileId = event.target.dataset.fileId;
    const field = event.target.dataset.field;
    const index = event.target.dataset.index;

    if (fileId && field) {
      const file = state.files.find((item) => item.id === fileId);
      if (file) file[field] = event.target.value;
    } else if (field && index !== undefined) {
      const row = event.target.closest("tbody").id;
      const collection = row === "materialRows" ? state.materials : state.changes;
      collection[Number(index)][field] = event.target.value;
    }

    saveState();
    renderReport();
  };

  form.addEventListener("input", handleEdit);
  form.addEventListener("change", handleEdit);

  form.addEventListener("click", (event) => {
    const removeFileId = event.target.dataset.removeFile;
    if (removeFileId) {
      state.files = state.files.filter((file) => file.id !== removeFileId);
      saveState();
      render();
    }

    if (event.target.dataset.remove !== undefined) {
      const row = event.target.closest("tr");
      const index = Number(row.dataset.index);
      if (row.closest("#materialRows")) state.materials.splice(index, 1);
      if (row.closest("#changeRows")) state.changes.splice(index, 1);
      saveState();
      render();
    }
  });

  document.querySelector("#addMaterial").addEventListener("click", () => {
    state.materials.push({ name: "", source: "待确认", license: "", usage: "", proof: "" });
    saveState();
    render();
  });

  document.querySelector("#addChange").addEventListener("click", () => {
    state.changes.push({ time: `${todayText}T09:00`, owner: "", content: "", version: "v1.0" });
    saveState();
    render();
  });

  fileInput.addEventListener("change", (event) => addFiles(event.target.files));

  fileDrop.addEventListener("dragover", (event) => {
    event.preventDefault();
    fileDrop.classList.add("is-over");
  });

  fileDrop.addEventListener("dragleave", () => fileDrop.classList.remove("is-over"));

  fileDrop.addEventListener("drop", (event) => {
    event.preventDefault();
    fileDrop.classList.remove("is-over");
    addFiles(event.dataTransfer.files);
  });

  document.querySelector("#printReport").addEventListener("click", () => window.print());
  document.querySelector("#downloadJson").addEventListener("click", downloadJson);
  document.querySelector("#downloadHtml").addEventListener("click", downloadHtml);
  document.querySelector("#copySummary").addEventListener("click", copySummary);
  document.querySelector("#resetDemo").addEventListener("click", resetDemo);
}

function downloadJson() {
  const payload = {
    evidenceId: state.evidenceId,
    formData: getFormData(),
    files: state.files,
    materials: state.materials,
    changes: state.changes,
    exportedAt: new Date().toISOString(),
  };
  downloadBlob(JSON.stringify(payload, null, 2), `${state.evidenceId}.json`, "application/json");
}

function downloadHtml() {
  const css = collectCss();
  const html = `
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(state.evidenceId)} 证据包</title>
  <style>${css}</style>
</head>
<body>
  <main class="report exported-report">${reportPreview.innerHTML}</main>
</body>
</html>`;
  downloadBlob(html, `${state.evidenceId}_证据包.html`, "text/html");
}

function collectCss() {
  return [...document.styleSheets]
    .map((sheet) => {
      try {
        return [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function copySummary() {
  const data = getFormData();
  const risks = collectRisks(data);
  const text = [
    `证据包编号：${state.evidenceId}`,
    `项目：${data.projectName}`,
    `客户：${data.clientName}`,
    `作品文件：${state.files.length} 个`,
    `素材记录：${state.materials.length} 项`,
    `风险提示：${risks.length} 项`,
    `验真链接：${data.verifyBase || ""}${state.evidenceId}`,
  ].join("\n");
  await writeClipboard(text);
  const button = document.querySelector("#copySummary");
  button.textContent = "已复制";
  setTimeout(() => (button.textContent = "复制摘要"), 1200);
}

async function writeClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function resetDemo() {
  const ok = confirm("确定清空当前演示数据？");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(defaultState);
  hydrateForm();
  render();
}

hydrateForm();
bindEvents();
render();
