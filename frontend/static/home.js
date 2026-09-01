// ---------------------------------------------------------------
// Homepage logic.
// Depends on auth.js being loaded first (STATUS_LABELS, HAZARD_LABELS,
// colorForStatus, escapeHtml, initAuthNav).
// ---------------------------------------------------------------

const HOME_DEFAULT_CENTER = [6.9271, 79.8612]; // Colombo, Sri Lanka
const HOME_DEFAULT_ZOOM = 11;

async function loadStats() {
  try {
    const res = await fetch("/api/reports/stats");
    if (!res.ok) return;
    const stats = await res.json();

    document.getElementById("stat-total").textContent = stats.total;
    document.getElementById("stat-active").textContent = stats.reported;
    document.getElementById("stat-progress").textContent = stats.in_progress;
    document.getElementById("stat-resolved").textContent = stats.resolved;

    // Fill category counts from the same aggregate response.
    Object.entries(stats.by_type || {}).forEach(([type, count]) => {
      const el = document.querySelector(`[data-count-for="${type}"]`);
      if (el) el.textContent = count;
    });
  } catch (err) {
    console.error("Failed to load stats", err);
  }
}

async function loadRecentReports() {
  const list = document.getElementById("recent-reports-list");
  try {
    const res = await fetch("/api/reports?limit=5");
    if (!res.ok) throw new Error("Request failed");
    const reports = await res.json();

    if (reports.length === 0) {
      list.innerHTML = `<li class="empty-state">No reports yet — be the first to flag something.</li>`;
      return;
    }

    list.innerHTML = reports
      .map(
        (r) => `
      <li class="report-card status-${r.status}">
        <div class="report-card-top">
          <span class="report-type">${HAZARD_LABELS[r.hazard_type]}</span>
          <span class="status-pill ${r.status}">${STATUS_LABELS[r.status]}</span>
        </div>
        <p class="report-desc">${escapeHtml(r.description)}</p>
      </li>
    `
      )
      .join("");
  } catch (err) {
    list.innerHTML = `<li class="empty-state">Couldn't load recent reports.</li>`;
    console.error(err);
  }
}

async function initPreviewMap() {
  const map = L.map("preview-map", {
    zoomControl: false,
    dragging: true,
    scrollWheelZoom: false,
  }).setView(HOME_DEFAULT_CENTER, HOME_DEFAULT_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  try {
    const res = await fetch("/api/reports");
    if (!res.ok) return;
    const reports = await res.json();

    reports.forEach((r) => {
      L.circleMarker([r.latitude, r.longitude], {
        radius: 7,
        color: "#1c1f1e",
        weight: 1.5,
        fillColor: colorForMarker(r),
        fillOpacity: 0.9,
      })
        .bindPopup(`<strong>${HAZARD_LABELS[r.hazard_type]}</strong><br/>${STATUS_LABELS[r.status]}`)
        .addTo(map);
    });
  } catch (err) {
    console.error("Failed to load preview map markers", err);
  }
}

async function loadEmergencyAlerts() {
  const section = document.getElementById("emergency-section");
  const list = document.getElementById("emergency-list");

  try {
    const res = await fetch("/api/reports?severity=critical&unresolved=true");
    if (!res.ok) return;
    const reports = await res.json();

    if (reports.length === 0) {
      section.classList.add("hidden");
      return;
    }

    list.innerHTML = reports
      .map(
        (r) => `
      <a href="/map" class="emergency-card">
        <div class="emergency-card-top">
          <span class="emergency-badge">CRITICAL HAZARD</span>
          <span class="emergency-time">🕐 Reported ${formatRelativeTime(r.created_at)}</span>
        </div>
        <p class="emergency-title">${HAZARD_LABELS[r.hazard_type]}: ${escapeHtml(r.title)}</p>
        <p class="emergency-location">📍 ${r.location_address ? escapeHtml(r.location_address) : `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`}</p>
      </a>
    `
      )
      .join("");

    section.classList.remove("hidden");
  } catch (err) {
    console.error("Failed to load emergency alerts", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initAuthNav();
  loadStats();
  loadRecentReports();
  initPreviewMap();
  loadEmergencyAlerts();
});
