"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

const fieldClass =
    "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all cursor-pointer";

// Filterable single-select dropdown. Options: [{ value, label }].
// `clearLabel` adds an explicit empty-value option (e.g. "Any district").
// Keyboard: ArrowUp/ArrowDown move the active option, Enter selects it,
// Home/End jump, Escape closes; typing in the search box filters options.
export default function SearchableSelect({
    options = [],
    value = "",
    onChange,
    placeholder = "Select...",
    disabled = false,
    loading = false,
    clearLabel = null,
    buttonClassName = "",
    ariaLabel,
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const containerRef = useRef(null);
    const optionRefs = useRef([]);

    const selected = options.find((option) => option.value === value) || null;

    useEffect(() => {
        if (!open) return;
        const handleOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setOpen(false);
                setQuery("");
            }
        };
        document.addEventListener("mousedown", handleOutside);
        return () => document.removeEventListener("mousedown", handleOutside);
    }, [open]);

    const items = useMemo(() => {
        const base = clearLabel !== null ? [{ value: "", label: clearLabel }, ...options] : options;
        const term = query.trim().toLowerCase();
        if (!term) return base;
        return base.filter((option) => option.label.toLowerCase().includes(term));
    }, [options, query, clearLabel]);

    // Clamp instead of resetting in an effect: the list can change while open
    // (cascading loads), and the active index simply stays in range.
    const active = Math.min(activeIndex, Math.max(items.length - 1, 0));

    // Keep the active option visible while navigating.
    useEffect(() => {
        if (!open) return;
        const element = optionRefs.current[active];
        if (element && typeof element.scrollIntoView === "function") {
            element.scrollIntoView({ block: "nearest" });
        }
    }, [active, open]);

    const handleSelect = (nextValue) => {
        onChange?.(nextValue);
        setOpen(false);
        setQuery("");
    };

    const handleKeyDown = (event) => {
        if (event.key === "Escape") {
            setOpen(false);
            setQuery("");
            return;
        }
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex(Math.min(active + 1, Math.max(items.length - 1, 0)));
            return;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex(Math.max(active - 1, 0));
            return;
        }
        if (event.key === "Home") {
            event.preventDefault();
            setActiveIndex(0);
            return;
        }
        if (event.key === "End") {
            event.preventDefault();
            setActiveIndex(Math.max(items.length - 1, 0));
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            const option = items[active];
            if (option) handleSelect(option.value);
        }
    };

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={open}
                disabled={disabled}
                onClick={() => {
                    setOpen((prev) => !prev);
                    setQuery("");
                    setActiveIndex(0);
                }}
                className={`${fieldClass} ${buttonClassName} flex items-center justify-between gap-2 disabled:opacity-60`}
            >
                <span className={`truncate ${!selected && !loading ? "text-gray-400" : "text-gray-800"}`}>
                    {loading ? "Loading..." : selected ? selected.label : placeholder}
                </span>
                <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
                <div className="absolute z-40 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                        <Search size={14} className="text-gray-400 shrink-0" />
                        <input
                            autoFocus
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                setActiveIndex(0);
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder="Search..."
                            aria-label={ariaLabel ? `Search ${ariaLabel}` : "Search options"}
                            className="w-full text-sm outline-none py-1 bg-transparent text-gray-800 placeholder:text-gray-400"
                        />
                    </div>
                    <ul role="listbox" className="max-h-52 overflow-y-auto py-1">
                        {items.length === 0 && (
                            <li className="px-3 py-2 text-xs text-gray-400">No matches</li>
                        )}
                        {items.map((option, index) => (
                            <li
                                key={option.value || "__clear__"}
                                id={`${ariaLabel || "option"}-${index}`}
                                role="option"
                                aria-selected={option.value === value}
                            >
                                <button
                                    type="button"
                                    ref={(element) => {
                                        optionRefs.current[index] = element;
                                    }}
                                    onClick={() => handleSelect(option.value)}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    className={`w-full text-left px-3 py-2 text-sm ${
                                        index === active ? "bg-purple-50" : ""
                                    } ${
                                        option.value === value ? "text-purple-700 font-bold" : "text-gray-700"
                                    }`}
                                >
                                    {option.label}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
