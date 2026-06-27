import fs from "node:fs/promises";
import path from "node:path";
import streamifier from "streamifier";
import { cloudinary, isCloudinaryConfigured } from "../config/cloudinary.js";

export async function uploadAvatar(file, userId) {
  if (isCloudinaryConfigured) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "connectly/avatars",
          public_id: `${userId}-${Date.now()}`,
          resource_type: "image",
          overwrite: true
        },
        (error, result) => {
          if (error) return reject(error);
          resolve({ url: result.secure_url, publicId: result.public_id });
        }
      );
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }

  const uploadDir = path.resolve("uploads");
  await fs.mkdir(uploadDir, { recursive: true });
  const ext = file.originalname.split(".").pop() || "jpg";
  const filename = `${userId}-${Date.now()}.${ext}`;
  const fullPath = path.join(uploadDir, filename);
  await fs.writeFile(fullPath, file.buffer);
  return { url: `/uploads/${filename}`, publicId: "" };
}

export async function deleteAvatar(publicId) {
  if (isCloudinaryConfigured && publicId) {
    await cloudinary.uploader.destroy(publicId);
  }
}
