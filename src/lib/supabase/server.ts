import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
export function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
export async function serverClient() {
  if (!configured()) throw new Error("Supabase n’est pas encore configuré.");
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (entries) => {
          try {
            for (const { name, value, options } of entries)
              jar.set(name, value, options);
          } catch {
            /* Server components cannot set cookies; proxy refreshes sessions. */
          }
        },
      },
    },
  );
}
export function serviceClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Service de réservation non configuré.");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function requireAdmin() {
  const db = await serverClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new Error("Connectez-vous pour continuer.");
  const { data: profile } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile) throw new Error("Ce compte n’a pas accès à l’administration.");
  return { db, user, profile };
}
