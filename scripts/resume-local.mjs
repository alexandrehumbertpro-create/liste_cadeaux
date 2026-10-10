// Resume only the disposable local integration stack, never a remote project.
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import http from "node:http";
const file = await readFile(".env.local", "utf8");
if (!/^NEXT_PUBLIC_SUPABASE_URL=http:\/\/127\.0\.0\.1:55421$/m.test(file))
  throw new Error("This is not the disposable integration configuration.");
const docker = (...args) =>
  execFileSync("docker", args, {
    stdio: ["ignore", "pipe", "pipe"],
  }).toString();
for (const name of [
  "kad-postgres-tests",
  "kad-auth-integration",
  "kad-rest-integration",
])
  docker("start", name);
const config = JSON.parse(docker("inspect", "kad-auth-integration"))[0];
const secret = config.Config.Env.find((v) =>
  v.startsWith("GOTRUE_JWT_SECRET="),
).slice("GOTRUE_JWT_SECRET=".length);
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
await writeFile(
  ".env.local",
  file
    .replace(
      /^NEXT_PUBLIC_SUPABASE_ANON_KEY=.*$/m,
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=" + jwt("anon"),
    )
    .replace(
      /^SUPABASE_SERVICE_ROLE_KEY=.*$/m,
      "SUPABASE_SERVICE_ROLE_KEY=" + jwt("service_role"),
    ),
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
    console.log("Disposable integration API resumed (auth and data only)."),
  );
