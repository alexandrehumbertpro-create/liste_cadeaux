// Integration-only stack using real GoTrue/PostgREST and a small PostgreSQL image.
// This is not a deployment configuration. Storage/email integrations need Supabase/Resend.
import { execFileSync } from "node:child_process";
import pg from "pg";
import { randomBytes, createHmac } from "node:crypto";
import { readFile, writeFile, access } from "node:fs/promises";
import http from "node:http";
const docker = (...args) =>
  execFileSync("docker", args, {
    stdio: ["ignore", "pipe", "pipe"],
  }).toString();
const db = new pg.Client({
  connectionString: "postgresql://postgres@127.0.0.1:55432/postgres",
});
await db.connect();
await db.query("create database kad_integration");
await db.query("alter database kad_integration set search_path=auth,public");
await db.end();
const sql = new pg.Client({
  connectionString: "postgresql://postgres@127.0.0.1:55432/kad_integration",
});
await sql.connect();
await sql.query(
  "create extension if not exists pgcrypto;create schema auth;create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;grant usage on schema auth,public to authenticated,anon,service_role;",
);
try {
  docker("network", "create", "kad-integration");
} catch {}
docker("network", "connect", "kad-integration", "kad-postgres-tests");
const secret = randomBytes(40).toString("hex");
function jwt(role) {
  const a = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    b = Buffer.from(
      JSON.stringify({
        role,
        iss: "supabase",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400,
      }),
    ).toString("base64url");
  return (
    a +
    "." +
    b +
    "." +
    createHmac("sha256", secret)
      .update(a + "." + b)
      .digest("base64url")
  );
}
const anon = jwt("anon"),
  service = jwt("service_role");
docker(
  "run",
  "-d",
  "--name",
  "kad-auth-integration",
  "--network",
  "kad-integration",
  "-p",
  "127.0.0.1:55423:9999",
  "-e",
  "GOTRUE_API_HOST=0.0.0.0",
  "-e",
  "GOTRUE_API_PORT=9999",
  "-e",
  "API_EXTERNAL_URL=http://127.0.0.1:55421/auth/v1",
  "-e",
  "GOTRUE_DB_DRIVER=postgres",
  "-e",
  "GOTRUE_DB_DATABASE_URL=postgres://postgres@kad-postgres-tests:5432/kad_integration",
  "-e",
  "GOTRUE_SITE_URL=http://localhost:3000",
  "-e",
  "GOTRUE_JWT_SECRET=" + secret,
  "-e",
  "GOTRUE_JWT_EXP=3600",
  "-e",
  "GOTRUE_JWT_DEFAULT_GROUP=authenticated",
  "-e",
  "GOTRUE_JWT_AUD=authenticated",
  "-e",
  "GOTRUE_JWT_ADMIN_ROLES=service_role",
  "-e",
  "GOTRUE_MAILER_AUTOCONFIRM=true",
  "-e",
  "GOTRUE_DISABLE_SIGNUP=false",
  "ghcr.io/supabase/gotrue:v2.197.0",
);
async function ready(url) {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Service failed to start");
}
await ready("http://127.0.0.1:55423/health");
// Storage schema test fixture. Actual storage API is deliberately not simulated.
await sql.query(
  "create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key,name text,bucket_id text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;",
);
await sql.query(
  await readFile(
    new URL("../supabase/migrations/202610100001_initial.sql", import.meta.url),
    "utf8",
  ),
);
docker(
  "run",
  "-d",
  "--name",
  "kad-rest-integration",
  "--network",
  "kad-integration",
  "-p",
  "127.0.0.1:55424:3000",
  "-e",
  "PGRST_DB_URI=postgres://postgres@kad-postgres-tests:5432/kad_integration",
  "-e",
  "PGRST_DB_SCHEMAS=public",
  "-e",
  "PGRST_DB_ANON_ROLE=anon",
  "-e",
  "PGRST_JWT_SECRET=" + secret,
  "ghcr.io/supabase/postgrest:v16.4",
);
await ready("http://127.0.0.1:55424/");
const credentials = {};
for (const [name, email] of [
  ["Alex", "alex@example.test"],
  ["Elise", "elise@example.test"],
]) {
  const password = randomBytes(18).toString("base64url");
  const res = await fetch("http://127.0.0.1:55423/admin/users", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + service,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      role: "authenticated",
    }),
  });
  if (!res.ok) throw new Error("Local admin creation failed");
  const user = await res.json();
  await sql.query(
    "insert into profiles(id,display_name,email) values($1,$2,$3)",
    [user.id, name, email],
  );
  credentials[name] = { email, password, id: user.id };
}
await sql.query(
  await readFile(
    new URL(
      "../supabase/migrations/202610130001_simplify_capture.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await sql.query(
  await readFile(
    new URL(
      "../supabase/migrations/202610240001_people_and_gmail.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await sql.query(
  await readFile(
    new URL(
      "../supabase/migrations/202610240002_shared_recipient_colors.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await sql.query(
  await readFile(
    new URL(
      "../supabase/migrations/202610240003_list_history.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);

await sql.end();
await writeFile(
  "/tmp/kad-integration-credentials.json",
  JSON.stringify(credentials),
  { mode: 0o600 },
);
try {
  await access(".env.local");
  throw new Error(".env.local already exists; refusing to overwrite");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await writeFile(
  ".env.local",
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55421\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}\nSUPABASE_SERVICE_ROLE_KEY=${service}\nAPP_URL=http://localhost:3000\n`,
  { mode: 0o600 },
);
http
  .createServer((req, res) => {
    const auth = req.url.startsWith("/auth/v1");
    const target = http.request(
      {
        hostname: "127.0.0.1",
        port: auth ? 55423 : 55424,
        path: req.url.replace(auth ? "/auth/v1" : "/rest/v1", ""),
        method: req.method,
        headers: req.headers,
      },
      (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      },
    );
    target.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(target);
  })
  .listen(55421, "127.0.0.1", () =>
    console.log("Local integration API ready (auth and data only)."),
  );
