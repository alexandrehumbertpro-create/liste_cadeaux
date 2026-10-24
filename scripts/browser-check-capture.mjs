// Local disposable integration stack only. Never run against a production app.
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import pg from "pg";
const origin = process.env.TEST_APP_URL || "http://localhost:3000";
if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(origin))
  throw Error("Local test origin required");
const accounts = JSON.parse(
  await readFile("/tmp/kad-integration-credentials.json", "utf8"),
);
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 1000 },
});
const p = await context.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const title = "Camera test " + Date.now(),
  listName = "Test cadeaux " + Date.now();
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="pink" width="200" height="200"/></svg>';
await context.route("https://images.example.test/**", (r) =>
  r.fulfill({ contentType: "image/svg+xml", body: svg }),
);
const sql = new pg.Client({
  connectionString: "postgresql://postgres@127.0.0.1:55432/kad_integration",
});
await sql.connect();
try {
  await p.goto(origin + "/login");
  await p.getByLabel("Email", { exact: true }).fill(accounts.Alex.email);
  await p.getByLabel("Mot de passe").fill(accounts.Alex.password);
  await p.getByRole("button", { name: "Ouvrir mon carnet" }).click();
  await p.getByRole("heading", { name: "Pour qui", exact: true }).waitFor();
  await p.getByRole("button", { name: "▤ Mes listes", exact: true }).click();
  await p.getByRole("button", { name: "+ Liste", exact: true }).click();
  let d = p.getByRole("dialog");
  await d.getByLabel("Nom de la liste").fill(listName);
  await d
    .getByLabel("URL de l’image")
    .fill("https://images.example.test/cover.jpg");
  await d.locator(".cover-preview").waitFor();
  await d.getByRole("button", { name: "Enregistrer la liste" }).click();
  await p.getByRole("heading", { name: listName, exact: true }).waitFor();
  await p.getByRole("heading", { name: listName, exact: true }).click();
  await p
    .getByRole("heading", { name: listName, level: 1, exact: true })
    .waitFor();
  await p.getByRole("button", { name: "+ Idée", exact: true }).last().click();
  d = p.getByRole("dialog");
  await d.getByLabel("Votre idée", { exact: true }).fill(title);
  const box = await d.boundingBox();
  await p.mouse.click(box.x + 4, box.y + Math.min(100, box.height / 2));
  assert.equal(await d.count(), 1, "Click in dialog padding must not close");
  const titleBox = await d
    .getByLabel("Votre idée", { exact: true })
    .boundingBox();
  await p.mouse.move(titleBox.x + 15, titleBox.y + 15);
  await p.mouse.down();
  await p.mouse.move(2, 2);
  await p.mouse.up();
  assert.equal(await d.count(), 1, "Dragging outside must not close");
  await p.keyboard.press("Escape");
  await d.waitFor({ state: "hidden" });
  await p.getByRole("button", { name: "+ Idée", exact: true }).last().click();
  d = p.getByRole("dialog");
  await d.getByText(title, { exact: true }).waitFor();
  await d.getByRole("button", { name: "Reprendre", exact: true }).click();
  d = p.getByRole("dialog");
  assert.equal(
    await d.getByLabel("Votre idée", { exact: true }).inputValue(),
    title,
  );
  await p.route("**/api/metadata", (r) =>
    r.fulfill({
      status: 400,
      json: {
        error:
          "Le site marchand bloque l’accès automatique à cette fiche produit.",
      },
    }),
  );
  await d
    .getByLabel("Lien du produit")
    .fill("https://shop.example.test/product");
  await d.getByRole("button", { name: "Récupérer", exact: true }).click();
  await d.locator('.metadata-action [role="alert"]').waitFor();
  assert.equal(await d.locator('[role="alert"]').count(), 1);
  await d.getByLabel("Importer une photo").setInputFiles({
    name: "broken.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("not an image"),
  });
  await d.getByText(/Cette image ne peut pas être lue/).waitFor();
  assert.equal(await d.count(), 1);
  assert.equal(
    await d.getByLabel("Prendre une photo").getAttribute("capture"),
    "environment",
  );
  await d
    .getByLabel("URL de l’image")
    .fill("https://images.example.test/gift.jpg");
  await d.locator(".metadata-preview img").waitFor();
  await d.getByRole("button", { name: "Alex", exact: true }).click();
  assert.equal(await d.getByText(/Destinataire choisi/).count(), 0);
  assert.equal(await d.getByText("+ Destinataire", { exact: true }).count(), 0);
  await d.getByRole("button", { name: "Garder cette idée" }).click();
  await d.waitFor({ state: "hidden" });
  console.log(
    "PASS: draft identity, modal padding/drag/Escape, nearby extraction errors, camera error handling, idea/list image URLs",
  );
  const list = (
    await sql.query("select * from lists where name=$1", [listName])
  ).rows[0];
  const actor = (
    await sql.query("select id from profiles where email=$1", [
      accounts.Alex.email,
    ])
  ).rows[0].id;
  const recipient = (
    await sql.query("select id from recipients where name='Alex'")
  ).rows[0].id;
  for (const priority of [0, 1]) {
    await sql.query("begin");
    await sql.query("select set_config('request.jwt.claim.sub',$1,true)", [
      actor,
    ]);
    await sql.query("select save_gift_for_recipients($1::jsonb)", [
      {
        title: title + " " + priority,
        description:
          priority === 0 ? "A much longer description. ".repeat(12) : "",
        specifications: "",
        privateNote: "",
        url: "",
        imageUrl: "https://images.example.test/gift.jpg",
        imageCredit: null,
        priceMin: 40,
        priceMax: null,
        visibility: "public",
        candidates: [recipient],
        recipientId: recipient,
        listIds: [list.id],
        global: false,
        priority,
        collective: false,
        targetAmount: null,
      },
    ]);
    await sql.query("commit");
  }
  const guest = await context.newPage();
  await guest.goto(origin + "/l/" + list.share_token);
  await guest.locator(".gift-card").first().waitFor();
  for (const width of [390, 1440]) {
    await guest.setViewportSize({ width, height: 1100 });
    await guest.getByLabel("Priorité", { exact: false }).selectOption("1");
    assert.equal(await guest.locator(".gift-card").count(), 1);
    await guest
      .locator(".badge")
      .filter({ hasText: "★ Idée prioritaire" })
      .waitFor();
    await guest.getByLabel("Priorité", { exact: false }).selectOption("0");
    assert.equal(await guest.locator(".gift-card").count(), 1);
    await guest.getByLabel("Priorité", { exact: false }).selectOption("2");
    assert.equal(await guest.locator(".gift-card").count(), 1);
    await guest.getByLabel("Priorité", { exact: false }).selectOption("");
    const positions = await guest.locator(".gift-card").evaluateAll((cards) =>
      cards.map((c) => {
        const a = c.getBoundingClientRect(),
          b = c
            .querySelector("button.reservation-action")
            .getBoundingClientRect();
        return { top: Math.round(a.top), bottom: b.bottom };
      }),
    );
    for (const a of positions)
      for (const b of positions)
        if (a.top === b.top)
          assert.ok(
            Math.abs(a.bottom - b.bottom) < 2,
            "Reserve buttons aligned by row",
          );
    assert.equal(
      await guest.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  const card = guest
    .locator(".gift-card")
    .filter({ has: guest.getByRole("heading", { name: title, exact: true }) });
  await card.getByRole("button", { name: "Réserver cette idée" }).click();
  await guest.getByLabel("Votre nom, ou vos noms").fill("Famille Test");
  await guest.getByLabel("Votre email").fill("guest@example.test");
  await guest.getByRole("button", { name: "Réserver", exact: true }).click();
  await card.locator(".reserved-badge").waitFor();
  assert.equal(
    await card.evaluate((c) => getComputedStyle(c).filter),
    "grayscale(1)",
  );
  await p.reload();
  await p.getByRole("button", { name: "▤ Mes listes", exact: true }).click();
  await p.getByRole("heading", { name: listName, exact: true }).click();
  p.once("dialog", (dialog) => dialog.accept());
  await p
    .locator(".gift-card")
    .filter({ has: p.getByRole("heading", { name: title, exact: true }) })
    .getByRole("button", { name: "Déréserver cette idée" })
    .click();
  await p.getByText(/Réservation annulée, cadeau disponible/).waitFor();
  await guest.reload();
  await guest
    .locator(".gift-card")
    .filter({ has: guest.getByRole("heading", { name: title, exact: true }) })
    .getByRole("button", { name: "Réserver cette idée" })
    .waitFor();
  // Close only through actual outside clicks or the explicit close button.
  await p.getByRole("button", { name: "+ Idée", exact: true }).last().click();
  await p.getByRole("dialog").waitFor();
  await p.mouse.click(2, 2);
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: guest priorities, button alignment 390/1440px, reserved badge, admin unreserve, outside close",
  );
} finally {
  await sql.end();
  await browser.close();
}
