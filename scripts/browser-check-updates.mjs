// Disposable local integration stack only. Metadata response is mocked for UI checks; parser has separate tests.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const origin = process.env.TEST_APP_URL || "http://localhost:3000";
(async () => {
  const accounts = JSON.parse(
    readFileSync("/tmp/kad-integration-credentials.json"),
  );
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  let errors = [];
  for (const width of [390, 1440]) {
    const c = await browser.newContext({ viewport: { width, height: 1000 } });
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(origin + "/login");
    await p.getByLabel("Email", { exact: true }).fill(accounts.Alex.email);
    await p.getByLabel("Mot de passe").fill(accounts.Alex.password);
    await p.getByRole("button", { name: "Ouvrir mon carnet" }).click();
    await p
      .getByRole("heading", { name: "Pour qui", exact: true })
      .waitFor({ timeout: 10000 })
      .catch(async (e) => {
        throw e;
      });
    assert.match(
      (await p.locator("nav button").allTextContents()).join("|"),
      /Pour qui.*Mes listes.*Mes idées.*À classer.*Archives/,
    );
    await p.getByRole("button", { name: "✦ Mes idées", exact: true }).click();
    const grid = p.locator(".grid").first();
    assert.equal(
      await grid.evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
      width < 768 ? 2 : 3,
    );
    await p.screenshot({
      path: `/tmp/kad-update-${width}.png`,
      fullPage: true,
    });
    await p
      .locator(".gift-image img,.gift-image > span:not(.badge)")
      .first()
      .click();
    await p.getByRole("dialog").waitFor();
    await p.getByRole("button", { name: "Fermer", exact: true }).click();
    const firstCard = p.locator(".gift-card").first();
    await firstCard.locator(".recipient").click();
    await p.getByRole("dialog").waitFor();
    await p.getByRole("button", { name: "Fermer", exact: true }).click();
    const box = await firstCard.boundingBox();
    await firstCard.click({
      position: { x: box.width - 6, y: box.height / 2 },
    });
    await p.getByRole("dialog").waitFor();
    await p.getByRole("button", { name: "Fermer", exact: true }).click();
    await firstCard.getByRole("checkbox").check();
    assert.equal(await p.getByRole("dialog").count(), 0);
    await firstCard.getByRole("checkbox").uncheck();
    await firstCard.locator(".card-open").focus();
    await p.keyboard.press("Enter");
    await p.getByRole("dialog").waitFor();
    await p.getByRole("button", { name: "Fermer", exact: true }).click();

    await p.getByRole("button", { name: "+ Idée", exact: true }).last().click();
    if (await p.getByRole("button", { name: /nouvelle idée/i }).count())
      await p.getByRole("button", { name: /nouvelle idée/i }).click();
    const dlg = p.getByRole("dialog");
    await dlg
      .getByLabel("Lien du produit")
      .fill("https://shop.example/ceramique");
    await p.route("**/api/metadata", (r) =>
      r.fulfill({
        json: {
          title: "Atelier import " + width,
          description: "Deux heures de création",
          price: 49.9,
          image: "https://images.example.test/photo.jpg",
        },
      }),
    );
    await p.route("https://images.example.test/photo.jpg", (r) =>
      r.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="pink"/></svg>',
      }),
    );
    await dlg.getByRole("button", { name: "Récupérer", exact: true }).click();
    await dlg.locator(".metadata-preview img").waitFor();
    assert.equal(
      await dlg.getByLabel("Votre idée", { exact: true }).inputValue(),
      "Atelier import " + width,
    );
    assert.equal(
      await dlg.getByLabel("Prix minimum (€)", { exact: true }).inputValue(),
      "49.9",
    );
    assert.equal(
      await dlg.getByLabel("Qui peut voir cette idée ?").inputValue(),
      "public",
    );
    assert.equal(
      await dlg.getByText("Destinataire choisi pour cette proposition").count(),
      0,
    );
    assert.equal(
      await dlg.getByText("✨ Toutes les listes", { exact: true }).count(),
      0,
    );
    await dlg.getByRole("button", { name: "Alex", exact: true }).click();
    await dlg.getByRole("button", { name: "Elise", exact: true }).click();
    await dlg
      .getByRole("button", { name: "Garder cette idée", exact: true })
      .click();
    await dlg.waitFor({ state: "hidden" });
    await p.getByRole("button", { name: /À classer/ }).click();
    assert.equal(
      await p
        .getByRole("heading", { name: "Atelier import " + width, exact: true })
        .count(),
      0,
    );
    await p.getByRole("button", { name: "▤ Mes listes", exact: true }).click();
    await p
      .locator(".list-card img,.list-card .cover-placeholder")
      .first()
      .click();
    const preview = p.getByRole("link", {
      name: "Afficher la liste en mode invité ↗",
    });
    await preview.waitFor();
    assert.match(await preview.getAttribute("href"), /^\/l\//);
    await p.getByRole("button", { name: "La Hotte Humbert" }).click();
    await p.getByRole("heading", { name: "Pour qui", exact: true }).waitFor();
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await c.close();
    console.log(
      "PASS " +
        width +
        "px: login, home, grids, image clicks, metadata preview, save, inbox, guest shortcut",
    );
  }
  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
