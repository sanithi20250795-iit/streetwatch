// ---------------------------------------------------------------
// Track-by-ID page logic.
// Depends on auth.js being loaded first (STATUS_LABELS, HAZARD_LABELS,
// SEVERITY_LABELS, colorForStatus, formatReportId, formatDate,
// escapeHtml, initAuthNav).
// ---------------------------------------------------------------

// Fixed lifecycle order — this is the sequence the timeline is drawn in,
// regardless of what order history rows happen to be in.
const LIFECYCLE_ORDER = ["reported", "verified", "in_progress", "resolved"];

/** Pulls digits out of whatever the person typed — "HZ1024", "#HZ1024",
 * or a bare "1024" all resolve to the same numeric ID. */
function parseReportId(input) {
  const digits = input.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : null;
}

async function trackReport(id) {
  const resultEl = document.getElementById("track-result");
  resultEl.innerHTML = `<p class="empty-state">Looking up report…</p>`;

  try {
    const reportRes = await fetch(`/api/reports/${id}`);
    if (reportRes.status === 404) {
      resultEl.innerHTML = `<p class="empty-state">No report found with that ID. Double-check the number and try again.</p>`;
      return;
    }
    if (!reportRes.ok) throw new Error("Request failed");
    const report = await reportRes.json();

    const historyRes = await fetch(`/api/reports/${id}/history`);
    const history = historyRes.ok ? await historyRes.json() : [];

    renderTimeline(report, history);
  } catch (err) {
    resultEl.innerHTML = `<p class="empty-state">Something went wrong — please try again.</p>`;
    console.error(err);
  }
}

function renderTimeline(report, history) {
  const resultEl = document.getElementById("track-result");

  // Earliest time each status was reached, keyed by status.
  const reachedAt = {};
  history.forEach((h) => {
    if (!reachedAt[h.status]) reachedAt[h.status] = h.changed_at;
  });

  const stepsHtml = LIFECYCLE_ORDER.map((stage) => {
    const reached = reachedAt[stage];
    const dotColor = reached ? colorForStatus(stage) : "#d9d6cd";
    const dateText = reached ? formatDate(reached) : "Pending";
    return `
      <div class="track-step ${reached ? "reached" : "pending"}">
        <span class="track-dot" style="background:${dotColor}"></span>
        <span class="track-step-label">${STATUS_LABELS[stage]}</span>
        <span class="track-step-date">${dateText}</span>
      </div>
    `;
  }).join("");

  const media = report.media_url && /\.(jpg|jpeg|png|gif|webp)$/i.test(report.media_url)
    ? `<img src="${report.media_url}" alt="Attached photo" class="track-media" />`
    : "";

  resultEl.innerHTML = `
    <div class="track-card">
      <p class="track-report-id">#${formatReportId(report.id)}</p>
      <h3 class="track-title">${escapeHtml(report.title)}</h3>
      <p class="track-meta">${HAZARD_LABELS[report.hazard_type]} · ${SEVERITY_LABELS[report.severity]}</p>
      <p class="track-desc">${escapeHtml(report.description)}</p>
      ${media}
      <div class="track-timeline">${stepsHtml}</div>
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  initAuthNav();

  const form = document.getElementById("track-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("track-input").value.trim();
    const id = parseReportId(input);
    if (!id) {
      document.getElementById("track-result").innerHTML =
        `<p class="empty-state">Enter a valid Report ID, e.g. HZ1024.</p>`;
      return;
    }
    trackReport(id);
  });

  // Support deep-linking from a map popup: /track?id=1024
  const params = new URLSearchParams(window.location.search);
  const prefilledId = params.get("id");
  if (prefilledId) {
    document.getElementById("track-input").value = formatReportId(prefilledId);
    trackReport(prefilledId);
  }
});