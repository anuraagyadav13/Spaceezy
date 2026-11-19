// Runs before first paint (loaded via next/script with strategy
// "beforeInteractive", so it is injected into <head> of the server HTML).
// Applies the saved/system theme before first paint so a dark-mode visitor
// never sees a white flash. Light/dark works on both the CRM and the public
// website.
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
        var dark = stored === "dark" || (stored !== "light" && prefersDark);
        var root = document.documentElement;
        root.classList.toggle("dark", dark);
        root.classList.toggle("crm", isCrm);
        root.style.colorScheme = dark ? "dark" : "light";
        root.style.backgroundColor = dark ? "#050505" : "";
    } catch (error) {
        // Private mode / blocked storage: fall back to the CSS defaults.
    }
})();
