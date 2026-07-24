let invoices = [];
let activeFilter = "all";
let selectedId = null;

const rows = document.querySelector("#invoice-rows");
const detail = document.querySelector("#detail");
const generatedAt = document.querySelector("#generated-at");

document.querySelector("#refresh").addEventListener("click", load);
document.querySelectorAll("[data-filter]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    activeFilter = button.dataset.filter;
    renderRows();
  });
});

await load();

async function load() {
  const response = await fetch("/api/invoices", { cache: "no-store" });
  const body = await response.json();
  invoices = body.invoices;
  generatedAt.textContent = new Date(body.generatedAt).toLocaleString();
  renderMetrics();
  renderRows();
  if (selectedId && invoices.some(invoice => invoice.id === selectedId)) {
    await showDetail(selectedId);
  }
}

function renderMetrics() {
  const attention = invoices.filter(needsAttention).length;
  setText("metric-total", invoices.length);
  setText("metric-pending", invoices.filter(invoice => invoice.status === "pending").length);
  setText("metric-paid", invoices.filter(invoice => invoice.status === "paid").length);
  setText("metric-attention", attention);
}

function renderRows() {
  const filtered = invoices.filter(invoice => {
    if (activeFilter === "all") return true;
    if (activeFilter === "attention") return needsAttention(invoice);
    return invoice.status === activeFilter;
  });
  rows.replaceChildren(
    ...filtered.map(invoice => {
      const tr = document.createElement("tr");
      if (invoice.id === selectedId) tr.classList.add("selected");
      tr.addEventListener("click", () => showDetail(invoice.id));
      tr.innerHTML = `
        <td><strong>${escape(invoice.orderId)}</strong><div class="mono">${escape(short(invoice.id))}</div></td>
        <td><span class="badge ${statusClass(invoice)}">${escape(displayStatus(invoice))}</span></td>
        <td>${escape(String(invoice.amount))} ${escape(invoice.assetSymbol)}</td>
        <td class="mono">${escape(short(invoice.paymentId, 18))}</td>
        <td class="mono">${escape(short(invoice.offerHash, 16))}</td>
        <td>${witnessLabel(invoice)}</td>`;
      return tr;
    }),
  );
}

async function showDetail(id) {
  selectedId = id;
  renderRows();
  const invoice = invoices.find(item => item.id === id);
  const proofResponse = await fetch(`/api/proof/${encodeURIComponent(id)}`, { cache: "no-store" });
  const proofBody = proofResponse.ok ? await proofResponse.json() : null;
  const anomalies = invoice.settlement?.anomalies ?? [];
  const verification = proofBody?.verification;
  detail.innerHTML = `
    <div class="detail-head">
      <h2>${escape(invoice.orderId)}</h2>
      <p class="mono">${escape(invoice.paymentId)}</p>
    </div>
    <div class="detail-section">
      <h3>Offer</h3>
      <dl class="kv">
        <dt>Recipient</dt><dd class="mono">${escape(invoice.recipient)}</dd>
        <dt>Reference</dt><dd class="mono">${escape(invoice.reference)}</dd>
        <dt>Expires</dt><dd>${escape(formatTime(invoice.expiresAt))}</dd>
        <dt>Offer hash</dt><dd class="mono">${escape(invoice.offerHash)}</dd>
        <dt>Issuer key</dt><dd class="mono">${escape(short(invoice.issuerKey ?? "", 24))}</dd>
      </dl>
    </div>
    <div class="detail-section">
      <h3>Settlement proof</h3>
      <dl class="kv">
        <dt>Signature</dt><dd class="mono">${escape(invoice.signature ?? "Not settled")}</dd>
        <dt>Proof hash</dt><dd class="mono">${escape(invoice.settlement?.proofHash ?? "Not available")}</dd>
        <dt>Quorum</dt><dd>${escape(witnessText(invoice))}</dd>
        <dt>Offline verify</dt><dd class="${verification?.valid ? "proof-ok" : "proof-bad"}">${verification ? (verification.valid ? "VALID" : "INVALID") : "NOT AVAILABLE"}</dd>
      </dl>
    </div>
    <div class="detail-section">
      <h3>Exceptions</h3>
      ${anomalies.length ? anomalies.map(item => `<span class="anomaly">${escape(item)}</span>`).join("") : "<span class=\"proof-ok\">None</span>"}
    </div>`;
}

function needsAttention(invoice) {
  return invoice.status === "expired" || (invoice.settlement?.anomalies?.length ?? 0) > 0;
}

function displayStatus(invoice) {
  if (needsAttention(invoice)) return "attention";
  return invoice.settlement?.outcome ?? invoice.status;
}

function statusClass(invoice) {
  return displayStatus(invoice).replaceAll("_", "-");
}

function witnessLabel(invoice) {
  const quorum = invoice.settlement?.witnessQuorum;
  if (!quorum) return "—";
  return `${quorum.valid}/${quorum.required} ${quorum.agreed ? "agree" : "dispute"}`;
}

function witnessText(invoice) {
  const quorum = invoice.settlement?.witnessQuorum;
  if (!quorum) return "No settlement";
  return `${quorum.valid} valid of ${quorum.required} required; ${quorum.agreed ? "agreed" : "disputed"}`;
}

function setText(id, value) {
  document.querySelector(`#${id}`).textContent = String(value);
}

function short(value, length = 12) {
  if (!value || value.length <= length) return value ?? "";
  return `${value.slice(0, length)}…`;
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

function escape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
