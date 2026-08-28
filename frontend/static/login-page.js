// ---------------------------------------------------------------
// Login/register page logic.
// ---------------------------------------------------------------

function getNextParam() {
  const params = new URLSearchParams(window.location.search);
  return params.get("next") || "/map";
}

function initTabs() {
  const tabs = document.querySelectorAll(".auth-tab");
  const forms = {
    login: document.getElementById("login-form"),
    register: document.getElementById("register-form"),
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      Object.values(forms).forEach((f) => f.classList.add("hidden"));
      forms[tab.dataset.tab].classList.remove("hidden");
    });
  });
}

function showError(elId, message) {
  const el = document.getElementById(elId);
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideError(elId) {
  document.getElementById(elId).classList.add("hidden");
}

async function handleAuthSubmit(url, payload, errorElId) {
  hideError(errorElId);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    showError(errorElId, data.detail || "Something went wrong. Please try again.");
    return;
  }

  saveSession(data.access_token, data.user);
  window.location.href = getNextParam();
}

document.addEventListener("DOMContentLoaded", () => {
  initTabs();

  // If already logged in, skip straight to where they were headed.
  if (isLoggedIn()) {
    window.location.href = getNextParam();
    return;
  }

  document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    handleAuthSubmit(
      "/api/auth/login",
      { email: fd.get("email"), password: fd.get("password") },
      "login-error"
    );
  });

  document.getElementById("register-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    handleAuthSubmit(
      "/api/auth/register",
      { name: fd.get("name"), email: fd.get("email"), password: fd.get("password") },
      "register-error"
    );
  });
});
