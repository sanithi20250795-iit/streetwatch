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
    await loadConfirmations(report);
    await loadComments(report.id);
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

function confirmCopy(report) {
  return report.status === "resolved"
    ? { prompt: "Can you confirm this was actually fixed?", verb: "Confirm it's fixed", noun: "confirmed this was fixed" }
    : { prompt: "Still seeing this hazard?", verb: "Confirm it's still there", noun: "confirmed this issue" };
}

async function loadConfirmations(report) {
  const wrap = document.getElementById("confirm-wrap");
  if (!wrap) return;

  const res = await fetch(`/api/reports/${report.id}/confirmations`, withAuthHeader());
  const data = res.ok
    ? await res.json()
    : { count: 0, user_confirmed: false, reliability_label: "Unverified", reliability_score: 0 };
  const copy = confirmCopy(report);

  wrap.innerHTML = `
    <p class="confirm-count">
      👍 ${data.count} ${data.count === 1 ? "person has" : "people have"} ${copy.noun}
      <span class="reliability-badge reliability-${data.reliability_score}">${data.reliability_label}</span>
    </p>
    <p class="confirm-prompt">${copy.prompt}</p>
    <button id="confirm-btn" class="btn-ghost-small ${data.user_confirmed ? "confirm-active" : ""}" type="button">
      ${data.user_confirmed ? "✓ You confirmed this" : copy.verb}
    </button>
  `;

  document.getElementById("confirm-btn").addEventListener("click", async () => {
    if (!isLoggedIn()) {
      window.location.href = `/login?next=/track?id=${report.id}`;
      return;
    }
    const res = await fetch(`/api/reports/${report.id}/confirm`, withAuthHeader({ method: "POST" }));
    if (!res.ok) return;
    await loadConfirmations(report);
  });
}

async function loadComments(reportId) {
  const list = document.getElementById("comments-list");
  if (!list) return;

  const res = await fetch(`/api/reports/${reportId}/comments`);
  const comments = res.ok ? await res.json() : [];

  list.innerHTML =
    comments.length === 0
      ? `<p class="empty-state">No comments yet.</p>`
      : comments
          .map(
            (c) => `
        <div class="comment-row">
          <p class="comment-meta"><strong>${escapeHtml(c.commenter_name)}</strong> · ${formatDate(c.created_at)}</p>
          <p class="comment-text">${escapeHtml(c.comment)}</p>
        </div>
      `
          )
          .join("");

  const form = document.getElementById("comment-form");
  if (!form) return;

  if (!isLoggedIn()) {
    form.innerHTML = `<p class="empty-state"><a href="/login?next=/track?id=${reportId}">Log in</a> to leave a comment.</p>`;
    return;
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById("comment-input");
    const text = input.value.trim();
    if (!text) return;

    const res = await fetch(
      `/api/reports/${reportId}/comments`,
      withAuthHeader({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: text }),
      })
    );
    if (!res.ok) {
      alert("Couldn't post your comment — try again.");
      return;
    }
    input.value = "";
    await loadComments(reportId);
  };
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