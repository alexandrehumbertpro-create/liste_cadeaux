// ONLY the disposable kad_integration database from local-test-stack.mjs.
import pg from "pg";
import { readFile } from "node:fs/promises";
const db = new pg.Client({
  connectionString: "postgresql://postgres@127.0.0.1:55432/kad_integration",
});
await db.connect();
try {
  await db.query("begin");
  await db.query(
    "drop schema public cascade;create schema public;create extension if not exists pgcrypto;grant usage on schema public to anon,authenticated,service_role;drop policy if exists admin_uploads on storage.objects;drop policy if exists admin_reads_own_uploads on storage.objects;",
  );
  await db.query(
    await readFile(
      new URL(
        "../supabase/migrations/202610100001_initial.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const users = JSON.parse(
    await readFile("/tmp/kad-integration-credentials.json", "utf8"),
  );
  for (const [name, user] of Object.entries(users))
    await db.query(
      "insert into public.profiles(id,display_name,email) values($1,$2,$3)",
      [user.id, name, user.email],
    );
  await db.query("notify pgrst,'reload schema'");
  await db.query("commit");
  console.log("Disposable integration data reset.");
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
