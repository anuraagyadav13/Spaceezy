"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";

export const THEME_STORAGE_KEY = "spaceezy-theme";
// Set once the user has made an explicit choice (first-visit prompt or the
// toggle), so we never ask them again.
export const THEME_CHOSEN_KEY = "spaceezy-theme-chosen";

// Keep in sync with public/theme-bootstrap.js.
export const DARK_BACKGROUND = "#050505";

const CRM_ROUTE_PREFIXES = ["/dashboard", "/login", "/forgot-password"];

export function isCrmRoute(pathname) {
    if (!pathname) return false;
    return CRM_ROUTE_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
}

const readStoredTheme = () => {
    if (typeof window === "undefined") return "light";
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

const hasChosenTheme = () => {
    if (typeof window === "undefined") return true;
    try {
        return window.localStorage.getItem(THEME_CHOSEN_KEY) === "1";
    } catch {
        // Private mode: don't nag on every render.
        return true;
    }
};

const applyTheme = (theme, crm = false) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    // Marks CRM routes for any CRM-specific styling hooks.
    root.classList.toggle("crm", Boolean(crm));
    root.style.colorScheme = theme === "dark" ? "dark" : "light";
    // Mirrors the pre-CSS bootstrap and avoids a white canvas flash.
    root.style.backgroundColor = theme === "dark" ? DARK_BACKGROUND : "";
};

const ThemeContext = createContext({
    theme: "light",
    setTheme: () => {},
    toggleTheme: () => {},
});

/**
 * Light/dark preference shared by the CRM and the public website.
 *
 * The preference lives in localStorage only — no database or API involvement,
 * so the deployed CRM's schema and backend stay untouched. A tiny script in
 * <head> (public/theme-bootstrap.js) applies the saved/system theme before
 * first paint; this provider keeps <html> in sync afterwards on client-side
 * navigation, across tabs and with OS theme changes.
 */
export function ThemeProvider({ children }) {
    const pathname = usePathname();
    const crm = isCrmRoute(pathname);
    const [theme, setThemeState] = useState("light");

    // Persist + apply. `remember` is false for the initial hydration pass so we
    // do not mark a system-driven default as an explicit user choice.
    const setTheme = useCallback(
        (next, { remember = true } = {}) => {
            const value = next === "dark" ? "dark" : "light";
            applyTheme(value, crm);
            setThemeState(value);
            try {
                window.localStorage.setItem(THEME_STORAGE_KEY, value);
                if (remember) {
                    window.localStorage.setItem(THEME_CHOSEN_KEY, "1");
                }
            } catch {
                // Private mode / storage disabled — the theme still applies.
            }
        },
        [crm]
    );

    const toggleTheme = useCallback(() => {
        const current =
            typeof document !== "undefined" &&
            document.documentElement.classList.contains("dark")
                ? "dark"
                : "light";
        setTheme(current === "dark" ? "light" : "dark");
    }, [setTheme]);

    useEffect(() => {
        // Saved choice wins; otherwise follow the OS preference.
        const sync = () => {
            const next = readStoredTheme();
            applyTheme(next, crm);
            setThemeState(next);
        };
        sync();

        const onStorage = (event) => {
            if (event.key === THEME_STORAGE_KEY) sync();
        };
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const onSystemChange = () => {
            // Only follow the OS while the user has not made an explicit choice.
            if (!hasChosenTheme()) sync();
        };

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

/**
 * First-visit theme chooser on the public website. It appears once — until the
 * visitor explicitly picks light or dark — and never on CRM routes, where the
 * toggle in the header is always available.
 */
const emptySubscribe = () => () => {};

export function FirstThemePrompt() {
    const pathname = usePathname();
    const { setTheme } = useTheme();
    const [dismissed, setDismissed] = useState(false);
    // false during SSR/first hydration pass, true once mounted — avoids both a
    // hydration mismatch and asking again after the visitor returns.
    const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

    if (!mounted || dismissed || isCrmRoute(pathname) || hasChosenTheme()) {
        return null;
    }

    const choose = (value) => {
        setTheme(value);
        setDismissed(true);
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose your theme"
            className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm"
        >
            <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-2xl">
                <h2 className="text-xl font-bold text-gray-900">Choose your theme</h2>
                <p className="mt-1 text-sm text-gray-500">
                    Pick how you would like Spaceezy to look. You can change this
                    any time from the toggle in the header.
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={() => choose("light")}
                        className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-4 text-sm font-semibold text-gray-700 transition-colors hover:border-purple-300 hover:bg-purple-50"
                    >
                        <Sun size={22} className="text-amber-500" />
                        Light
                    </button>
                    <button
                        type="button"
                        onClick={() => choose("dark")}
                        className="flex flex-col items-center gap-2 rounded-xl border border-gray-800 bg-[#111318] px-4 py-4 text-sm font-semibold text-white transition-colors hover:border-purple-400"
                    >
                        <Moon size={22} className="text-purple-300" />
                        Dark
                    </button>
                </div>
            </div>
        </div>
    );
}
