// ---------------------------------------------------------------
// Shared auth helpers. Loaded on every page that needs to know
// whether someone is logged in (map page, login page).
//
// The JWT is kept in localStorage under "streetwatch_token" along
// with the logged-in user's basic info under "streetwatch_user".
// This is a normal, real browser app served by our own FastAPI
// server (not a sandboxed artifact), so localStorage is fine here.
// ---------------------------------------------------------------

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

/** Call on pages that show a nav bar with login/logout state (e.g. map.html). */
function initAuthNav() {
  const greeting = document.getElementById("user-greeting");
  const logoutBtn = document.getElementById("logout-btn");
  if (!greeting || !logoutBtn) return;

  const user = getStoredUser();
  if (user) {
    greeting.textContent = `Hi, ${user.name}`;
    greeting.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
  }

  logoutBtn.addEventListener("click", () => {
    clearSession();
    window.location.reload();
  });
}
