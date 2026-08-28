// ---------------------------------------------------------------
// Shared auth helpers. Loaded on every page that needs to know
// whether someone is logged in (home, map, login pages).
//
// The JWT is kept in localStorage under "streetwatch_token" along
// with the logged-in user's basic info under "streetwatch_user".
// This is a normal, real browser app served by our own FastAPI
// server (not a sandboxed artifact), so localStorage is fine here.
// ---------------------------------------------------------------

// Shared lookup tables — used by app.js (map page) and home.js
// (homepage) so hazard/status labels and colors never drift apart.
const STATUS_LABELS = {
  reported: "Reported",
  verified: "Verified",
  in_progress: "In progress",
  resolved: "Resolved",
};

const HAZARD_LABELS = {
  pothole: "Pothole",
  broken_streetlight: "Broken streetlight",
  damaged_road: "Damaged/unsafe road",
  flooding: "Flooding",
  broken_traffic_signal: "Broken traffic signal",
  illegal_dumping: "Waste / illegal dumping",
  water_leakage: "Water leakage",
  unsafe_infrastructure: "Unsafe infrastructure",
  fallen_tree: "Fallen tree",
  electrical_hazard: "Electrical hazard",
  other: "Other hazard",
};

const SEVERITY_LABELS = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

function colorForSeverity(severity) {
  return { low: "#3b82f6", medium: "#f4c20d", high: "#e2601c", critical: "#dc2626" }[severity];
}

function colorForStatus(status) {
  return { reported: "#e2601c", verified: "#3b82f6", in_progress: "#f4c20d", resolved: "#3f7d5c" }[status];
}

function colorForMarker(report) {
  if (report.status === "resolved") return "#3f7d5c";
  return colorForSeverity(report.severity);
}

function formatReportId(id) {
  return `HZ${String(id).padStart(4, "0")}`;
}

function formatDate(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

const AUTH_TOKEN_KEY = "streetwatch_token";
const AUTH_USER_KEY = "streetwatch_user";

function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function getStoredUser() {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveSession(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

function isLoggedIn() {
  return !!getToken();
}

/** Adds the Authorization header to a fetch options object, if logged in. */
function withAuthHeader(options = {}) {
  const token = getToken();
  if (!token) return options;
  return {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  };
}

/** Call on pages that show a nav bar with login/logout state (e.g. home.html, map.html). */
function initAuthNav() {
  const greeting = document.getElementById("user-greeting");
  const logoutBtn = document.getElementById("logout-btn");
  const loginBtn = document.getElementById("nav-login-btn");
  const myReportsLink = document.getElementById("my-reports-link");
  if (!greeting || !logoutBtn) return;

  const user = getStoredUser();
  if (user) {
    greeting.textContent = `Hi, ${user.name}`;
    greeting.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    if (loginBtn) loginBtn.classList.add("hidden");
    if (myReportsLink) myReportsLink.classList.remove("hidden");
  }

  logoutBtn.addEventListener("click", () => {
    clearSession();
    window.location.reload();
  });
}
