"use client";

import { Phone } from "lucide-react";

const WHATSAPP_NUMBER = "917827267897";
const WHATSAPP_TEXT = "Hi SpaceEzy! I'm interested in your properties.";

export function WhatsAppButton() {
    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-3">
            <a
                href="tel:+917827267897"
                aria-label="Call us"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-purple-600 shadow-lg shadow-purple-500/30 transition-transform hover:scale-110 hover:bg-purple-700"
            >
                <Phone className="h-6 w-6 text-white" aria-hidden="true" />
            </a>
            <a
                href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_TEXT)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Chat with us on WhatsApp"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] shadow-lg shadow-green-500/30 transition-transform hover:scale-110 hover:bg-[#1EBE5A]"
            >
                <svg viewBox="0 0 32 32" className="h-7 w-7 fill-white" aria-hidden="true">
                    <path d="M16.004 3.2c-7.06 0-12.8 5.74-12.8 12.8 0 2.26.6 4.46 1.73 6.4L3.2 28.8l6.57-1.7a12.74 12.74 0 0 0 6.23 1.6h.01c7.06 0 12.8-5.74 12.8-12.8 0-3.42-1.33-6.63-3.75-9.05a12.71 12.71 0 0 0-9.06-3.65zm0 23.2h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-4.02 1.05 1.07-3.92-.25-.4a10.57 10.57 0 0 1-1.62-5.66c0-5.87 4.78-10.64 10.65-10.64 2.84 0 5.51 1.11 7.52 3.12a10.57 10.57 0 0 1 3.11 7.53c0 5.87-4.78 10.63-10.66 10.63zm5.84-7.97c-.32-.16-1.89-.93-2.18-1.04-.29-.11-.5-.16-.71.16-.21.32-.82 1.04-1 1.25-.19.21-.37.24-.68.08-.32-.16-1.35-.5-2.57-1.58-.95-.85-1.59-1.89-1.78-2.21-.18-.32-.02-.49.14-.65.15-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.71-1.72-.98-2.35-.26-.62-.52-.54-.71-.55l-.61-.01c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.65 0 1.56 1.14 3.07 1.3 3.28.16.21 2.24 3.42 5.43 4.8.76.33 1.35.52 1.81.67.76.24 1.46.21 2.01.13.61-.09 1.89-.77 2.15-1.52.27-.75.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37z" />
                </svg>
            </a>
        </div>
    );
}
