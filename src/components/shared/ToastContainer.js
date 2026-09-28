// src/components/shared/ToastContainer.js
// Mount once in a layout. Listens for showToast() calls anywhere in
// the app and renders a stack of auto-dismissing confirmations.
"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Info } from "lucide-react";

const ICONS = { success: CheckCircle2, error: XCircle, info: Info };
const ICON_COLORS = { success: "text-emerald-500", error: "text-red-500", info: "text-blue-500" };
const BORDER_COLORS = { success: "border-emerald-100", error: "border-red-100", info: "border-blue-100" };

export default function ToastContainer() {
    const [toasts, setToasts] = useState([]);

    useEffect(() => {
        const handler = (e) => {
            const id = Date.now() + Math.random();
            setToasts((prev) => [...prev, { id, ...e.detail }]);
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, 3000);
        };
        window.addEventListener("se-toast", handler);
        return () => window.removeEventListener("se-toast", handler);
    }, []);

    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 max-w-[calc(100%-2rem)] sm:max-w-sm">
            {toasts.map((t) => {
                const Icon = ICONS[t.type] || ICONS.success;
                return (
                    <div
                        key={t.id}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg border bg-white ${BORDER_COLORS[t.type] || BORDER_COLORS.success}`}
                    >
                        <Icon size={18} className={`shrink-0 ${ICON_COLORS[t.type] || ICON_COLORS.success}`} />
                        <p className="text-sm font-medium text-gray-900">{t.message}</p>
                    </div>
                );
            })}
        </div>
    );
}