// ---------------------------------------------------------------
// My Reports dashboard logic.
// Depends on auth.js being loaded first (STATUS_LABELS, HAZARD_LABELS,
// SEVERITY_LABELS, formatReportId, formatDate, escapeHtml, isLoggedIn,
// withAuthHeader, initAuthNav).
//
// "Updated" indicator: since we agreed real push/email notifications are
// out of scope for now, this uses a simple in-app approach — each report's
// updated_at is compared against a per-report "last seen" timestamp kept
// in localStorage. If the report changed since the user last looked at
// this dashboard, it's flagged as updated.
// ---------------------------------------------------------------

const SEEN_KEY_PREFIX = "streetwatch_seen_report_";

function getLastSeen(reportId) {
  return localStorage.getItem(SEEN_KEY_PREFIX + reportId);
}

function markSeen(reportId, updatedAt) {
  localStorage.setItem(SEEN_KEY_PREFIX + reportId, updatedAt);
}

function hasUnseenUpdate(report) {
  const lastSeen = getLastSeen(report.id);
  if (!lastSeen) return true; // never viewed before
  return new Date(report.updated_at) > new Date(lastSeen);
}

let myReports = [];

async function loadMyReports() {
  const list = document.getElementById("my-reports-list");

  const res = await fetch("/api/reports/mine", withAuthHeader());
  if (res.status === 401) {
    window.location.href = "/login?next=/my-reports";
    return;
  }
  if (!res.ok) {
    list.innerHTML = `<li class="empty-state">Couldn't load your reports — try again.</li>`;
    return;
  }
  myReports = await res.json();

  if (myReports.length === 0) {
    list.innerHTML = `<li class="empty-state">You haven't filed any reports yet — <a href="/map">go report one</a>.</li>`;
    return;
  }

  // For resolved reports, check whether feedback has already been left,
  // so we can swap the button to "Feedback submitted" instead of re-asking.
  const feedbackChecks = await Promise.all(
    myReports.map(async (r) => {
      if (r.status !== "resolved") return [r.id, null];
      const fRes = await fetch(`/api/reports/${r.id}/feedback`);
      const feedback = fRes.ok ? await fRes.json() : null;
      return [r.id, feedback];
    })
  );
  const feedbackByReportId = Object.fromEntries(feedbackChecks);

  list.innerHTML = myReports
    .map((r) => {
      const unseen = hasUnseenUpdate(r);
      const feedback = feedbackByReportId[r.id];

      const editBtn =
        r.status === "reported"
          ? `<button class="btn-ghost-small edit-btn" data-id="${r.id}" type="button">Edit</button>`
          : "";

      const feedbackBtn =
        r.status === "resolved"
          ? feedback
            ? `<span class="feedback-done">✓ Feedback submitted</span>`
            : `<button class="btn-ghost-small feedback-btn" data-id="${r.id}" type="button">Give feedback</button>`
          : "";

      return `
        <li class="my-report-card status-${r.status}" data-id="${r.id}" data-updated="${r.updated_at}">
          <div class="report-card-top">
            <span class="report-type">${HAZARD_LABELS[r.hazard_type]}</span>
            <span class="report-id">#${formatReportId(r.id)}</span>
          </div>
          <p class="report-title">${escapeHtml(r.title)}
            ${unseen ? '<span class="badge-updated">Updated</span>' : ""}
          </p>
          <p class="report-desc">${escapeHtml(r.description)}</p>
          <p class="my-report-date">Filed ${formatDate(r.created_at)}</p>
          <div class="status-row">
            <span class="status-pill ${r.status}">${STATUS_LABELS[r.status]}</span>
            <span class="severity-pill severity-${r.severity}">${SEVERITY_LABELS[r.severity]}</span>
          </div>
          <div class="my-report-actions">
            ${editBtn}
            ${feedbackBtn}
          </div>
        </li>
      `;
    })
    .join("");

  // Clicking anywhere on a card (not its buttons) marks it seen.
  document.querySelectorAll(".my-report-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      markSeen(card.dataset.id, card.dataset.updated);
      const badge = card.querySelector(".badge-updated");
      if (badge) badge.remove();
    });
  });

  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openEditModal(btn.dataset.id));
  });

  document.querySelectorAll(".feedback-btn").forEach((btn) => {
    btn.addEventListener("click", () => openFeedbackModal(btn.dataset.id));
  });
}

// ---------- Edit modal ----------

function openEditModal(reportId) {
  const report = myReports.find((r) => String(r.id) === String(reportId));
  if (!report) return;

  const modal = document.getElementById("edit-modal");
  const form = document.getElementById("edit-form");
  form.report_id.value = report.id;
  form.hazard_type.value = report.hazard_type;
  form.title.value = report.title;
  form.description.value = report.description;
  form.severity.value = report.severity;
  form.location_address.value = report.location_address || "";
  form.contact_info.value = report.contact_info || "";
  document.getElementById("edit-error").classList.add("hidden");

  modal.classList.remove("hidden");
}

function initEditModal() {
  const modal = document.getElementById("edit-modal");
  const form = document.getElementById("edit-form");

  document.getElementById("close-edit-modal").addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const reportId = form.report_id.value;
    const payload = {
      hazard_type: form.hazard_type.value,
      title: form.title.value,
      description: form.description.value,
      severity: form.severity.value,
      location_address: form.location_address.value || null,
      contact_info: form.contact_info.value || null,
    };

    const res = await fetch(
      `/api/reports/${reportId}/edit`,
      withAuthHeader({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errEl = document.getElementById("edit-error");
      errEl.textContent = err.detail || "Couldn't save changes.";
      errEl.classList.remove("hidden");
      return;
    }

    modal.classList.add("hidden");
    await loadMyReports();
  });
}

// ---------- Feedback modal ----------

function openFeedbackModal(reportId) {
  const modal = document.getElementById("feedback-modal");
  const form = document.getElementById("feedback-form");
  form.reset();
  form.report_id.value = reportId;
  document.getElementById("feedback-error").classList.add("hidden");
  modal.classList.remove("hidden");
}

function initFeedbackModal() {
  const modal = document.getElementById("feedback-modal");
  const form = document.getElementById("feedback-form");

  document.getElementById("close-feedback-modal").addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const reportId = form.report_id.value;
    const payload = {
      rating: parseInt(form.rating.value, 10),
      comment: form.comment.value || null,
    };

    const res = await fetch(
      `/api/reports/${reportId}/feedback`,
      withAuthHeader({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errEl = document.getElementById("feedback-error");
      errEl.textContent = err.detail || "Couldn't submit feedback.";
      errEl.classList.remove("hidden");
      return;
    }

    modal.classList.add("hidden");
    await loadMyReports();
  });
}

// ---------- Bootstrap ----------

document.addEventListener("DOMContentLoaded", () => {
  if (!isLoggedIn()) {
    window.location.href = "/login?next=/my-reports";
    return;
  }
  initAuthNav();
  initEditModal();
  initFeedbackModal();
  loadMyReports();
});