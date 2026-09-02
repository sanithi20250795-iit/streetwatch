// ---------------------------------------------------------------
// Admin dashboard logic.
// Depends on auth.js being loaded first (STATUS_LABELS, HAZARD_LABELS,
// SEVERITY_LABELS, formatReportId, formatDate, escapeHtml, isLoggedIn,
// isAdmin, withAuthHeader, initAuthNav).
//
// Server-side enforcement already happens on every /api/admin/* route
// (get_current_admin returns 403 for non-admins) — the client-side check
// below just avoids showing a broken dashboard to someone who can't use
// it; it is not the actual security boundary.
// ---------------------------------------------------------------

let currentPreset = "all";
let allReports = [];

// ---------- Guard ----------

function checkAdminAccess() {
  if (!isLoggedIn() || !isAdmin()) {
    document.getElementById("admin-content").classList.add("hidden");
    document.getElementById("admin-guard").classList.remove("hidden");
    return false;
  }
  return true;
}

// ---------- Tabs ----------

function initTabs() {
  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      document.getElementById("admin-reports-tab").classList.add("hidden");
      document.getElementById("admin-users-tab").classList.add("hidden");
      document.getElementById("admin-analytics-tab").classList.add("hidden");
      document.getElementById(`admin-${tab.dataset.tab}-tab`).classList.remove("hidden");

      if (tab.dataset.tab === "users") loadUsers();
      if (tab.dataset.tab === "analytics") loadAnalytics();
    });
  });
}

// ---------- Reports tab ----------

function initPresetBar() {
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentPreset = btn.dataset.preset;
      loadReports();
    });
  });
}

function queryForPreset(preset) {
  switch (preset) {
    case "new":
      return "status=reported";
    case "high_priority":
      return "high_priority=true";
    case "unresolved":
      return "unresolved=true";
    case "resolved":
      return "status=resolved";
    default:
      return "";
  }
}

async function loadReports() {
  const tbody = document.getElementById("admin-reports-body");
  tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Loading reports…</td></tr>`;

  const query = queryForPreset(currentPreset);
  const url = query ? `/api/admin/reports?${query}` : "/api/admin/reports";

  const res = await fetch(url, withAuthHeader());
  if (res.status === 403) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Admin access required.</td></tr>`;
    return;
  }
  if (!res.ok) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Couldn't load reports.</td></tr>`;
    return;
  }

  allReports = await res.json();

  if (allReports.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No reports in this view.</td></tr>`;
    return;
  }

  tbody.innerHTML = allReports
    .map(
      (r) => `
      <tr class="admin-row" data-id="${r.id}">
        <td class="mono">#${formatReportId(r.id)}</td>
        <td>${escapeHtml(r.title)}</td>
        <td>${HAZARD_LABELS[r.hazard_type]}</td>
        <td><span class="severity-pill severity-${r.severity}">${SEVERITY_LABELS[r.severity]}</span></td>
        <td><span class="status-pill ${r.status}">${STATUS_LABELS[r.status] || r.status}</span></td>
        <td>${r.assigned_department ? escapeHtml(r.assigned_department) : "—"}</td>
        <td class="mono">${formatDate(r.created_at)}</td>
      </tr>
    `
    )
    .join("");

  document.querySelectorAll(".admin-row").forEach((row) => {
    row.addEventListener("click", () => openManageModal(row.dataset.id));
  });
}

// ---------- Manage report modal ----------

function openManageModal(reportId) {
  const report = allReports.find((r) => String(r.id) === String(reportId));
  if (!report) return;

  const modal = document.getElementById("manage-modal");
  const form = document.getElementById("manage-form");
  form.report_id.value = report.id;
  form.status.value = report.status;
  form.severity.value = report.severity;
  form.assigned_department.value = report.assigned_department || "";
  form.admin_notes.value = report.admin_notes || "";

  document.getElementById("manage-modal-title").textContent = `#${formatReportId(report.id)} — ${report.title}`;
  document.getElementById("manage-report-summary").innerHTML = `
    <p class="report-desc">${escapeHtml(report.description)}</p>
    <p class="my-report-date">${report.location_address ? escapeHtml(report.location_address) + " · " : ""}Reported ${formatDate(report.created_at)}</p>
  `;
  document.getElementById("manage-error").classList.add("hidden");

  modal.classList.remove("hidden");
}

function initManageModal() {
  const modal = document.getElementById("manage-modal");
  const form = document.getElementById("manage-form");

  document.getElementById("close-manage-modal").addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const reportId = form.report_id.value;
    const formData = new FormData(form);
    formData.delete("report_id");

    const res = await fetch(
      `/api/admin/reports/${reportId}`,
      withAuthHeader({
        method: "PATCH",
        body: formData,
        // No Content-Type header — the browser sets the multipart boundary.
      })
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errEl = document.getElementById("manage-error");
      errEl.textContent = err.detail || "Couldn't save changes.";
      errEl.classList.remove("hidden");
      return;
    }

    modal.classList.add("hidden");
    await loadReports();
  });
}

