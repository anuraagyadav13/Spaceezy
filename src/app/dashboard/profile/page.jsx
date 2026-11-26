"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, Loader2, Mail, Phone, Save, ShieldCheck, Trash2, User } from "lucide-react";
import { useAuth } from "../../../features/auth/hooks/useAuth";
import { updateProfileAPI } from "../../../lib/api/auth";
import { uploadAvatarFile, isStorageNotConfigured } from "../../../lib/api/uploads";
import { showToast } from "../../../lib/toast";

const inputClass =
    "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all disabled:opacity-60";
const labelClass = "block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_AVATAR_MB = 6;

const initialsOf = (name) => (name || "User")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

export default function ProfilePage() {
    const { user, updateUser } = useAuth();
    const fileRef = useRef(null);
    // Drafts stay null until the user edits, so the form always follows the
    // latest session user (initial load and after a successful save) without
    // synchronising state inside an effect.
    const [draft, setDraft] = useState(null);
    const [avatarDraft, setAvatarDraft] = useState(null);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    const form = draft ?? { name: user?.name || "", phone: user?.phone || "" };
    const avatar = avatarDraft ?? user?.avatar ?? "";

    const setField = (key, value) => {
        setDraft((current) => ({
            ...(current ?? { name: user?.name || "", phone: user?.phone || "" }),
            [key]: value,
        }));
    };

    const handleFile = async (event) => {
        const file = event.target.files?.[0];
        // Allow picking the same file again after removing it.
        event.target.value = "";
        if (!file) return;

        if (!ACCEPTED_TYPES.includes(file.type)) {
            showToast("Choose a JPG, PNG, WebP or GIF image", "error");
            return;
        }
        if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
            showToast(`The photo must be ${MAX_AVATAR_MB} MB or smaller`, "error");
            return;
        }

        setUploading(true);
        try {
            const url = await uploadAvatarFile(file);
            setAvatarDraft(url);
            showToast("Photo uploaded — press Save changes to apply it");
        } catch (err) {
            showToast(
                isStorageNotConfigured(err)
                    ? "Image storage is not configured on the server"
                    : err?.message || "Could not upload the photo",
                "error"
            );
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async (event) => {
        event.preventDefault();
        const name = form.name.trim();
        if (!name) {
            showToast("Name is required", "error");
            return;
        }

        setSaving(true);
        try {
            const updated = await updateProfileAPI({
                name,
                phone: form.phone.trim() || null,
                avatar: avatar || null,
            });
            updateUser(updated);
            setDraft(null);
            setAvatarDraft(null);
            showToast("Profile updated");
        } catch (err) {
            showToast(err?.message || "Could not save the profile", "error");
        } finally {
            setSaving(false);
        }
    };

    const busy = saving || uploading;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900"
                    >
                        <ArrowLeft size={14} /> Dashboard
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-900 mt-2">My profile</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Update your photo, name and phone number. Changes appear across the CRM immediately.
                    </p>
                </div>
            </div>

            <form onSubmit={handleSave} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-5 pb-6 border-b border-gray-100">
                    <div className="relative shrink-0">
                        <div className="w-24 h-24 rounded-full border-4 border-white shadow-md overflow-hidden bg-purple-100 flex items-center justify-center">
                            {avatar ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-2xl font-black text-purple-700">{initialsOf(form.name)}</span>
                            )}
                        </div>
                        {uploading && (
                            <div className="absolute inset-0 rounded-full bg-white/70 flex items-center justify-center">
                                <Loader2 size={22} className="animate-spin text-purple-600" />
                            </div>
                        )}
                    </div>

                    <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900">{form.name || "Your name"}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{user?.email}</p>
                        <div className="flex flex-wrap gap-2 mt-3">
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                disabled={busy}
                                className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                            >
                                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                                {avatar ? "Change photo" : "Upload photo"}
                            </button>
                            {avatar && (
                                <button
                                    type="button"
                                    onClick={() => setAvatarDraft("")}
                                    disabled={busy}
                                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    <Trash2 size={13} /> Remove
                                </button>
                            )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-2">
                            JPG, PNG, WebP or GIF · up to {MAX_AVATAR_MB} MB
                        </p>
                        <input
                            ref={fileRef}
                            type="file"
                            accept={ACCEPTED_TYPES.join(",")}
                            onChange={handleFile}
                            className="hidden"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                    <div>
                        <label className={labelClass} htmlFor="profile-name">Full name *</label>
                        <div className="relative">
                            <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                id="profile-name"
                                value={form.name}
                                onChange={(e) => setField("name", e.target.value)}
                                disabled={busy}
                                maxLength={120}
                                placeholder="Your name"
                                className={`${inputClass} pl-9`}
                            />
                        </div>
                    </div>
                    <div>
                        <label className={labelClass} htmlFor="profile-phone">Phone</label>
                        <div className="relative">
                            <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                id="profile-phone"
                                value={form.phone}
                                onChange={(e) => setField("phone", e.target.value)}
                                disabled={busy}
                                maxLength={32}
                                inputMode="tel"
                                placeholder="+91 98765 43210"
                                className={`${inputClass} pl-9`}
                            />
                        </div>
                    </div>
                    <div>
                        <label className={labelClass}>Email</label>
                        <div className="relative">
                            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                value={user?.email || ""}
                                readOnly
                                className={`${inputClass} pl-9 cursor-not-allowed`}
                            />
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1">Email is managed by your administrator.</p>
                    </div>
                    <div>
                        <label className={labelClass}>Role</label>
                        <div className="relative">
                            <ShieldCheck size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                value={(user?.role || "").replace(/_/g, " ")}
                                readOnly
                                className={`${inputClass} pl-9 cursor-not-allowed`}
                            />
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1">Role and permissions are managed by your administrator.</p>
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={() => {
                            setDraft(null);
                            setAvatarDraft(null);
                        }}
                        disabled={busy}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold disabled:opacity-50"
                    >
                        Reset
                    </button>
                    <button
                        type="submit"
                        disabled={busy}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                        Save changes
                    </button>
                </div>
            </form>
        </div>
    );
}
