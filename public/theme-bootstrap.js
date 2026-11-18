// Runs before first paint (loaded via next/script with strategy
// "beforeInteractive", so it is injected into <head> of the server HTML).
// Keeps a dark-mode CRM user from seeing a white flash. Dark mode is CRM-only,
// so the public site is always forced to light.
//
// Must stay in sync with THEME_STORAGE_KEY / DARK_BACKGROUND / isCrmRoute in
// src/components/providers/ThemeProvider.jsx.
(function () {
    try {
        var pathname = window.location.pathname;
        var isCrm = pathname.indexOf("/dashboard") === 0
            || pathname.indexOf("/login") === 0
            || pathname.indexOf("/forgot-password") === 0;
        var stored = window.localStorage.getItem("spaceezy-theme");
        var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        var dark = isCrm && (stored === "dark" || (stored !== "light" && prefersDark));
        var root = document.documentElement;
        root.classList.toggle("dark", dark);
        root.classList.toggle("crm", isCrm);
        root.style.colorScheme = dark ? "dark" : "light";
        root.style.backgroundColor = dark ? "#050505" : "";
    } catch (error) {
        // Private mode / blocked storage: fall back to the CSS defaults.
    }
})();