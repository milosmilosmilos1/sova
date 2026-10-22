import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";

// Storage: putanja je uvek {user_id}/{uuid}.{ext}. Server piše sa service
// role, a svaki poziv proverava da putanja pripada korisniku.

export type Bucket = "uploads" | "generated" | "logos";

const SIGNED_URL_SECONDS = 60 * 60;

export function buildPath(userId: string, ext: string) {
  return `${userId}/${randomUUID()}.${ext}`;
}

export function assertOwnPath(path: string, userId: string) {
  if (!path.startsWith(`${userId}/`) || path.includes("..")) {
    throw new AppError("FORBIDDEN", "Fajl ne pripada ovom korisniku.");
  }
}

export async function uploadBuffer(bucket: Bucket, path: string, buffer: Buffer, contentType: string) {
  const admin = createAdminClient();
  let lastError: string | null = null;
  // Dva pokušaja: storage povremeno vrati prolaznu grešku.
  for (let i = 0; i < 2; i++) {
    const { error } = await admin.storage.from(bucket).upload(path, buffer, { contentType, upsert: false });
    if (!error) return path;
    lastError = error.message;
    if (/exists/i.test(error.message)) break;
  }
  console.error(`[storage] upload ${bucket}/${path}:`, lastError);
  throw new AppError("INTERNAL", "Čuvanje fajla nije uspelo.");
}

export async function downloadBuffer(bucket: Bucket, path: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) {
    throw new AppError("NOT_FOUND", "Fajl nije pronađen. Pošalji ga ponovo.");
  }
  return { buffer: Buffer.from(await data.arrayBuffer()), mimeType: data.type || "image/jpeg" };
}

export async function signedUrl(bucket: Bucket, path: string | null | undefined) {
  if (!path) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) {
    console.error(`[storage] signed url ${bucket}/${path}:`, error.message);
    return null;
  }
  return data.signedUrl;
}

export async function signedUrls(bucket: Bucket, paths: string[]) {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error) {
    console.error(`[storage] signed urls ${bucket}:`, error.message);
    return map;
  }
  for (const item of data) {
    if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  }
  return map;
}

export async function removeObject(bucket: Bucket, path: string | null | undefined) {
  if (!path) return;
  const admin = createAdminClient();
  const { error } = await admin.storage.from(bucket).remove([path]);
  if (error) console.error(`[storage] remove ${bucket}/${path}:`, error.message);
}
