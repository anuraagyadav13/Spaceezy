// src/components/shared/Modal.js
"use client";
import { X } from "lucide-react";

export default function Modal({ isOpen, onClose, title, children, maxWidth = "max-w-md" }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className={`bg-white rounded-[32px] p-8 w-full ${maxWidth} shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto`}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
                    <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100">
                        <X size={18} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}