// ---------- Users tab ----------

async function loadUsers() {
  const tbody = document.getElementById("admin-users-body");
  tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Loading users…</td></tr>`;

  const res = await fetch("/api/admin/users", withAuthHeader());
  if (!res.ok) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Couldn't load users.</td></tr>`;
    return;
  }
  const users = await res.json();
  const me = getStoredUser();

  tbody.innerHTML = users
    .map(
      (u) => `
      <tr>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${u.is_admin ? "Admin" : "Citizen"}</td>
        <td><span class="status-pill ${u.is_active ? "resolved" : "reported"}">${u.is_active ? "Active" : "Deactivated"}</span></td>
        <td>
          ${
            u.id === me.id
              ? '<span class="my-report-date">(you)</span>'
              : `<button class="btn-ghost-small toggle-active-btn" data-id="${u.id}" data-active="${u.is_active}" type="button">
                   ${u.is_active ? "Deactivate" : "Activate"}
                 </button>`
          }
        </td>
      </tr>
    `
    )
    .join("");

  document.querySelectorAll(".toggle-active-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.dataset.id;
      const nowActive = btn.dataset.active === "true";
      const res = await fetch(
        `/api/admin/users/${userId}`,
        withAuthHeader({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: !nowActive }),
        })
      );
      if (!res.ok) {
        alert("Couldn't update that account.");
        return;
      }
      await loadUsers();
    });
  });
}

// ---------- Analytics tab ----------

let charts = {};

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

async function loadAnalytics() {
  const res = await fetch("/api/admin/analytics", withAuthHeader());
  if (!res.ok) return;
  const data = await res.json();

  document.getElementById("an-total").textContent = data.total;
  document.getElementById("an-resolved").textContent = data.resolved_count;
  document.getElementById("an-unresolved").textContent = data.unresolved_count;
  document.getElementById("an-avg-time").textContent = data.avg_resolution_hours !== null ? data.avg_resolution_hours : "—";
  document.getElementById("an-common-hazard").textContent = data.most_common_hazard ? HAZARD_LABELS[data.most_common_hazard] : "—";

  renderPerMonthChart(data.reports_per_month);
  renderSeverityChart(data.by_severity);
  renderAreasChart(data.top_areas);
  renderDepartmentTable(data.department_performance);
}

function renderPerMonthChart(perMonth) {
  destroyChart("perMonth");
  const ctx = document.getElementById("chart-per-month");
  charts.perMonth = new Chart(ctx, {
    type: "line",
    data: { labels: perMonth.map((m) => m.month), datasets: [{ label: "Reports", data: perMonth.map((m) => m.count), borderColor: "#e2601c", backgroundColor: "rgba(226, 96, 28, 0.12)", fill: true, tension: 0.25 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });
}

function renderSeverityChart(bySeverity) {
  destroyChart("severity");
  const order = ["low", "medium", "high", "critical"];
  const colors = { low: "#3b82f6", medium: "#f4c20d", high: "#e2601c", critical: "#dc2626" };
  const ctx = document.getElementById("chart-severity");
  charts.severity = new Chart(ctx, {
    type: "doughnut",
    data: { labels: order.map((s) => SEVERITY_LABELS[s]), datasets: [{ data: order.map((s) => bySeverity[s] || 0), backgroundColor: order.map((s) => colors[s]) }] },
    options: { plugins: { legend: { position: "bottom" } } },
  });
}

function renderAreasChart(topAreas) {
  destroyChart("areas");
  const ctx = document.getElementById("chart-areas");
  charts.areas = new Chart(ctx, {
    type: "bar",
    data: { labels: topAreas.map((a) => a.area), datasets: [{ label: "Reports", data: topAreas.map((a) => a.count), backgroundColor: "#f4c20d" }] },
    options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } },
  });
}

function renderDepartmentTable(departments) {
  const tbody = document.getElementById("dept-performance-body");
  if (departments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No reports have been assigned to a department yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = departments.map((d) => `
    <tr><td>${escapeHtml(d.department)}</td><td>${d.total_assigned}</td><td>${d.resolved}</td><td>${d.avg_resolution_hours !== null ? d.avg_resolution_hours : "—"}</td></tr>
  `).join("");
}

// ---------- Bootstrap ----------

document.addEventListener("DOMContentLoaded", () => {
  initAuthNav();
  if (!checkAdminAccess()) return;

  initTabs();
  initPresetBar();
  initManageModal();
  loadReports();
});