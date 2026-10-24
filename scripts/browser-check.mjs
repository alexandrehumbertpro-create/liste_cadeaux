import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
const runId = Date.now(),
  listName = "Noël test " + runId,
  ideaName = "Atelier céramique " + runId,
  privateName = "SURPRISE_PRIVEE_ELISE_" + runId,
  personName = "Maman " + runId;
const accounts = JSON.parse(
  await readFile("/tmp/kad-integration-credentials.json", "utf8"),
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const origin = process.env.TEST_APP_URL || "http://localhost:3000";
let checks = 0;
async function check(name, fn) {
  await fn();
  checks++;
  console.log("✓ " + name);
}
async function login(page, who) {
  await page.goto(origin + "/login");
  await page.getByLabel("Email", { exact: true }).fill(accounts[who].email);
  await page.getByLabel("Mot de passe").fill(accounts[who].password);
  await page.getByRole("button", { name: "Ouvrir mon carnet" }).click();
  await page.getByRole("heading", { name: "Pour qui", exact: true }).waitFor();
}
const admin = await browser.newContext({
    viewport: { width: 390, height: 844 },
  }),
  page = await admin.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await check("Connexion réelle d’Alex sur mobile", () => login(page, "Alex"));
  await check("Création d’un destinataire et d’une liste", async () => {
    await page.getByRole("button", { name: "☺ Pour qui" }).click();
    await page.getByRole("button", { name: "+ Personne", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByLabel("Nom", { exact: true })
      .fill(personName);
    await page.getByRole("button", { name: "Créer la personne" }).click();
    await page
      .getByRole("heading", { name: personName, exact: true })
      .waitFor();
    await page.getByRole("button", { name: "▤ Mes listes" }).click();
    await page.getByRole("button", { name: "+ Liste", exact: true }).click();
    await page.getByLabel("Nom de la liste").fill(listName);
    await page
      .getByLabel("Message d’accueil / slogan")
      .fill("Des idées pour toute la famille");
    await page.getByRole("button", { name: "Enregistrer la liste" }).click();
    await page.getByRole("heading", { name: listName, exact: true }).waitFor();
  });
  await check("Brouillon conservé puis repris sans perte", async () => {
    await page.getByRole("button", { name: "Kad’Humbert" }).click();
    await page
      .getByRole("button", { name: "+ Idée", exact: true })
      .last()
      .click();
    await page.getByLabel("Votre idée", { exact: true }).fill(ideaName);
    await page.getByRole("button", { name: "Fermer", exact: true }).click();
    await page.reload();
    await page.getByRole("button", { name: /Brouillon :/ }).click();
    await page.getByLabel("Votre idée", { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("Votre idée", { exact: true }).inputValue(),
      ideaName,
    );
  });
  await check(
    "Publication d’une idée avec destinataire, liste, budget et priorité",
    async () => {
      const d = page.getByRole("dialog");
      await d.getByRole("button", { name: "Alex", exact: true }).click();
      await d.getByRole("button", { name: listName, exact: true }).click();
      await d.getByLabel("Qui peut voir cette idée ?").selectOption("public");
      await d
        .getByText("Prix, priorité et précisions", { exact: true })
        .click();
      await d.getByLabel("Prix minimum (€)", { exact: true }).fill("40");
      await d.getByLabel("Maximum, facultatif (€)").fill("60");
      await d.getByLabel("Priorité", { exact: true }).selectOption("0");
      await d
        .getByLabel("Précisions pour les invités")
        .fill("Pour deux personnes");
      await d
        .getByLabel("Note de gestion privée")
        .fill("NOTE_PRIVEE_INVISIBLE");
      await d.getByRole("button", { name: "Garder cette idée" }).click();
      await page
        .getByRole("button", { name: "✦ Mes idées", exact: true })
        .click();
      await page
        .getByRole("heading", { name: ideaName, exact: true })
        .waitFor();
    },
  );
  await check("Création d’une idée privée", async () => {
    await page.getByRole("button", { name: "+ Idée", exact: true }).click();
    await page.getByLabel("Votre idée", { exact: true }).fill(privateName);
    await page.getByLabel("Qui peut voir cette idée ?").selectOption("private");
    await page.getByRole("button", { name: "Garder cette idée" }).click();
    await page
      .getByRole("heading", { name: privateName, exact: true })
      .waitFor();
  });
  const sql = new pg.Client({
    connectionString: "postgresql://postgres@127.0.0.1:55432/kad_integration",
  });
  await sql.connect();
  const list = (
    await sql.query(
      "select * from public.lists where name=$1 order by created_at desc limit 1",
      [listName],
    )
  ).rows[0];
  await sql.end();
  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const guest = await guestContext.newPage();
  await check(
    "Invité sans compte : une seule liste et aucune donnée privée",
    async () => {
      await guest.goto(origin + "/l/" + list.share_token);
      await guest.getByRole("heading", { name: listName }).waitFor();
      assert.equal(await guest.getByText(privateName).count(), 0);
      assert.equal(await guest.getByText("NOTE_PRIVEE_INVISIBLE").count(), 0);
      assert.equal(
        await guest.getByText("Mes listes", { exact: true }).count(),
        0,
      );
      await guest.getByLabel("Budget maximum (€)").fill("50");
      assert.equal(
        await guest.getByRole("heading", { name: ideaName }).count(),
        1,
      );
    },
  );
  await check(
    "Réservation immédiate sans compte, nom familial et email",
    async () => {
      await guest.getByRole("button", { name: "Réserver cette idée" }).click();
      await guest.getByLabel("Votre nom, ou vos noms").fill("Sophie et Marc");
      await guest
        .getByLabel("Votre email", { exact: true })
        .fill("sophie@example.test");
      await guest
        .getByRole("button", { name: "Réserver", exact: true })
        .click();
      await guest.getByRole("link", { name: "Ma réservation" }).waitFor();
      await guest.getByRole("heading", { name: /Déjà réservés/ }).waitFor();
      await guest.screenshot({
        path: "/tmp/Kad-Humbert-application-mobile.png",
        fullPage: true,
      });
    },
  );
  await check("Identité masquée jusqu’au retournement explicite", async () => {
    await page.reload();
    await page
      .getByRole("button", { name: "✦ Mes idées", exact: true })
      .click();
    await page.getByRole("heading", { name: /Déjà réservés/ }).waitFor();
    assert.equal(
      await page.getByText("Sophie et Marc", { exact: true }).count(),
      0,
    );
    await page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", { name: ideaName, exact: true }),
      })
      .getByRole("button", { name: "Retourner pour découvrir qui" })
      .click();
    await page.getByText("Sophie et Marc", { exact: true }).waitFor();
  });
  await check("Elise ne reçoit pas l’idée privée dans la page", async () => {
    const ctx = await browser.newContext(),
      elise = await ctx.newPage();
    await login(elise, "Elise");
    assert.equal(await elise.getByText(privateName).count(), 0);
    assert.ok(!(await elise.content()).includes(privateName));
    await ctx.close();
  });
  await check(
    "Bouton + Idée visible après défilement, aucun débordement mobile ou ordinateur",
    async () => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const box = await page
        .getByRole("button", { name: "+ Idée", exact: true })
        .boundingBox();
      assert.ok(box.y + box.height <= 844);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.setViewportSize({ width: 1440, height: 1000 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: "/tmp/Kad-Humbert-application-ordinateur.png",
        fullPage: true,
      });
    },
  );
  await check(
    "Modifier et archiver depuis une liste, puis annuler l’archivage",
    async () => {
      await page.getByRole("button", { name: "▤ Mes listes" }).click();
      await page.getByRole("heading", { name: listName, exact: true }).click();
      const card = page.getByRole("article").filter({
        has: page.getByRole("heading", { name: ideaName, exact: true }),
      });
      await card.getByRole("button", { name: "Modifier", exact: true }).click();
      await page
        .getByRole("dialog")
        .getByLabel("Précisions pour les invités")
        .fill("Pour deux personnes · débutants");
      await page
        .getByRole("button", { name: "Enregistrer les modifications" })
        .click();
      await page
        .getByRole("heading", { name: listName, exact: true })
        .waitFor();
      await card
        .getByText("Pour deux personnes · débutants", { exact: true })
        .waitFor();
      await card
        .getByRole("checkbox", { name: "Sélectionner " + ideaName })
        .check();
      await page
        .getByRole("button", { name: /1 sélectionnée · Actions/ })
        .click();
      await page
        .getByRole("button", { name: "Appliquer", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Annuler le dernier archivage" })
        .waitFor();
      await page
        .getByRole("button", { name: "Annuler le dernier archivage" })
        .click();
      await page
        .getByRole("heading", { name: ideaName, exact: true })
        .waitFor();
    },
  );
  await check("L’invité peut annuler depuis son lien personnel", async () => {
    await guest.getByRole("link", { name: "Ma réservation" }).click();
    await guest.getByRole("heading", { name: "Votre réservation" }).waitFor();
    await guest.bringToFront();
    await guest.waitForLoadState("networkidle");
    guest.once("dialog", (dialog) => dialog.accept());
    await guest.getByRole("button", { name: "Annuler ma réservation" }).click();
    await guest
      .getByText("Cette réservation a été annulée.", { exact: true })
      .waitFor();
  });
  await check("Un lien partagé est conservé pendant la connexion", async () => {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
      }),
      shared = await ctx.newPage();
    await shared.goto(
      origin +
        "/?title=" +
        encodeURIComponent("Idée partagée") +
        "&url=" +
        encodeURIComponent("https://example.com/gift"),
    );
    await shared.getByLabel("Email", { exact: true }).fill(accounts.Alex.email);
    await shared.getByLabel("Mot de passe").fill(accounts.Alex.password);
    await shared.getByRole("button", { name: "Ouvrir mon carnet" }).click();
    await shared.getByRole("dialog").waitFor();
    assert.equal(
      await shared.getByLabel("Votre idée", { exact: true }).inputValue(),
      "Idée partagée",
    );
    assert.equal(
      await shared.getByLabel("Lien du produit").inputValue(),
      "https://example.com/gift",
    );
    await ctx.close();
  });
  assert.deepEqual(errors, []);
  console.log(`${checks} parcours navigateur réussis.`);
} finally {
  await browser.close();
}
