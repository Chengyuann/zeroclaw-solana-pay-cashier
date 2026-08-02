let invoices = [];
let activeFilter = "all";
let selectedId = null;
let activeTab = "summary";
let searchQuery = "";
let clusterFilter = "all";
let sortOrder = "newest";
let selectedProof = null;
let detailRequestId = 0;
let loadRequestId = 0;
let autoRefreshTimer = null;
let loadInFlight = false;
const staticMode = window.__CASHIER_STATIC__ === true;

const rows = document.querySelector("#invoice-rows");
const detail = document.querySelector("#detail");
const generatedAt = document.querySelector("#generated-at");
const refreshButton = document.querySelector("#refresh");
const searchInput = document.querySelector("#search");
const clusterSelect = document.querySelector("#cluster-filter");
const sortSelect = document.querySelector("#sort-order");
const autoRefreshInput = document.querySelector("#auto-refresh");
const siteHeader = document.querySelector(".site-header");
const menuToggle = document.querySelector("#menu-toggle");
const siteNav = document.querySelector("#site-nav");
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
autoRefreshInput.checked =
  !staticMode && readPreference("cashier-auto-refresh") !== "false";
autoRefreshInput.disabled = staticMode;
if (staticMode) autoRefreshInput.closest(".auto-refresh").title = "Static snapshot";

refreshButton.addEventListener("click", () => load());
searchInput.addEventListener("input", event => {
  searchQuery = event.target.value.trim().toLowerCase();
  renderRows();
});
clusterSelect.addEventListener("change", event => {
  clusterFilter = event.target.value;
  renderRows();
});
sortSelect.addEventListener("change", event => {
  sortOrder = event.target.value;
  renderRows();
});

document.querySelectorAll("[data-filter]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach(item => {
      item.classList.remove("active");
      item.setAttribute("aria-pressed", "false");
    });
    button.classList.add("active");
    button.setAttribute("aria-pressed", "true");
    activeFilter = button.dataset.filter;
    renderRows();
  });
});

detail.addEventListener("click", async event => {
  const tab = event.target.closest("[data-detail-tab]");
  if (tab) {
    activeTab = tab.dataset.detailTab;
    renderDetail();
    return;
  }

  const copyButton = event.target.closest("[data-copy]");
  if (copyButton) {
    await copyText(copyButton.dataset.copy, copyButton);
    return;
  }

  const exportButton = event.target.closest("[data-export-proof]");
  if (exportButton && selectedProof) {
    exportProof(selectedProof, selectedId);
  }
});

detail.addEventListener("keydown", event => {
  const tab = event.target.closest("[data-detail-tab]");
  if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    return;
  }
  event.preventDefault();
  const tabs = [...detail.querySelectorAll("[data-detail-tab]")];
  const current = tabs.indexOf(tab);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].click();
  detail.querySelector(`[data-detail-tab="${activeTab}"]`)?.focus();
});

menuToggle.addEventListener("click", () => {
  setMenuOpen(menuToggle.getAttribute("aria-expanded") !== "true");
});
siteNav.addEventListener("click", event => {
  if (event.target.closest("a")) setMenuOpen(false);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") setMenuOpen(false, true);
});
document.addEventListener("pointerdown", event => {
  if (!siteHeader.contains(event.target)) setMenuOpen(false);
});
autoRefreshInput.addEventListener("change", () => {
  writePreference("cashier-auto-refresh", String(autoRefreshInput.checked));
  scheduleAutoRefresh();
});
document.addEventListener("visibilitychange", scheduleAutoRefresh);

initializeMotion();
await load();
scheduleAutoRefresh();

