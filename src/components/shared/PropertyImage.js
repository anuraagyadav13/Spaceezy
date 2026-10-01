// src/components/shared/PropertyImage.js
// Wraps a property photo with a graceful fallback: if the URL is
// missing or fails to load, shows a neutral icon placeholder instead
// of a broken-image icon.
"use client";
import { useState } from "react";
import { Building2 } from "lucide-react";
import Image from "next/image";

export default function PropertyImage({ src, alt, className = "" }) {
    const [error, setError] = useState(false);

    if (!src || error) {
        return (
            <div className={`flex items-center justify-center bg-gray-100 text-gray-300 ${className}`}>
                <Building2 size={32} />
            </div>
        );
    }

    return (
        <Image
            src={src}
            alt={alt}
            onError={() => setError(true)}
            className={`object-cover ${className}`}
            width={500}
            height={300}
        />
    );
}