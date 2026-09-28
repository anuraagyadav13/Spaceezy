// src/lib/toast.js
// Tiny global toast system: dispatches a browser CustomEvent that
// <ToastContainer /> (mounted once per layout) listens for. No
// context/provider wiring needed — call showToast() from anywhere.
export function showToast(message, type = "success") {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("se-toast", { detail: { message, type } }));
}