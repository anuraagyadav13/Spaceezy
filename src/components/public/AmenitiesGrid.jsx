"use client";
import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";

// Collapsed to a single row of chips (four on desktop, two rows of two on
// phones) so the amenities block no longer pushes the rest of the project
// page below the fold. "Show more" reveals the full list.
const COLLAPSED_COUNT = 4;

export default function AmenitiesGrid({ amenities = [] }) {
    const [expanded, setExpanded] = useState(false);

    if (!amenities.length) {
        return <p className="text-sm text-gray-400">Amenities will be listed here once added.</p>;
    }

    const visible = expanded ? amenities : amenities.slice(0, COLLAPSED_COUNT);
    const canExpand = amenities.length > COLLAPSED_COUNT;

    return (
        <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2" id="amenities-list">
                {visible.map((amenity) => (
                    <div key={amenity} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100">
                        <CheckCircle2 className="text-purple-600 shrink-0" size={14} />
                        <span className="text-gray-700 font-medium text-xs leading-tight">{amenity}</span>
                    </div>
                ))}
            </div>
            {canExpand && (
                <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    aria-expanded={expanded}
                    aria-controls="amenities-list"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-purple-700 hover:text-purple-900 transition-colors"
                >
                    {expanded ? (
                        <>
                            Show less <ChevronUp size={15} />
                        </>
                    ) : (
                        <>
                            Show all {amenities.length} amenities <ChevronDown size={15} />
                        </>
                    )}
                </button>
            )}
        </div>
    );
}
