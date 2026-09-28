// src/components/shared/PropertyGallery.js
// Main photo with clickable thumbnails. Falls back to a single image
// (or the icon placeholder via PropertyImage) when there's no gallery.
"use client";
import { useState } from "react";
import PropertyImage from "./PropertyImage";

export default function PropertyGallery({ images, alt }) {
    const gallery = images && images.length > 0 ? images : [undefined];
    const [active, setActive] = useState(0);

    return (
        <div className="flex flex-col gap-3">
            <div className="relative h-64 sm:h-80 rounded-3xl overflow-hidden">
                <PropertyImage src={gallery[active]} alt={alt} className="w-full h-full" />
            </div>
            {gallery.length > 1 && (
                <div className="flex gap-3">
                    {gallery.map((src, i) => (
                        <button
                            key={i}
                            onClick={() => setActive(i)}
                            className={`relative w-20 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-colors ${i === active ? "border-purple-500" : "border-transparent hover:border-gray-200"}`}
                        >
                            <PropertyImage src={src} alt={`${alt} photo ${i + 1}`} className="w-full h-full" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}