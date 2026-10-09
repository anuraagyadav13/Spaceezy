"use client";

import { useEffect, useRef, useState } from "react";

// Long CRM copy: always show ~2 lines, then a "+ more" toggle to read the
// rest. The full text stays in the DOM (CSS line-clamp only) so search
// engines still see it. If the text fits in the clamp, the toggle is hidden.
export default function ExpandableText({ text, className = "" }) {
    const textRef = useRef(null);
    const [overflowing, setOverflowing] = useState(true);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        const el = textRef.current;
        if (!el) return;
        const check = () => {
            if (expanded) return;
            setOverflowing(el.scrollHeight > el.clientHeight + 4);
        };
        check();
        const observer = new ResizeObserver(check);
        observer.observe(el);
        return () => observer.disconnect();
    }, [text, expanded]);

    return (
        <div className={className}>
            <p
                ref={textRef}
                className={`text-gray-600 leading-relaxed text-lg ${expanded ? "" : "line-clamp-2"}`}
            >
                {text}
            </p>
            {overflowing && (
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    className="mt-2 inline-flex items-center gap-1 text-purple-600 font-semibold text-sm hover:text-purple-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 rounded"
                >
                    {expanded ? "Show less" : "+ more"}
                </button>
            )}
        </div>
    );
}
