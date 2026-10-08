import apiClient from "./client";

// Uploads one image to the CRM media store (POST /api/v1/uploads/images).
// The backend stores it on S3 when AWS_S3_BUCKET is configured and returns a
// durable public URL. Raw bytes are sent so axios does not JSON-encode them.
export const uploadImageFile = async (file) => {
    const data = await apiClient.post("/uploads/images", file, {
        headers: { "Content-Type": file.type || "application/octet-stream" },
        // Send the File as-is instead of the default JSON transform.
        transformRequest: [(body) => body],
        timeout: 60000,
    });
    // Envelope unwrap gives { url, key }.
    return data.url;
};

// True when the server says image storage is not configured (S3 unset).
export const isStorageNotConfigured = (err) => err?.status === 501 && err?.code === "S3_NOT_CONFIGURED";
