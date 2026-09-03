// ---------------------------------------------------------------
// Lightweight i18n for Streetwatch's static UI chrome (nav, footer,
// headings, buttons, form labels).
//
// SCOPE: this translates fixed page text — the parts that are the same
// for every visitor. It does NOT translate:
//   - report titles/descriptions (user-submitted content)
//   - the hazard/status/severity label dictionaries in auth.js, since
//     those are threaded through many JS files as direct object lookups
//
// Usage: give any element a data-i18n="key" attribute and
// applyTranslations() will set its textContent.
// ---------------------------------------------------------------

const LANG_KEY = "streetwatch_lang";

const TRANSLATIONS = {
  en: {
    "nav.home": "Home",
    "nav.map": "View Map",
    "nav.publicMap": "View Public Map",
    "nav.track": "Track a Report",
    "nav.myReports": "My Reports",
    "nav.admin": "Admin",
    "nav.login": "Log in",
    "nav.logout": "Log out",
    "nav.hiPrefix": "Hi,",
    "nav.reportBtn": "+ Report a Hazard",

    "footer.explore": "Explore",
    "footer.account": "Account",
    "footer.about": "About",
    "footer.tagline": "Log it. Track it. Fix it.\nCommunity hazard reporting for safer streets.",
    "footer.sdg": "Built for SDG 11 — Sustainable Cities and Communities.",
    "footer.builtFor": "Summer School 2.0 — IIT × IET.",
    "footer.rights": "All rights reserved.",
    "footer.tag": "Log it. Track it. Fix it.",

    "hero.eyebrow": "SDG 11 — Sustainable Cities & Communities",
    "hero.title1": "Broken streetlight?",
    "hero.title2": "Flooded road?",
    "hero.titleAccent": "Log it. Track it. Fix it.",
    "hero.subtitle": "Streetwatch is a shared, visible log of local infrastructure hazards — potholes, broken streetlights, flooding, damaged sidewalks — reported by the people who actually walk past them every day.",
    "hero.reportBtn": "+ Report a Hazard",
    "hero.viewMapBtn": "View the live map",

    "stats.total": "Total Reports",
    "stats.active": "Active Hazards",
    "stats.progress": "In Progress",
    "stats.resolved": "Resolved",

    "track.heading": "Track a report",
    "track.sub": "Enter your Report ID to see its current status.",
    "track.button": "Track",
    "track.placeholder": "e.g. HZ1024",

    "login.loginTab": "Log in",
    "login.registerTab": "Create account",
    "login.emailLabel": "Email",
    "login.passwordLabel": "Password",
    "login.nameLabel": "Name",
    "login.loginBtn": "Log in",
    "login.registerBtn": "Create account",

    "myreports.heading": "My Reports",
    "myreports.sub": "Reports you've filed, and where each one stands.",
  },

  si: {
    "nav.home": "මුල් පිටුව",
    "nav.map": "සිතියම බලන්න",
    "nav.publicMap": "පොදු සිතියම බලන්න",
    "nav.track": "වාර්තාවක් සොයන්න",
    "nav.myReports": "මගේ වාර්තා",
    "nav.admin": "පරිපාලක",
    "nav.login": "පිවිසෙන්න",
    "nav.logout": "ඉවත් වන්න",
    "nav.hiPrefix": "ආයුබෝවන්,",
    "nav.reportBtn": "+ අනතුරක් වාර්තා කරන්න",

    "footer.explore": "ගවේෂණය",
    "footer.account": "ගිණුම",
    "footer.about": "පිළිබඳව",
    "footer.tagline": "වාර්තා කරන්න. සොයන්න. විසඳන්න.\nආරක්ෂිත වීදි සඳහා ප්‍රජා අනතුරු වාර්තාකරණය.",
    "footer.sdg": "තිරසාර නගර සහ ප්‍රජාවන් සඳහා (SDG 11) නිර්මාණය කරන ලදී.",
    "footer.builtFor": "Summer School 2.0 — IIT × IET.",
    "footer.rights": "සියලුම හිමිකම් ඇවිරිණි.",
    "footer.tag": "වාර්තා කරන්න. සොයන්න. විසඳන්න.",

    "hero.eyebrow": "SDG 11 — තිරසාර නගර සහ ප්‍රජාවන්",
    "hero.title1": "වීදි ලාම්පුව කැඩිලාද?",
    "hero.title2": "පාර ජලයෙන් යටවෙලාද?",
    "hero.titleAccent": "වාර්තා කරන්න. සොයන්න. විසඳන්න.",
    "hero.subtitle": "Streetwatch යනු දේශීය යටිතල පහසුකම් අනතුරු — වළවල්, කැඩුණු වීදි ලාම්පු, ගංවතුර, හානි වූ පදික මාර්ග — වෙන දින පතා ඒවා අසලින් ගමන් කරන පුද්ගලයින් විසින්ම වාර්තා කරන පොදු, දෘශ්‍යමාන ලේඛනයකි.",
    "hero.reportBtn": "+ අනතුරක් වාර්තා කරන්න",
    "hero.viewMapBtn": "සජීවී සිතියම බලන්න",

    "stats.total": "මුළු වාර්තා",
    "stats.active": "ක්‍රියාකාරී අනතුරු",
    "stats.progress": "ක්‍රියාත්මක වෙමින්",
    "stats.resolved": "විසඳා ඇත",

    "track.heading": "වාර්තාවක් සොයන්න",
    "track.sub": "වර්තමාන තත්ත්වය බැලීමට ඔබේ වාර්තා අංකය ඇතුළත් කරන්න.",
    "track.button": "සොයන්න",
    "track.placeholder": "උදා: HZ1024",

    "login.loginTab": "පිවිසෙන්න",
    "login.registerTab": "ගිණුමක් සාදන්න",
    "login.emailLabel": "විද්‍යුත් තැපෑල",
    "login.passwordLabel": "මුරපදය",
    "login.nameLabel": "නම",
    "login.loginBtn": "පිවිසෙන්න",
    "login.registerBtn": "ගිණුමක් සාදන්න",

    "myreports.heading": "මගේ වාර්තා",
    "myreports.sub": "ඔබ ගොනු කළ වාර්තා, සහ ඒවායේ තත්ත්වය.",
  },
};

function getLang() {
  return localStorage.getItem(LANG_KEY) || "en";
}

function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
}

function t(key) {
  const lang = getLang();
  return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.en[key] || key;
}

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  const greeting = document.getElementById("user-greeting");
  if (greeting && greeting.dataset.userName) {
    greeting.textContent = `${t("nav.hiPrefix")} ${greeting.dataset.userName}`;
  }

  document.querySelectorAll("[data-lang-btn]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.langBtn === getLang());
  });
}

function initLanguageSwitcher() {
  document.querySelectorAll("[data-lang-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setLang(btn.dataset.langBtn);
      applyTranslations();
    });
  });
  applyTranslations();
}