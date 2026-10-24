// Disposable local integration stack only.
import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
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
try {
  const p = await browser.newPage({ viewport: { width: 390, height: 950 } });
  await p.goto(origin + "/login");
  await p.getByLabel("Email", { exact: true }).fill(accounts.Alex.email);
  await p.getByLabel("Mot de passe").fill(accounts.Alex.password);
  await p.getByRole("button", { name: "Ouvrir mon carnet" }).click();
  await p.getByRole("heading", { name: "Pour qui", exact: true }).waitFor();
  const name = "Couleur test " + Date.now();
  await p.getByRole("button", { name: "+ Personne", exact: true }).click();
  let d = p.getByRole("dialog");
  await d.getByLabel("Nom", { exact: true }).fill(name);
  await d.getByRole("button", { name: "Menthe", exact: true }).click();
  await d.getByRole("button", { name: "Créer la personne" }).click();
  await d.waitFor({ state: "hidden" });
  let card = p
    .locator(".person-card")
    .filter({ has: p.getByRole("heading", { name, exact: true }) });
  await expect(card).toHaveCSS("background-color", "rgb(215, 239, 223)");
  await card
    .getByRole("button", { name: "Changer la couleur de " + name })
    .click();
  d = p.getByRole("dialog");
  await d.getByLabel("Couleur personnalisée").fill("#102030");
  await d.getByRole("button", { name: "Enregistrer la couleur" }).click();
  await d.waitFor({ state: "hidden" });
  await expect(card).toHaveCSS("background-color", "rgb(16, 32, 48)");
  await expect(card).toHaveCSS("color", "rgb(255, 255, 255)");
  await p.reload();
  card = p
    .locator(".person-card")
    .filter({ has: p.getByRole("heading", { name, exact: true }) });
  await expect(card).toHaveCSS("background-color", "rgb(16, 32, 48)");
  await p.getByRole("button", { name: "+ Idée", exact: true }).last().click();
  d = p.getByRole("dialog");
  const chip = d.getByRole("button", { name, exact: true });
  await expect(chip).toHaveCSS("background-color", "rgb(16, 32, 48)");
  await chip.click();
  assert.equal(await chip.getAttribute("aria-pressed"), "true");
  await expect(d).toBeVisible();
  await d.getByRole("button", { name: "+ Personne", exact: true }).click();
  const inlineName = name + " inline";
  await d
    .getByLabel("Nom de la nouvelle personne", { exact: true })
    .fill(inlineName);
  await d.getByRole("button", { name: "Rose", exact: true }).click();
  await d.getByRole("button", { name: "Créer et sélectionner" }).click();
  const inlineChip = d.getByRole("button", { name: inlineName, exact: true });
  await expect(inlineChip).toHaveCSS("background-color", "rgb(249, 220, 230)");
  assert.equal(await inlineChip.getAttribute("aria-pressed"), "true");
  await expect(d).toBeVisible();
  await p.getByRole("button", { name: "Fermer", exact: true }).click();
  console.log(
    "PASS: recipient color at creation, custom color edit, reload persistence, readable contrast and matching selected chip",
  );
} finally {
  await browser.close();
}
