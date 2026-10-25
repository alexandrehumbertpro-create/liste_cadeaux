// Synthetic local accounts, speech and Supabase only. No microphone, production data or emails.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const actor = randomUUID();
const user = {
  id: actor,
  aud: "authenticated",
  role: "authenticated",
  email: "alex@example.test",
  app_metadata: {},
  user_metadata: {},
};
const recipients = [
  { id: randomUUID(), name: "Alex", is_common: false, color: "#3155ff" },
  { id: randomUUID(), name: "Élise", is_common: false, color: "#d8f36a" },
  { id: randomUUID(), name: "Commun E&A", is_common: true, color: "#e9eeff" },
];
const profile = {
  id: actor,
  email: user.email,
  display_name: "Alex",
  preferences: {},
};
const lists = [
  {
    id: randomUUID(),
    name: "Noël",
    archived_at: null,
    share_token: randomUUID(),
    created_at: "2026-01-01",
    image_url: null,
    slogan: "",
  },
  {
    id: randomUUID(),
    name: "Anniversaire",
    archived_at: null,
    share_token: randomUUID(),
    created_at: "2026-01-01",
    image_url: null,
    slogan: "",
  },
];
const records = [];
const routes = [];
let failSave = false;
const api = createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  res.setHeader("Content-Type", "application/json");
  const url = new URL(req.url, "http://localhost");
  routes.push(req.method + " " + url.pathname);
  if (url.pathname === "/auth/v1/user") {
    res.end(JSON.stringify(user));
    return;
  }
  if (url.pathname === "/rest/v1/rpc/save_gift_for_recipients") {
    records.push(JSON.parse(raw).data);
    if (failSave) {
      res.statusCode = 503;
      res.end(JSON.stringify({ message: "Connection lost", code: "PGRST000" }));
      return;
    }
    res.end(JSON.stringify(randomUUID()));
    return;
  }
  if (url.pathname === "/rest/v1/admin_mailboxes") {
    res.end("null");
    return;
  }
  const table = url.pathname.replace("/rest/v1/", "");
  const rows = {
    profiles: [profile],
    recipients,
    ideas: [],
    proposals: [],
    lists,
    activity: [],
    share_history: [],
  }[table];
  if (rows) {
    res.end(
      JSON.stringify(
        req.headers.accept?.includes("vnd.pgrst.object") ? rows[0] : rows,
      ),
    );
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "Unexpected fixture request" }));
});
await new Promise((r) => api.listen(0, "127.0.0.1", r));
const apiOrigin = "http://127.0.0.1:" + api.address().port;
const origin = "http://127.0.0.1:3066";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3066",
  ],
  {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: apiOrigin,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon",
      SUPABASE_SERVICE_ROLE_KEY: "test-service",
      APP_URL: origin,
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
for (const stream of [child.stdout, child.stderr])
  stream.on("data", (b) => {
    logs = (logs + b.toString()).slice(-6000);
  });
let browser;
try {
  let ready = false;
  for (let n = 0; n < 50; n++) {
    try {
      if (
        (await fetch(origin + "/login", { signal: AbortSignal.timeout(3000) }))
          .ok
      ) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  assert.ok(ready, logs);
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 900 },
  });
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: actor, exp: expires, role: "authenticated" })}.test`;
  await ctx.addCookies([
    {
      name: "sb-127-auth-token",
      value:
        "base64-" +
        b64({
          access_token: token,
          refresh_token: "test",
          expires_at: expires,
          expires_in: 3600,
          token_type: "bearer",
          user,
        }),
      url: origin,
    },
  ]);
  await ctx.addInitScript(() => {
    class FakeSpeech {
      static current;
      start() {
        FakeSpeech.current = this;
        window.testSpeech = this;
      }
      abort() {
        window.abortCount = (window.abortCount || 0) + 1;
      }
      stop() {
        this.onend?.();
      }
      emit(text, confidence = 0.95, isFinal = true) {
        this.onresult?.({
          results: [{ isFinal, 0: { transcript: text, confidence } }],
        });
      }
      finish(text, confidence = 0.95) {
        this.emit(text, confidence);
        this.onend?.();
      }
    }
    window.SpeechRecognition = FakeSpeech;
  });
  const p = await ctx.newPage();
  await p.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) =>
    r.abort(),
  );
  await p.goto(origin);
  await p.getByRole("heading", { name: "Pour qui", exact: true }).waitFor();
  for (const width of [320, 390, 1440]) {
    await p.setViewportSize({ width, height: 900 });
    const mic = await p
      .getByRole("button", { name: "Dicter une idée", exact: true })
      .boundingBox();
    const add = await p.locator(".capture-sticky .add-sticky").boundingBox();
    assert.ok(
      mic.width >= 44 && mic.height >= 44 && mic.x + mic.width <= add.x,
    );
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  }
  await p.setViewportSize({ width: 390, height: 900 });
  // Natural browser pauses must never save; explicit Finish submits all cycles.
  await p.getByRole("button", { name: "Dicter une idée", exact: true }).click();
  await expect(p.getByText("Je vous écoute…", { exact: true })).toBeVisible();
  await p.evaluate(() => {
    window.testFirst = window.testSpeech;
    window.testSpeech.finish("Ajoute un atelier de céramique");
  });
  await p.waitForFunction(() => window.testSpeech !== window.testFirst);
  assert.equal(records.length, 0);
  await expect(p.getByText("Je vous écoute…", { exact: true })).toBeVisible();
  await p.evaluate(() => {
    window.testFirst = window.testSpeech;
    window.testSpeech.finish("pour Elise");
  });
  await p.waitForFunction(() => window.testSpeech !== window.testFirst);
  assert.equal(records.length, 0);
  await p.evaluate(() =>
    window.testSpeech.emit(
      "dans les listes Noël et Anniversaire à soixante euros priorité haute visibilité nous deux",
    ),
  );
  await p
    .getByRole("button", { name: "Terminer la dictée", exact: true })
    .click();
  await expect(
    p.getByRole("heading", { name: "✓ Idée ajoutée" }),
  ).toBeVisible();
  assert.equal(records.length, 1);
  assert.equal(records[0].title, "un atelier de céramique");
  assert.deepEqual(records[0].candidates, [recipients[1].id]);
  assert.equal(records[0].priceMin, 60);
  assert.deepEqual(
    records[0].listIds,
    lists.map((l) => l.id),
  );
  assert.equal(records[0].priority, 1);
  assert.equal(records[0].visibility, "household");
  await p.getByRole("button", { name: "Terminé", exact: true }).click();
  await expect(
    p.getByRole("button", { name: "Dicter une idée", exact: true }),
  ).toBeFocused();
  // Unknown name asks for precision, never falls back to the current person.
  await p.getByRole("button", { name: "Dicter une idée", exact: true }).click();
  await p.evaluate(() =>
    window.testSpeech.emit("Une lampe pour Alice dans la liste Vacances"),
  );
  await p
    .getByRole("button", { name: "Terminer la dictée", exact: true })
    .click();
  await expect(p.getByText(/Pour qui est cette idée/)).toBeVisible();
  assert.equal(records.length, 1);
  await expect(p.getByText(/Quelle liste/)).toBeVisible();
  await expect(p.getByLabel("Priorité", { exact: true })).toHaveValue("");
  await expect(p.getByLabel("Visibilité", { exact: true })).toHaveValue("");
  await p.getByRole("button", { name: "Noël", exact: true }).click();
  await p.getByRole("button", { name: "Élise", exact: true }).click();
  await p
    .getByRole("button", { name: "Ajouter cette idée", exact: true })
    .dblclick();
  await expect(
    p.getByRole("heading", { name: "✓ Idée ajoutée" }),
  ).toBeVisible();
  assert.equal(records.length, 2);
  await p.getByRole("button", { name: "Terminé", exact: true }).click();
  // Low recognition confidence requests a check; re-dictating starts clean.
  await p.getByRole("button", { name: "Dicter une idée", exact: true }).click();
  await p.evaluate(() => window.testSpeech.emit("Un livre pour Alex", 0.3));
  await p
    .getByRole("button", { name: "Terminer la dictée", exact: true })
    .click();
  await expect(p.getByText(/Ai-je bien entendu/)).toBeVisible();
  assert.equal(records.length, 2);
  await p.getByRole("button", { name: "🎤 Redicter", exact: true }).click();
  await expect(p.getByText("Je vous écoute…", { exact: true })).toBeVisible();
  await p.evaluate(() =>
    window.testSpeech.emit("Un livre pour Alex moi uniquement"),
  );
  await p
    .getByRole("button", { name: "Terminer la dictée", exact: true })
    .click();
  await expect(
    p.getByRole("heading", { name: "✓ Idée ajoutée" }),
  ).toBeVisible();
  assert.equal(records[2].visibility, "private");
  await p.getByRole("button", { name: "Terminé", exact: true }).click();
  // Closing during speech aborts recognition and cannot save a late result.
  await p.getByRole("button", { name: "Dicter une idée", exact: true }).click();
  await p.evaluate(() => window.testSpeech.emit("Une lampe pour Alex"));
  await p.keyboard.press("Escape");
  await p.evaluate(() => window.testSpeech.finish("Une lampe pour Alex"));
  assert.equal(records.length, 3);
  // Permission errors never save; the existing form stays reachable.
  await p.getByRole("button", { name: "Dicter une idée", exact: true }).click();
  await p.evaluate(() => {
    window.testSpeech.onerror({ error: "not-allowed" });
    window.testSpeech.onend?.();
  });
  await expect(p.getByRole("dialog").getByRole("alert")).toContainText(
    "Autorisez le microphone",
  );
  assert.equal(records.length, 3);
  await p.getByRole("button", { name: "Fermer", exact: true }).click();
  // Unknown save outcome is never blindly retried.
  failSave = true;
  await p.getByRole("button", { name: "Dicter une idée", exact: true }).click();
  await p.evaluate(() => window.testSpeech.emit("Un vélo pour Alex"));
  await p
    .getByRole("button", { name: "Terminer la dictée", exact: true })
    .click();
  await expect(p.getByRole("dialog").getByRole("alert")).toContainText(
    "vérifiez dans Mes idées",
  );
  await expect(
    p.getByRole("button", { name: "Ajouter cette idée", exact: true }),
  ).toHaveCount(0);
  await p
    .getByRole("button", { name: "Fermer et vérifier mes idées", exact: true })
    .click();
  assert.equal(records.length, 4);
  await p.evaluate(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  });
  await p.getByRole("button", { name: "Dicter une idée", exact: true }).click();
  await expect(p.getByText(/Ce navigateur ne propose pas/)).toBeVisible();
  await p.getByRole("button", { name: "Fermer", exact: true }).click();
  await p.locator(".capture-sticky .add-sticky").click();
  await expect(
    p.getByRole("heading", { name: "Une nouvelle idée", exact: true }),
  ).toBeVisible();
  console.log(
    "PASS: microphone placement at 320/390/1440, explicit-finish only across pauses, all dictated fields and lists, no inferred fields, recipient/list clarification, low confidence, private idea, Escape cancellation, focus restoration, denied/unsupported microphone, uncertain-save guard, manual form preserved.",
  );
} catch (e) {
  console.error(logs, routes, { saves: records.length });
  throw e;
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  await new Promise((r) => api.close(r));
}
