"use client";
import { useRef, useState } from "react";
import { UploadCloud, X, Loader2 } from "lucide-react";
import { uploadImageFile } from "../../lib/api/uploads";
import { showToast } from "../../lib/toast";

// Shared gallery uploader used by the project and unit edit forms (the create
// wizards have their own inline copy of this dropzone). Files are uploaded to
// the CRM media store first; only the durable URLs are kept in form state, so
// whatever is saved on submit is exactly what renders on the public site.
export default function ImageUploader({ images = [], onChange, disabled = false, altPrefix = "Image" }) {
    const inputRef = useRef(null);
    const [uploading, setUploading] = useState(false);

    const handleFiles = async (e) => {
        const input = e.target;
        const files = Array.from(input.files || []);
        input.value = "";
        if (!files.length || disabled) return;
        setUploading(true);
        try {
            const urls = [];
            for (const file of files) {
                urls.push(await uploadImageFile(file));
            }
            if (urls.length) onChange([...images, ...urls]);
        } catch (err) {
            showToast(`Image upload failed: ${err?.message || "unknown error"}`, "error");
        } finally {
            setUploading(false);
        }
    };

    const removeImage = (index) => onChange(images.filter((_, i) => i !== index));

    return (
        <div>
            <label
                className={`flex min-h-[160px] cursor-pointer items-center justify-center rounded-[22px] border-2 border-dashed border-[#d9d2e3] bg-[#faf7ff] p-8 text-center transition hover:bg-[#f3edff] hover:border-violet-300 ${disabled || uploading ? "pointer-events-none opacity-60" : ""}`}
            >
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={handleFiles}
                    disabled={disabled || uploading}
                />
                <div>
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                        {uploading ? <Loader2 size={24} className="animate-spin" /> : <UploadCloud size={24} />}
                    </div>
                    <div className="mt-3 text-base font-semibold text-gray-800">
                        {uploading ? "Uploading…" : "Click to upload images"}
                    </div>
                    <div className="mt-1 text-sm text-gray-500">PNG, JPG, WebP or GIF up to 6MB each</div>
                </div>
            </label>

            {images.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    {images.map((img, idx) => (
                        <div key={`${img}-${idx}`} className="group relative aspect-video overflow-hidden rounded-xl border border-gray-200">
                            <img src={img} alt={`${altPrefix} ${idx + 1}`} className="h-full w-full object-cover" />
                            <button
                                type="button"
                                onClick={() => removeImage(idx)}
                                disabled={disabled || uploading}
                                className="absolute right-2 top-2 rounded-md bg-white/90 p-1 text-red-500 opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-40"
                                title="Remove image"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
