// Local fixtures only: no real Supabase account or outgoing email is used.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const token = randomUUID(),
  listId = randomUUID(),
  alex = randomUUID(),
  elise = randomUUID(),
  common = randomUUID();
const records = [];
const make = (title, person, price, priority, date, reserved = false) => ({
  id: randomUUID(),
  title,
  description:
    "Une description complète à découvrir dans la fiche cadeau. Choisissez ensemble le modèle qui vous plaît.",
  specifications: "Couleur bleue, taille à confirmer",
  url: "https://shop.example.test/product",
  imageUrl: null,
  imageCredit: null,
  priceMin: price,
  priceMax: null,
  priority,
  recipient:
    person === alex ? "Alex" : person === elise ? "Elise" : "Commun E&A",
  recipientId: person,
  recipientColor: person === elise ? "#d8f36a" : "#3155ff",
  createdAt: date,
  collective: false,
  targetAmount: null,
  contributed: 0,
  reserved,
});
const gifts = [
  make("Une belle lampe", alex, 40, 1, "2026-09-01"),
  make("Atelier de céramique", elise, 25, 0, "2026-10-25"),
  make("Un week-end à deux", common, 120, 2, "2026-08-01"),
  make("Un livre", alex, 10, 2, "2026-10-26", true),
];
const list = {
  id: listId,
  name: "Les envies de Noël",
  slogan: "Un peu de magie sous le sapin.",
  imageUrl: null,
  archived: false,
  gifts,
};
const api = createServer(async (req, res) => {
  let text = "";
  for await (const chunk of req) text += chunk;
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/cover.svg") {
    res.setHeader("Content-Type", "image/svg+xml");
    res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#e9eeff"/><circle cx="160" cy="120" r="70" fill="#3155ff"/><path d="M130 90h60v70h-60z" fill="#d8f36a"/></svg>',
    );
    return;
  }
  const body = text ? JSON.parse(text) : {};
  if (req.url === "/rest/v1/rpc/shared_list") {
    res.end(JSON.stringify(list));
    return;
  }
  if (req.url === "/rest/v1/rpc/rate_limit") {
    records.push({ type: "rate", body });
    res.end("true");
    return;
  }
  if (req.url === "/rest/v1/rpc/submit_gift_question") {
    records.push({ type: "question", body });
    res.end(JSON.stringify(randomUUID()));
    return;
  }
  if (req.url === "/rest/v1/rpc/reserve_gift") {
    records.push({ type: "reserve", body });
    gifts.find((g) => g.id === body.gift).reserved = true;
    res.end(JSON.stringify({ accessToken: randomUUID() }));
    return;
  }
  if (req.url.startsWith("/rest/v1/email_jobs")) {
    res.end(JSON.stringify({ status: "pending" }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "Unexpected fixture route" }));
});
await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
const apiOrigin = "http://127.0.0.1:" + api.address().port;
list.imageUrl = apiOrigin + "/cover.svg";
for (const g of gifts) g.imageUrl = apiOrigin + "/cover.svg";
const appPort = 3065,
  origin = "http://127.0.0.1:" + appPort;
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(appPort),
  ],
  {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: apiOrigin,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-only-anon",
      SUPABASE_SERVICE_ROLE_KEY: "test-only-service",
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
    logs = (logs + b.toString()).slice(-5000);
  });
let browser;
try {
  let ready = false;
  for (let n = 0; n < 50; n++) {
    try {
      const r = await fetch(origin + "/login", {
        signal: AbortSignal.timeout(3000),
      });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!ready) throw Error("Local Next server not ready: " + logs);
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 1000 },
  });
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) =>
    r.abort(),
  );
  await page.goto(origin + "/l/" + token);
  await page.getByRole("heading", { name: list.name }).waitFor();
  const cards = page.locator(".guest .gift-card");
  await expect(cards).toHaveCount(4);
  for (const width of [390, 320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const cover = await page
      .getByAltText("Couverture de la liste")
      .boundingBox();
    const intro = await page.locator(".guest-intro").boundingBox();
    assert.ok(cover.x > intro.x);
    assert.ok(cover.width <= (width < 768 ? 90 : 162));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "/tmp/la-hotte-invites-" + width + ".png",
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await page
    .locator(".guest-people")
    .getByRole("button", { name: "Alex", exact: true })
    .click();
  await page
    .locator(".guest-people")
    .getByRole("button", { name: "Elise", exact: true })
    .click();
  await expect(cards).toHaveCount(3);
  await expect(
    page
      .locator(".guest-people")
      .getByRole("button", { name: "✓ Elise", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Tout le monde", exact: true })
    .click();
  await expect(cards).toHaveCount(4);
  await page
    .getByLabel("Trier par", { exact: true })
    .selectOption("price_desc");
  await expect(cards.first()).toContainText("Un week-end à deux");
  await page.getByLabel("Trier par", { exact: true }).selectOption("price_asc");
  await expect(cards.first()).toContainText("Atelier de céramique");
  await expect(cards.last()).toContainText("Déjà réservé");
  await page.getByLabel("Trier par", { exact: true }).selectOption("newest");
  await expect(cards.first()).toContainText("Atelier de céramique");
  await page.getByLabel("Budget max (€)", { exact: true }).fill("30");
  await expect(cards).toHaveCount(2);
  await page.getByLabel("Budget max (€)", { exact: true }).fill("");
  const title = page.getByRole("button", {
    name: "Atelier de céramique",
    exact: true,
  });
  await title.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(title).toBeFocused();
  await cards
    .filter({ hasText: "Atelier de céramique" })
    .locator(".gift-image")
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Une description complète");
  await dialog
    .getByRole("button", { name: "Poser une question", exact: true })
    .click();
  await dialog.getByLabel("Votre nom", { exact: true }).fill("Sophie");
  await dialog
    .getByLabel("Votre email", { exact: true })
    .fill("sophie@example.test");
  await dialog
    .getByLabel("Votre question", { exact: true })
    .fill("Quelle couleur choisir ?");
  await dialog
    .getByRole("button", { name: "Envoyer à Alex et Elise", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Votre question est enregistrée",
  );
  assert.equal(records.filter((r) => r.type === "question").length, 1);
  assert.equal(records.find((r) => r.type === "rate").body.max_requests, 5);
  assert.equal(
    records.find((r) => r.type === "question").body.gift,
    gifts[1].id,
  );
  await page.keyboard.press("Escape");
  await cards
    .filter({ hasText: "Atelier de céramique" })
    .getByRole("button", { name: "Réserver cette idée" })
    .click();
  const reserve = page.getByRole("dialog");
  await reserve
    .getByLabel("Votre nom, ou vos noms", { exact: true })
    .fill("Sophie et Marc");
  await reserve
    .getByLabel("Votre email", { exact: true })
    .fill("sophie@example.test");
  await reserve.getByRole("button", { name: "Réserver", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Ma réservation", exact: true }),
  ).toBeVisible();
  assert.equal(records.filter((r) => r.type === "reserve").length, 1);
  console.log(
    "Guest browser: compact cover, 320/390/1440 px, multi-person filters, sorting, detail clicks, focus restore, question and reservation passed.",
  );
} catch (e) {
  console.error(logs);
  throw e;
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  api.close();
}
