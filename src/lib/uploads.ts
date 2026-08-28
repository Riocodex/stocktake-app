import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

export async function saveUploadedImage(file: File, prefix: string) {
  if (file.size === 0) throw new Error("That image is empty.");
  if (file.size > MAX_BYTES) throw new Error("Images must be under 10MB.");
  if (file.type && !ALLOWED.has(file.type)) {
    throw new Error(`Unsupported image type: ${file.type}`);
  }

  const extension =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const fileName = `${prefix}-${randomUUID()}.${extension}`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(
    path.join(UPLOAD_DIR, fileName),
    Buffer.from(await file.arrayBuffer()),
  );

  return `/uploads/${fileName}`;
}
