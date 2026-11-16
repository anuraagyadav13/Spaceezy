"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { usePathname } from "next/navigation";

export const THEME_STORAGE_KEY = "spaceezy-theme";

// Keep in sync with THEME_BOOTSTRAP in app/layout.jsx.
export const DARK_BACKGROUND = "#171b22";

// Dark mode is a CRM-only feature: the public marketing site always renders
// with the light palette.
const CRM_ROUTE_PREFIXES = ["/dashboard", "/login", "/forgot-password"];

export function isCrmRoute(pathname) {
    if (!pathname) return false;
    return CRM_ROUTE_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
}

const readTheme = () => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
};

const applyTheme = (theme) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    // Mirrors the pre-CSS bootstrap (avoids a white canvas flash) and is
    // cleared again when switching back to light.
    root.style.backgroundColor = theme === "dark" ? DARK_BACKGROUND : "";
};

const readStoredTheme = () => {
    try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === "dark" || stored === "light") return stored;
    } catch {
        // storage unavailable — fall through to the system value
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
};

const ThemeContext = createContext({
    theme: "light",
    setTheme: () => {},
    toggleTheme: () => {},
});

/**
 * Per-user light/dark preference for the CRM. Stored in localStorage only — no
 * database or API involvement — so the deployed CRM's schema and backend stay
 * untouched.
 *
 * The inline bootstrap script in the root layout applies the saved/system
 * theme before paint on CRM routes; this provider keeps <html> in sync on
 * client-side navigation, across tabs and with OS theme changes, and forces the
 * light palette everywhere else.
 */
export function ThemeProvider({ children }) {
    const pathname = usePathname();
    const crm = isCrmRoute(pathname);
    const [theme, setThemeState] = useState("light");

    const setTheme = useCallback(
        (next) => {
            // The public site has no toggle; never let it opt into dark.
            const value = next === "dark" && crm ? "dark" : "light";
            applyTheme(value);
            try {
                window.localStorage.setItem(THEME_STORAGE_KEY, value);
            } catch {
                // Private mode / storage disabled — the theme still applies for this tab.
            }
            setThemeState(value);
        },
        [crm]
    );

    const toggleTheme = useCallback(() => {
        setTheme(readTheme() === "dark" ? "light" : "dark");
    }, [setTheme]);

    useEffect(() => {
        if (!crm) {
            applyTheme("light");
            setThemeState("light");
            return undefined;
        }

        // Saved choice wins; otherwise follow the OS preference.
        const sync = () => {
            const next = readStoredTheme();
            applyTheme(next);
            setThemeState(next);
        };
        sync();

        const onStorage = (event) => {
            if (event.key === THEME_STORAGE_KEY) sync();
        };
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const onSystemChange = () => sync();

        window.addEventListener("storage", onStorage);
        media.addEventListener?.("change", onSystemChange);
        return () => {
            window.removeEventListener("storage", onStorage);
            media.removeEventListener?.("change", onSystemChange);
        };
    }, [crm]);

    const value = useMemo(
        () => ({ theme, setTheme, toggleTheme }),
        [theme, setTheme, toggleTheme]
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    return useContext(ThemeContext);
}
