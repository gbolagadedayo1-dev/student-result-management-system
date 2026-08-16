import { v2 as cloudinary } from "cloudinary";

export function uploadBuffer(buffer, options = {}) {
  if (!process.env.CLOUDINARY_URL) throw Object.assign(new Error("Cloud storage is not configured"), { status: 503 });
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "maryresult", resource_type: "auto", ...options },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
    stream.end(buffer);
  });
}

export async function removeAsset(publicId) {
  if (publicId && process.env.CLOUDINARY_URL) await cloudinary.uploader.destroy(publicId);
}