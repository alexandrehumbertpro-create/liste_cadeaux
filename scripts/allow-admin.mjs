import { createClient } from "@supabase/supabase-js";
try {
  process.loadEnvFile(".env.local");
} catch {}
const [id, name] = process.argv.slice(2);
if (!/^[0-9a-f-]{36}$/i.test(id ?? "") || !name?.trim()) {
  console.error('Usage : node scripts/allow-admin.mjs UUID "Alex"');
  process.exit(1);
}
if (
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
)
  throw new Error("Configurez les variables sécurisées Supabase.");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const { data, error } = await db.auth.admin.getUserById(id);
if (error || !data.user.email)
  throw new Error("Utilisateur Supabase introuvable.");
const { error: insertError } = await db
  .from("profiles")
  .upsert({ id, display_name: name.trim(), email: data.user.email });
if (insertError)
  throw new Error("Autorisation refusée : " + insertError.message);
console.log("Gestionnaire autorisé.");
