// ---------------------------------------------------------------
// Streetwatch frontend logic.
// Talks to the FastAPI backend at /api/reports.
// No frameworks — plain JS + Leaflet, kept simple on purpose so it's
// easy to explain in your technical documentation.
//
// Depends on auth.js being loaded first (STATUS_LABELS, HAZARD_LABELS,
// SEVERITY_LABELS, colorForStatus, colorForMarker, formatReportId,
// formatDate, escapeHtml, and the auth/session helpers all live there).
// ---------------------------------------------------------------

const API_BASE = "/api/reports";

// Default map view — adjust to your city/area.
const DEFAULT_CENTER = [6.9271, 79.8612]; // Colombo, Sri Lanka
const DEFAULT_ZOOM = 12;

let map;
let markers = {}; // report.id -> Leaflet marker
let pickedLatLng = null;
let currentReports = [];

// ---------- Init ----------

function initMap() {
  map = L.map("map").setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  // Clicking the map while the report form is open drops the pin.
  map.on("click", (e) => {
    const modal = document.getElementById("report-modal");
    if (modal.classList.contains("hidden")) return;
    setPickedLocation(e.latlng.lat, e.latlng.lng);
  });
}

function setPickedLocation(lat, lng) {
  pickedLatLng = { lat, lng };
  document.querySelector('input[name="latitude"]').value = lat;
  document.querySelector('input[name="longitude"]').value = lng;

  const readout = document.getElementById("picked-coords");
  readout.textContent = `Pinned at ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  readout.classList.add("picked");

  // If the map is visible behind the modal, center it on the pin too.
  if (map) map.panTo([lat, lng]);
}

function useMyLocation() {
  if (!navigator.geolocation) {
    alert("Your browser doesn't support geolocation. Click a point on the map instead.");
    return;
  }

  const btn = document.getElementById("use-my-location-btn");
  btn.disabled = true;
  btn.textContent = "Locating…";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      setPickedLocation(position.coords.latitude, position.coords.longitude);
      btn.disabled = false;
      btn.textContent = "📍 Use My Location";
    },
    (error) => {
      alert("Couldn't get your location — click a point on the map instead.");
      btn.disabled = false;
      btn.textContent = "📍 Use My Location";
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ---------- Data loading ----------

function buildFilterQuery() {
  const params = new URLSearchParams();

  const hazardType = document.getElementById("filter-hazard-type").value;
  const status = document.getElementById("filter-status").value;
  const severity = document.getElementById("filter-severity").value;
  const dateFrom = document.getElementById("filter-date-from").value;
  const dateTo = document.getElementById("filter-date-to").value;
  const location = document.getElementById("filter-location").value.trim();

  if (hazardType) params.set("hazard_type", hazardType);
  if (status) params.set("status", status);
  if (severity) params.set("severity", severity);
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  if (location) params.set("location", location);

  return params.toString();
}

async function loadReports() {
  const query = buildFilterQuery();
  const url = query ? `${API_BASE}?${query}` : API_BASE;

  const res = await fetch(url);
  if (!res.ok) {
    console.error("Failed to load reports", await res.text());
    return;
  }
  currentReports = await res.json();
  renderMarkers(currentReports);
  renderList(currentReports);

  const countEl = document.getElementById("results-count");
  if (countEl) {
    countEl.textContent = `${currentReports.length} report${currentReports.length === 1 ? "" : "s"}`;
  }
}

function initFilters() {
  const ids = [
    "filter-hazard-type",
    "filter-status",
    "filter-severity",
    "filter-date-from",
    "filter-date-to",
  ];
  ids.forEach((id) => {
    document.getElementById(id).addEventListener("change", loadReports);
  });

  // Location is free text — debounce so we're not firing a request per keystroke.
  let locationTimer;
  document.getElementById("filter-location").addEventListener("input", () => {
    clearTimeout(locationTimer);
    locationTimer = setTimeout(loadReports, 350);
  });

  document.getElementById("filter-reset-btn").addEventListener("click", () => {
    ids.forEach((id) => (document.getElementById(id).value = ""));
    document.getElementById("filter-location").value = "";
    loadReports();
  });
}

function renderMarkers(reports) {
  Object.values(markers).forEach((m) => map.removeLayer(m));
  markers = {};

  reports.forEach((report) => {
    const marker = L.circleMarker([report.latitude, report.longitude], {
      radius: 9,
      color: "#1c1f1e",
      weight: 1.5,
      fillColor: colorForMarker(report),
      fillOpacity: 0.9,
    }).addTo(map);

    marker.bindPopup(popupHtml(report));
    markers[report.id] = marker;
  });
}

function popupHtml(report) {
  const media = report.media_url && isImageUrl(report.media_url)
    ? `<img src="${report.media_url}" alt="Attached photo" style="width:100%;max-width:220px;border-radius:4px;margin-top:8px;display:block;" />`
    : "";
  const location = report.location_address
    ? escapeHtml(report.location_address)
    : `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`;

  return `
    <div class="popup-card">
      <strong class="popup-title">${escapeHtml(report.title)}</strong>
      <p class="popup-row"><b>Location:</b> ${location}</p>
      <p class="popup-row"><b>Reported:</b> ${formatDate(report.created_at)}</p>
      <p class="popup-row"><b>Status:</b> ${STATUS_LABELS[report.status]}</p>
      <p class="popup-row"><b>Severity:</b> ${SEVERITY_LABELS[report.severity]}</p>
      <p class="popup-row popup-id"><b>Report ID:</b> #${formatReportId(report.id)}</p>
      ${media}
    </div>
  `;
}

function isImageUrl(url) {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
}

function renderList(reports) {
  const list = document.getElementById("report-list");
  list.innerHTML = "";

  if (reports.length === 0) {
    list.innerHTML = `<li class="empty-state">No reports yet — be the first to flag something.</li>`;
    return;
  }

  reports.forEach((report) => {
    const li = document.createElement("li");
    li.className = `report-card status-${report.status}`;
    li.innerHTML = `
      <div class="report-card-top">
        <span class="report-type">${HAZARD_LABELS[report.hazard_type]}</span>
        <span class="report-id">#${formatReportId(report.id)}</span>
      </div>
      <p class="report-title">${escapeHtml(report.title)}</p>
      <p class="report-desc">${escapeHtml(report.description)}</p>
      <div class="status-row">
        <span class="status-pill ${report.status}">${STATUS_LABELS[report.status]}</span>
        <span class="severity-pill severity-${report.severity}">${SEVERITY_LABELS[report.severity]}</span>
        <select class="status-select" data-id="${report.id}">
          ${Object.keys(STATUS_LABELS)
            .map(
              (s) =>
                `<option value="${s}" ${s === report.status ? "selected" : ""}>${STATUS_LABELS[s]}</option>`
            )
            .join("")}
        </select>
      </div>
    `;

    li.addEventListener("click", (e) => {
      // Don't fly to map if the click was on the status dropdown itself.
      if (e.target.tagName === "SELECT") return;
      map.setView([report.latitude, report.longitude], 16);
      markers[report.id].openPopup();
    });

    list.appendChild(li);
  });

  // Wire up status-change selects (the second "meaningful interaction").
  document.querySelectorAll(".status-select").forEach((select) => {
    select.addEventListener("change", async (e) => {
      e.stopPropagation();
      const id = e.target.dataset.id;
      const newStatus = e.target.value;
      await updateStatus(id, newStatus);
    });
    select.addEventListener("click", (e) => e.stopPropagation());
  });
}

async function updateStatus(id, status) {
  if (!isLoggedIn()) {
    window.location.href = "/login?next=/map";
    return;
  }

  const res = await fetch(
    `${API_BASE}/${id}`,
    withAuthHeader({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
  );

  if (res.status === 401) {
    alert("Your session expired — please log in again.");
    clearSession();
    window.location.href = "/login?next=/map";
    return;
  }

  if (!res.ok) {
    alert("Couldn't update status — try again.");
    return;
  }
  await loadReports();
}

// ---------- Form / modal ----------

function initModal() {
  const modal = document.getElementById("report-modal");
  const openBtn = document.getElementById("new-report-btn");
  const closeBtn = document.getElementById("close-modal");
  const form = document.getElementById("report-form");

  openBtn.addEventListener("click", () => {
    if (!isLoggedIn()) {
      window.location.href = "/login?next=/map";
      return;
    }
    modal.classList.remove("hidden");
  });

  closeBtn.addEventListener("click", () => modal.classList.add("hidden"));

  document.getElementById("use-my-location-btn").addEventListener("click", useMyLocation);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!pickedLatLng) {
      alert("Click a location on the map, or use 'Use My Location', first.");
      return;
    }

    // Sending FormData (not JSON) because the backend endpoint accepts
    // multipart/form-data — required so the optional photo/video file can
    // travel alongside the text fields in the same request. The hidden
    // latitude/longitude inputs are already filled in by setPickedLocation.
    const formData = new FormData(form);

    const res = await fetch(
      API_BASE,
      withAuthHeader({
        method: "POST",
        body: formData,
        // No Content-Type header here on purpose — the browser sets the
        // correct multipart/form-data boundary automatically. Setting it
        // manually breaks the upload.
      })
    );

    if (res.status === 401) {
      alert("Your session expired — please log in again.");
      clearSession();
      window.location.href = "/login?next=/map";
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert("Couldn't submit report: " + (err.detail || res.statusText));
      return;
    }

    form.reset();
    pickedLatLng = null;
    document.getElementById("picked-coords").textContent = "No location selected yet";
    document.getElementById("picked-coords").classList.remove("picked");
    modal.classList.add("hidden");
    await loadReports();
  });
}

// ---------- Bootstrap ----------

document.addEventListener("DOMContentLoaded", () => {
  initAuthNav();
  initMap();
  initModal();
  initFilters();
  loadReports();
});