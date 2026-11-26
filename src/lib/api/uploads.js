import apiClient from "./client";

// Uploads one image to the CRM media store (POST /api/v1/uploads/images).
// The backend stores it on S3 when AWS_S3_BUCKET is configured, otherwise on
// local disk, and returns a durable public URL. Raw bytes are sent so axios
// does not JSON-encode them.
const postImage = async (file, url) => {
    const data = await apiClient.post(url, file, {
        headers: { "Content-Type": file.type || "application/octet-stream" },
        // Send the File as-is instead of the default JSON transform.
        transformRequest: [(body) => body],
        timeout: 60000,
    });
    // Envelope unwrap gives { url, key }.
    return data.url;
};

export const uploadImageFile = (file) => postImage(file, "/uploads/images");

// Profile photos are served through /media, so the API rewrites an S3 URL to
// the private-bucket proxy path when purpose=avatar is passed.
export const uploadAvatarFile = (file) => postImage(file, "/uploads/images?purpose=avatar");

// True when the server says image storage is not configured (S3 unset).
export const isStorageNotConfigured = (err) => err?.status === 501 && err?.code === "S3_NOT_CONFIGURED";
