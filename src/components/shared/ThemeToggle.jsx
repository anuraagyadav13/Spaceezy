"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "../providers/ThemeProvider";

const VARIANTS = {
    // CRM surfaces (header, cards)
    surface:
        "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-purple-600",
    // Public header sitting on a dark hero
    glass:
        "border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white",
};

/**
 * One button, both icons rendered and swapped by CSS: unlike a state/mount
 * guard this never mismatches during hydration.
 */
export default function ThemeToggle({ variant = "surface", className = "" }) {
    const { toggleTheme } = useTheme();

    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${VARIANTS[variant] || VARIANTS.surface} ${className}`}
        >
            <Moon size={17} className="dark:hidden" aria-hidden="true" />
            <Sun size={17} className="hidden dark:block" aria-hidden="true" />
        </button>
    );
}
