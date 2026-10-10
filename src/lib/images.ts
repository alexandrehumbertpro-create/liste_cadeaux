import "server-only";
import { serviceClient } from "./supabase/server";
export async function signImage(path: string | null) {
  if (!path?.startsWith("storage:")) return path;
  const db = serviceClient();
  const { data } = await db.storage
    .from("gift-images")
    .createSignedUrl(path.slice(8), 3600);
  return data?.signedUrl ?? null;
}
export async function signed<T extends { image_url: string | null }>(
  values: T[],
) {
  return Promise.all(
    values.map(async (v) => ({
      ...v,
      image_url: await signImage(v.image_url),
    })),
  );
}