async function load({ silent = false } = {}) {
  if (loadInFlight) return;
  loadInFlight = true;
  const requestId = ++loadRequestId;
  if (!silent) {
    refreshButton.disabled = true;
    refreshButton.classList.add("spinning");
    generatedAt.textContent = "Refreshing ledger";
  }

  try {
    const response = await fetch(
      staticMode ? assetUrl("static/invoices/index.json") : "/api/invoices",
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error(`Ledger returned ${response.status}`);
    const body = await response.json();
    if (requestId !== loadRequestId) return;
    invoices = body.invoices.map(normalizeInvoice);
    generatedAt.textContent = staticMode
      ? `Static snapshot · ${formatDateTime(body.generatedAt)}`
      : `Ledger live · ${formatClock(body.generatedAt)}`;
    renderMetrics();

    if (!selectedId || !invoices.some(invoice => invoice.id === selectedId)) {
      const requestedId = new URLSearchParams(location.search).get("invoice");
      const requested = invoices.find(invoice => invoice.id === requestedId);
      const latestAccepted = [...invoices]
        .filter(invoice => invoice.settlement?.outcome === "accepted")
        .sort((a, b) => timeValue(b.settlement.verifiedAt) - timeValue(a.settlement.verifiedAt))[0];
      selectedId = requested?.id ?? latestAccepted?.id ?? invoices[0]?.id ?? null;
    }

    renderRows();
    await renderSnapshot();
    if (requestId !== loadRequestId) return;
    if (selectedId) await showDetail(selectedId, false, false);
  } catch (error) {
    if (requestId !== loadRequestId) return;
    generatedAt.textContent = silent ? "Auto-refresh failed" : "Ledger unavailable";
    if (!silent) {
      rows.innerHTML = `<tr><td colspan="6" class="no-data">${escape(error.message)}</td></tr>`;
      detail.innerHTML = `<div class="empty-detail"><span class="empty-index">Error</span><h3>Ledger unavailable</h3><p>${escape(error.message)}</p></div>`;
    }
  } finally {
    loadInFlight = false;
    if (!silent && requestId === loadRequestId) {
      refreshButton.disabled = false;
      refreshButton.classList.remove("spinning");
    }
  }
}

function normalizeInvoice(invoice) {
  return {
    ...invoice,
    orderId: invoice.orderId ?? invoice.id,
    paymentId: invoice.paymentId ?? null,
    offerHash: invoice.offerHash ?? null,
    issuerKey: invoice.issuerKey ?? invoice.offerAttestation?.publicKey ?? null,
    settlement: invoice.settlement ?? null,
  };
}

function renderMetrics() {
  const paid = invoices.filter(invoice => invoice.status === "paid");
  const proofed = paid.filter(invoice => invoice.settlement?.proofHash);
  const volume = paid.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const attention = invoices.filter(needsAttention).length;

  animateMetric("metric-total", invoices.length, value => String(Math.round(value)));
  animateMetric("metric-volume", volume, value => `${formatAmount(value)} SOL`);
  animateMetric(
    "metric-proof",
    proofed.length,
    value => `${Math.round(value)} / ${paid.length}`,
  );
  animateMetric(
    "metric-pending",
    invoices.filter(invoice => invoice.status === "pending").length,
    value => String(Math.round(value)),
  );
  animateMetric("metric-attention", attention, value => String(Math.round(value)));
}

function filteredInvoices() {
  const filtered = invoices.filter(invoice => {
    if (activeFilter === "attention" && !needsAttention(invoice)) return false;
    if (activeFilter !== "all" && activeFilter !== "attention" && invoice.status !== activeFilter) {
      return false;
    }
    if (clusterFilter !== "all" && invoice.cluster !== clusterFilter) return false;
    if (!searchQuery) return true;
    const haystack = [
      invoice.id,
      invoice.orderId,
      invoice.paymentId,
      invoice.signature,
      invoice.offerHash,
      invoice.settlement?.proofHash,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(searchQuery);
  });

  return filtered.sort((a, b) => {
    if (sortOrder === "oldest") return timeValue(a.createdAt) - timeValue(b.createdAt);
    if (sortOrder === "amount") return Number(b.amount) - Number(a.amount);
    return timeValue(b.createdAt) - timeValue(a.createdAt);
  });
}

function renderRows() {
  const filtered = filteredInvoices();
  setText("result-count", `${filtered.length} ${filtered.length === 1 ? "record" : "records"}`);

  if (!filtered.length) {
    rows.innerHTML = `<tr><td colspan="6" class="no-data">No invoices match the current filters.</td></tr>`;
    return;
  }

  rows.replaceChildren(
    ...filtered.map(invoice => {
      const tr = document.createElement("tr");
      tr.dataset.invoiceId = invoice.id;
      if (invoice.id === selectedId) tr.classList.add("selected");
      tr.addEventListener("click", () => {
        void inspectInvoice(invoice.id);
      });

      const proof = evidenceLevel(invoice);
      tr.innerHTML = `
        <td class="order-cell">
          <button class="order-button" type="button" ${
            invoice.id === selectedId ? 'aria-current="true"' : ""
          }>
            <strong>${escape(invoice.orderId)}</strong>
            <span class="mono">${escape(short(invoice.id, 15))}</span>
          </button>
        </td>
        <td><span class="badge ${statusClass(invoice)}">${escape(displayStatus(invoice))}</span></td>
        <td><strong>${escape(formatAmount(invoice.amount))} ${escape(invoice.assetSymbol)}</strong></td>
        <td>
          <strong>${escape(networkLabel(invoice.cluster))}</strong>
          <div class="row-sub">${escape(invoice.cluster)}</div>
        </td>
        <td class="evidence-cell" data-level="${proof.level}">
          <strong>${escape(proof.label)}</strong>
          <span class="mono">${escape(proof.value)}</span>
        </td>
        <td>
          <strong>${escape(formatDate(updatedAt(invoice)))}</strong>
          <div class="row-sub">${escape(formatClock(updatedAt(invoice)))}</div>
        </td>`;
      tr.querySelector(".order-button").addEventListener("click", event => {
        event.stopPropagation();
        void inspectInvoice(invoice.id);
      });
      return tr;
    }),
  );
}

async function renderSnapshot() {
  const invoice = [...invoices]
    .filter(item => item.settlement?.outcome === "accepted")
    .sort((a, b) => timeValue(b.settlement.verifiedAt) - timeValue(a.settlement.verifiedAt))[0];

  if (!invoice) {
    const stamp = document.querySelector("#snapshot-score");
    stamp.dataset.state = "pending";
    stamp.innerHTML = "<span>Proof</span><strong>--</strong><small>no receipt</small>";
    setText("snapshot-order", "No accepted proof");
    setText("snapshot-amount", "--");
    setText("snapshot-hash", "--");
    setText("snapshot-witness", "--");
    setText("snapshot-time", "--");
    return;
  }

  const proofBody = await fetchProof(invoice);
  const verification = proofBody?.verification;
  const checks = verification
    ? [
        verification.schemaValid,
        verification.offerHashValid,
        verification.offerAttestationValid,
        verification.settlementHashValid,
        verification.settlementAttestationValid,
        verification.linkageValid,
      ]
    : [];
  const validChecks = checks.filter(Boolean).length;
  const totalChecks = checks.filter(check => check !== null).length;
  const stamp = document.querySelector("#snapshot-score");
  stamp.dataset.state = verification?.valid ? "valid" : "invalid";
  stamp.innerHTML = `
    <span>Proof</span>
    <strong>${verification ? `${validChecks}/${totalChecks}` : "--"}</strong>
    <small>${verification?.valid ? "verified" : "unverified"}</small>`;

  setText("snapshot-order", invoice.orderId);
  setText("snapshot-amount", `${formatAmount(invoice.amount)} ${invoice.assetSymbol}`);
  setText("snapshot-network", networkLabel(invoice.cluster));
  setText("snapshot-hash", short(invoice.settlement.proofHash, 28));
  setText("snapshot-witness", witnessText(invoice));
  setText("snapshot-time", formatDateTime(invoice.settlement.verifiedAt));
}

async function showDetail(id, updateUrl = true, resetTab = true) {
  const requestId = ++detailRequestId;
  selectedId = id;
  if (resetTab) activeTab = "summary";
  selectedProof = null;
  renderRows();
  detail.setAttribute("aria-busy", "true");
  detail.innerHTML = `<div class="detail-loading">Loading evidence</div>`;

  const invoice = invoices.find(item => item.id === id);
  if (!invoice) {
    detail.setAttribute("aria-busy", "false");
    return;
  }
  const proofBody = await fetchProof(invoice);
  if (requestId !== detailRequestId || selectedId !== id) return;
  selectedProof = proofBody;
  renderDetail();
  detail.setAttribute("aria-busy", "false");

  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set("invoice", id);
    history.replaceState({}, "", url);
  }
}

async function inspectInvoice(id) {
  await showDetail(id);
  if (window.matchMedia("(max-width: 860px)").matches) {
    detail.scrollIntoView({
      behavior: motionQuery.matches ? "auto" : "smooth",
      block: "start",
    });
  }
}

async function fetchProof(invoice) {
  if (!invoice?.paymentId || !invoice?.offerHash) return null;
  try {
    const proofPath = staticMode
      ? assetUrl(`static/proof/${encodeURIComponent(invoice.id)}.json`)
      : `/api/proof/${encodeURIComponent(invoice.id)}`;
    const response = await fetch(proofPath, { cache: "no-store" });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function renderDetail() {
  const invoice = invoices.find(item => item.id === selectedId);
  if (!invoice) return;

  detail.innerHTML = `
    <header class="detail-head">
      <div class="detail-head-top">
        <div>
          <p class="eyebrow">Invoice evidence</p>
          <h2>${escape(invoice.orderId)}</h2>
        </div>
        <span class="badge ${statusClass(invoice)}">${escape(displayStatus(invoice))}</span>
      </div>
      <div class="detail-amount">${escape(formatAmount(invoice.amount))} ${escape(invoice.assetSymbol)}</div>
      <div class="detail-actions">
        ${copyAction("Copy ID", invoice.id)}
        ${invoice.paymentId ? copyAction("Copy payment ID", invoice.paymentId) : ""}
        ${selectedProof ? `<button class="text-button" type="button" data-export-proof>Export proof JSON</button>` : ""}
      </div>
    </header>
    <div class="detail-tabs" role="tablist" aria-label="Evidence views">
      ${detailTab("summary", "Summary")}
      ${detailTab("proof", "Proof")}
      ${detailTab("witnesses", "Witnesses")}
      ${detailTab("raw", "Raw")}
    </div>
    <div id="detail-panel" class="detail-body" role="tabpanel" tabindex="0" aria-labelledby="detail-tab-${activeTab}">
      ${renderActiveDetail(invoice)}
    </div>`;
  initializeGlowBorders(detail);
}

function renderActiveDetail(invoice) {
  if (activeTab === "proof") return renderProofView(invoice);
  if (activeTab === "witnesses") return renderWitnessView(invoice);
  if (activeTab === "raw") return renderRawView(invoice);
  return renderSummaryView(invoice);
}

function renderSummaryView(invoice) {
  const verification = selectedProof?.verification;
  const hasSettlement = Boolean(selectedProof?.proof?.settlement);
  const settlementVerified = Boolean(hasSettlement && verification?.valid);
  const offerVerified = Boolean(
    verification?.offerHashValid && verification?.offerAttestationValid,
  );
  const state = settlementVerified || offerVerified ? "valid" : verification ? "invalid" : "pending";
  const label = settlementVerified
    ? "VALID"
    : offerVerified
      ? "OFFER"
      : verification
        ? "INVALID"
        : invoice.status.toUpperCase();
  const sublabel = settlementVerified
    ? "settlement proof"
    : offerVerified
      ? "terms attested"
      : "proof unavailable";
  const quorum = invoice.settlement?.witnessQuorum;

  return `
    <div class="detail-view">
      <div class="detail-summary">
        ${integrityStamp(state, label, sublabel)}
        <div class="detail-summary-copy">
          <h3>${
            settlementVerified
              ? "Portable settlement verified"
              : offerVerified
                ? "Payment terms verified"
                : "Invoice state recorded"
          }</h3>
          <p>${escape(invoice.paymentId ?? "Legacy record without payment ID")}</p>
          <p>${escape(invoice.settlement?.proofHash ?? invoice.offerHash ?? "No proof hash")}</p>
        </div>
      </div>

      <ol class="evidence-flow">
        ${flowStep("01", "Offer created", invoice.createdAt, true)}
        ${flowStep("02", "Offer attested", invoice.offerHash, Boolean(invoice.offerHash))}
        ${flowStep("03", "Settlement observed", invoice.signature, Boolean(invoice.signature))}
        ${flowStep("04", "Witness quorum", quorum ? witnessText(invoice) : "No settlement witnesses", Boolean(quorum?.agreed))}
        ${flowStep(
          "05",
          "Settlement proof portable",
          settlementVerified ? "All settlement integrity checks passed" : "Awaiting settlement",
          settlementVerified,
        )}
      </ol>

      <section class="detail-section">
        <h3 class="detail-section-title">Offer terms</h3>
        <dl class="kv">
          ${kv("Recipient", invoice.recipient)}
          ${kv("Reference", invoice.reference)}
          ${kv("Cluster", invoice.cluster)}
          ${kv("Expires", invoice.expiresAt ? formatDateTime(invoice.expiresAt) : "Legacy record")}
          ${kv("Offer hash", invoice.offerHash ?? "Not available")}
          ${kv("Issuer key", invoice.issuerKey ?? "Not available")}
        </dl>
      </section>

      ${invoice.status === "pending" ? renderQr(invoice) : ""}
      ${renderAnomalies(invoice)}
    </div>`;
}

function renderProofView(invoice) {
  if (!selectedProof) {
    return `<div class="detail-view"><div class="no-data">This legacy invoice does not contain a complete proof bundle.</div></div>`;
  }

  const verification = selectedProof.verification;
  const settlement = selectedProof.proof.settlement;
  return `
    <div class="detail-view">
      <section class="detail-section">
        <h3 class="detail-section-title">Bundle identity</h3>
        <dl class="kv">
          ${kv("Version", selectedProof.proof.version)}
          ${kv("Offer hash", selectedProof.proof.offerHash)}
          ${kv("Proof hash", settlement?.proofHash ?? "Awaiting settlement")}
          ${kv("Algorithm", selectedProof.proof.offerAttestation.algorithm)}
          ${kv("Issuer key", selectedProof.proof.offerAttestation.publicKey)}
        </dl>
      </section>
      <section class="detail-section">
        <h3 class="detail-section-title">Offline integrity checks</h3>
        <div class="verification-list">
          ${verificationItem("Bundle schema and versions", verification.schemaValid)}
          ${verificationItem("Canonical offer hash", verification.offerHashValid)}
          ${verificationItem("Offer issuer attestation", verification.offerAttestationValid)}
          ${
            settlement
              ? verificationItem("Settlement proof hash", verification.settlementHashValid)
              : verificationPendingItem("Settlement proof hash")
          }
          ${
            settlement
              ? verificationItem(
                  "Settlement issuer attestation",
                  verification.settlementAttestationValid,
                )
              : verificationPendingItem("Settlement issuer attestation")
          }
          ${
            settlement
              ? verificationItem(
                  "Offer and settlement linkage",
                  verification.linkageValid,
                )
              : verificationPendingItem("Offer and settlement linkage")
          }
        </div>
      </section>
      ${renderAnomalies(invoice)}
    </div>`;
}

function renderWitnessView(invoice) {
  const witnesses = invoice.settlement?.witnesses ?? [];
  if (!witnesses.length) {
    return `<div class="detail-view"><div class="no-data">No settlement witnesses are attached to this invoice.</div>${renderAnomalies(invoice)}</div>`;
  }

  return `
    <div class="detail-view">
      <div class="witness-list">
        ${witnesses.map(witness => `
          <article class="witness">
            <header class="witness-head">
              <h4>${escape(witness.name)}</h4>
              <span>${witness.transactionSucceeded ? "TRANSACTION VALID" : "TRANSACTION FAILED"}</span>
            </header>
            <div class="witness-data">
              <p>slot ${escape(witness.slot)} · ${escape(formatDateTime(witness.blockTime))}</p>
              <p>${escape(witness.rpcUrl)}</p>
              <p>digest ${escape(witness.transactionDigest)}</p>
            </div>
            <div class="check-grid">
              ${witnessCheck("Reference", witness.referencePresent)}
              ${witnessCheck("Recipient", witness.recipientPresent)}
              ${witnessCheck("Mint", witness.mintMatches)}
              ${witnessCheck("Memo", witness.memoMatches)}
              ${witnessCheck("Execution", witness.transactionSucceeded)}
              ${witnessCheck("Amount", witness.observedAmount === invoice.amount)}
            </div>
          </article>`).join("")}
      </div>
      ${renderAnomalies(invoice)}
    </div>`;
}

function renderRawView(invoice) {
  const body = selectedProof ?? { invoice, note: "Legacy record without a complete proof bundle." };
  return `
    <div class="detail-view">
      <div class="detail-actions">
        ${copyAction("Copy raw JSON", JSON.stringify(body, null, 2))}
      </div>
      <pre class="raw-proof">${escape(JSON.stringify(body, null, 2))}</pre>
    </div>`;
}

function renderQr(invoice) {
  if (!invoice.qrPath) return "";
  return `
    <div class="qr-wrap">
      <img src="${escapeAttribute(assetUrl(`qr/${encodeURIComponent(invoice.qrPath)}`))}" alt="Solana Pay invoice QR code" />
      <div>
        <h4>Unsigned payment request</h4>
        <p>The wallet previews and signs. The agent has no private key and cannot move funds.</p>
      </div>
    </div>`;
}

function renderAnomalies(invoice) {
  const anomalies = invoice.settlement?.anomalies ?? [];
  return `
    <section class="detail-section">
      <h3 class="detail-section-title">Exceptions</h3>
      ${anomalies.length
        ? `<div class="anomalies">${anomalies.map(item => `<span class="anomaly">${escape(item)}</span>`).join("")}</div>`
        : `<span class="proof-ok">None</span>`}
    </section>`;
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

function evidenceLevel(invoice) {
  if (invoice.settlement?.proofHash) {
    return {
      level: "bundle",
      label: "Proof bundled",
      value: short(invoice.settlement.proofHash, 18),
    };
  }
  if (invoice.offerHash) {
    return {
      level: "offer",
      label: "Offer attested",
      value: short(invoice.offerHash, 18),
    };
  }
  return {
    level: "legacy",
    label: "Legacy record",
    value: invoice.signature ? short(invoice.signature, 18) : "No portable proof",
  };
}

function witnessText(invoice) {
  const quorum = invoice.settlement?.witnessQuorum;
  if (!quorum) return "No settlement";
  return `${quorum.valid}/${quorum.required} valid · ${quorum.agreed ? "agreed" : "disputed"}`;
}

function networkLabel(cluster) {
  if (cluster === "localnet") return "Agave local";
  if (cluster === "mainnet-beta") return "Solana mainnet";
  return "Solana devnet";
}

function updatedAt(invoice) {
  return invoice.settlement?.verifiedAt ?? invoice.paidAt ?? invoice.createdAt;
}

function detailTab(id, label) {
  const active = activeTab === id;
  return `<button id="detail-tab-${id}" class="detail-tab ${active ? "active" : ""}" type="button" role="tab" tabindex="${active ? "0" : "-1"}" aria-selected="${active}" aria-controls="detail-panel" data-detail-tab="${id}">${label}</button>`;
}

function integrityStamp(state, label, sublabel) {
  return `
    <div class="integrity-stamp" data-state="${state}">
      <span>Proof</span>
      <strong>${escape(label)}</strong>
      <small>${escape(sublabel)}</small>
    </div>`;
}

function flowStep(index, label, value, complete) {
  return `
    <li>
      <span class="flow-index">${index}</span>
      <div>
        <strong>${escape(label)}</strong>
        <small>${escape(value ? short(String(value), 34) : "Not available")}</small>
      </div>
      <span class="flow-state ${complete ? "ok" : "warn"}">${complete ? "complete" : "open"}</span>
    </li>`;
}

function kv(label, value) {
  return `<div><dt>${escape(label)}</dt><dd>${escape(value ?? "Not available")}</dd></div>`;
}

function verificationItem(label, valid) {
  return `<div class="verification-item ${valid ? "" : "bad"}"><span>${escape(label)}</span><strong>${valid ? "VALID" : "INVALID"}</strong></div>`;
}

function verificationPendingItem(label) {
  return `<div class="verification-item pending"><span>${escape(label)}</span><strong>AWAITING SETTLEMENT</strong></div>`;
}

function witnessCheck(label, valid) {
  return `<span class="${valid ? "ok" : ""}">${valid ? "✓" : "×"} ${escape(label)}</span>`;
}

function copyAction(label, value) {
  return `<button class="text-button" type="button" data-copy="${escapeAttribute(value)}">${escape(label)}</button>`;
}

async function copyText(value, button) {
  try {
    await navigator.clipboard.writeText(value);
    const original = button.textContent;
    button.textContent = "Copied";
    window.setTimeout(() => {
      button.textContent = original;
    }, 900);
  } catch {
    button.textContent = "Copy failed";
  }
}

function exportProof(body, id) {
  const blob = new Blob([`${JSON.stringify(body, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `proof-${id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatAmount(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 9,
  }).format(Number(value ?? 0));
}

function formatDate(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    year: "2-digit",
  }).format(new Date(value));
}

function formatClock(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function timeValue(value) {
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function setText(id, value) {
  const element = document.querySelector(`#${id}`);
  if (element) element.textContent = String(value);
}

function assetUrl(pathname) {
  return new URL(pathname.replace(/^\/+/, ""), document.baseURI).toString();
}

function setMenuOpen(open, returnFocus = false) {
  const wasOpen = siteHeader.classList.contains("menu-open");
  siteHeader.classList.toggle("menu-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  menuToggle.title = open ? "Close navigation" : "Open navigation";
  if (returnFocus && wasOpen && !open) menuToggle.focus();
}

function scheduleAutoRefresh() {
  if (autoRefreshTimer !== null) {
    window.clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
  if (staticMode || !autoRefreshInput.checked || document.hidden) return;
  autoRefreshTimer = window.setInterval(() => {
    void load({ silent: true });
  }, 30_000);
}

function readPreference(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePreference(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The console remains functional when storage is unavailable.
  }
}

function initializeMotion() {
  initializePageProgress();
  initializeSectionNavigation();
  initializeRunwayContent();
  initializeRunwayVisibility();
  initializeDecryptText();
  initializeStarField();
  initializeSpotlight();
  initializeGlowBorders(document);
  initializeMagneticButtons();
  initializeSpotlightCards();
  initializeReveal();
  initializeRailSteps();
}

function initializeRunwayContent() {
  const runway = document.querySelector(".evidence-runway");
  if (!runway) return;
  runway.querySelectorAll(".runway-track").forEach(track => {
    const group = track.querySelector(".runway-group");
    if (!group || track.children.length > 1) return;
    track.append(group.cloneNode(true));
  });
  runway.classList.add("runway-ready");
}

function initializeSectionNavigation() {
  const links = [...document.querySelectorAll("[data-section-link]")];
  const sections = links
    .map(link => document.querySelector(`#${link.dataset.sectionLink}`))
    .filter(Boolean);
  if (!sections.length || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      links.forEach(link => {
        const active = link.dataset.sectionLink === visible.target.id;
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
    },
    { rootMargin: "-20% 0px -65% 0px", threshold: [0, 0.1, 0.5] },
  );
  sections.forEach(section => observer.observe(section));
}

function initializePageProgress() {
  let scheduled = false;
  const update = () => {
    const root = document.documentElement;
    const available = Math.max(1, root.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, window.scrollY / available));
    root.style.setProperty("--page-progress", String(progress));
    scheduled = false;
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(update);
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  update();
}

function initializeDecryptText() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789#%+";
  document.querySelectorAll("[data-decrypt-text]").forEach((element, elementIndex) => {
    const target = element.dataset.decryptText ?? element.textContent ?? "";
    if (motionQuery.matches) {
      element.textContent = target;
      return;
    }

    let frame = 0;
    const totalFrames = target.length * 2 + 20;
    window.setTimeout(() => {
      const timer = window.setInterval(() => {
        const rendered = [...target]
          .map((character, index) => {
            if (character === " ") return " ";
            if (index < Math.floor(frame / 2)) return character;
            return characters[Math.floor(Math.random() * characters.length)];
          })
          .join("");
        element.textContent = rendered;
        element.setAttribute("aria-label", target);
        frame += 1;
        if (frame > totalFrames) {
          window.clearInterval(timer);
          element.textContent = target;
        }
      }, 34);
    }, elementIndex * 180);
  });
}

function initializeStarField() {
  const canvas = document.querySelector(".star-field");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  let width = 0;
  let height = 0;
  let stars = [];
  let pointerX = 0.5;
  let pointerY = 0.5;
  let animationFrame = null;
  let sectionVisible = true;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    context.setTransform(scale, 0, 0, scale, 0, 0);
    const count = Math.min(110, Math.max(44, Math.floor(width / 12)));
    stars = Array.from({ length: count }, (_, index) => ({
      x: pseudoRandom(index * 3 + 1) * width,
      y: pseudoRandom(index * 3 + 2) * height,
      radius: 0.35 + pseudoRandom(index * 3 + 3) * 1.15,
      speed: 0.035 + pseudoRandom(index * 5 + 4) * 0.085,
      alpha: 0.18 + pseudoRandom(index * 5 + 5) * 0.5,
    }));
  };

  const draw = time => {
    animationFrame = null;
    context.clearRect(0, 0, width, height);
    stars.forEach((star, index) => {
      const drift = motionQuery.matches ? 0 : time * star.speed * 0.002;
      const x = (star.x + drift + pointerX * (index % 5)) % width;
      const y = (star.y + Math.sin(time * 0.00025 + index) * 2 + pointerY) % height;
      context.beginPath();
      context.fillStyle = `rgba(40, 100, 220, ${star.alpha})`;
      context.arc(x, y, star.radius, 0, Math.PI * 2);
      context.fill();
    });
    if (!motionQuery.matches && sectionVisible && !document.hidden) {
      animationFrame = window.requestAnimationFrame(draw);
    }
  };

  const scheduleDraw = () => {
    if (animationFrame !== null) return;
    animationFrame = window.requestAnimationFrame(draw);
  };

  const section = canvas.closest(".overview-band");
  section?.addEventListener("pointermove", event => {
    const rect = section.getBoundingClientRect();
    pointerX = (event.clientX - rect.left) / rect.width;
    pointerY = (event.clientY - rect.top) / rect.height;
  });
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && sectionVisible) scheduleDraw();
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      entries => {
        sectionVisible = Boolean(entries[0]?.isIntersecting);
        if (sectionVisible && !document.hidden) scheduleDraw();
      },
      { rootMargin: "120px" },
    ).observe(section);
  }
  resize();
  draw(0);
}

function initializeRunwayVisibility() {
  const runway = document.querySelector(".evidence-runway");
  if (!runway) return;
  let visible = true;
  const update = () => {
    runway.classList.toggle("motion-paused", document.hidden || !visible);
  };
  document.addEventListener("visibilitychange", update);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      entries => {
        visible = Boolean(entries[0]?.isIntersecting);
        update();
      },
      { rootMargin: "100px" },
    ).observe(runway);
  }
  update();
}

function pseudoRandom(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function initializeSpotlight() {
  const section = document.querySelector(".overview-band");
  if (!section) return;
  section.addEventListener("pointermove", event => {
    const rect = section.getBoundingClientRect();
    section.style.setProperty("--spotlight-x", `${event.clientX - rect.left}px`);
    section.style.setProperty("--spotlight-y", `${event.clientY - rect.top}px`);
  });
}

function initializeGlowBorders(root) {
  root.querySelectorAll?.(".glow-border").forEach(element => {
    if (element.dataset.glowReady) return;
    element.dataset.glowReady = "true";
    element.addEventListener("pointermove", event => {
      const rect = element.getBoundingClientRect();
      element.style.setProperty("--glow-x", `${event.clientX - rect.left}px`);
      element.style.setProperty("--glow-y", `${event.clientY - rect.top}px`);
    });
  });
}

function initializeMagneticButtons() {
  document.querySelectorAll(".magnetic-button").forEach(button => {
    button.addEventListener("pointermove", event => {
      if (motionQuery.matches) return;
      const rect = button.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      button.style.transform = `translate(${x * 0.16}px, ${y * 0.16}px)`;
    });
    button.addEventListener("pointerleave", () => {
      button.style.transform = "";
    });
  });
}

function initializeSpotlightCards() {
  document.querySelectorAll(".spotlight-card").forEach(card => {
    card.addEventListener("pointermove", event => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--card-x", `${event.clientX - rect.left}px`);
      card.style.setProperty("--card-y", `${event.clientY - rect.top}px`);
    });
  });
}

function initializeReveal() {
  const targets = document.querySelectorAll(".reveal-on-scroll");
  if (motionQuery.matches || !("IntersectionObserver" in window)) {
    targets.forEach(target => target.classList.add("revealed"));
    return;
  }

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("revealed");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12 },
  );
  targets.forEach(target => observer.observe(target));
}

function initializeRailSteps() {
  if (motionQuery.matches) {
    document.querySelectorAll(".rail-step").forEach(step => step.classList.add("active"));
    return;
  }
  document.querySelectorAll(".rail-step").forEach((step, index) => {
    window.setTimeout(() => step.classList.add("active"), 900 + index * 230);
  });
}

function animateMetric(id, target, formatter) {
  const element = document.querySelector(`#${id}`);
  if (!element) return;
  const start = Number(element.dataset.countValue || 0);
  element.dataset.countValue = String(target);
  if (motionQuery.matches) {
    element.textContent = formatter(target);
    return;
  }

  const startTime = performance.now();
  const duration = 650;
  const tick = now => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = formatter(start + (target - start) * eased);
    if (progress < 1) window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}

function short(value, length = 12) {
  if (!value || value.length <= length) return value ?? "";
  const left = Math.ceil((length - 1) * 0.62);
  const right = Math.floor((length - 1) * 0.38);
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

function escape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escape(value).replaceAll("\n", "&#10;");
}
