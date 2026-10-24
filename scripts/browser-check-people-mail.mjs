// Disposable local integration only. No Google account is connected and no email is sent.
import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import pg from "pg";
const origin = process.env.TEST_APP_URL || "http://localhost:3000";
if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(origin))
  throw Error("Local origin required");
const accounts = JSON.parse(
  await readFile("/tmp/kad-integration-credentials.json", "utf8"),
);
const sql = new pg.Client({
  connectionString: "postgresql://postgres@127.0.0.1:55432/kad_integration",
});
await sql.connect();
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const p = await browser.newPage({ viewport: { width: 390, height: 1050 } });
const run = Date.now();
const a = "Ordre A " + run,
  b = "Ordre B " + run,
  c = "Ordre C " + run,
  renamed = "Renommée " + run,
  title = "Partage test " + run;
try {
  await p.goto(origin + "/login");
  await p.getByLabel("Email", { exact: true }).fill(accounts.Alex.email);
  await p.getByLabel("Mot de passe").fill(accounts.Alex.password);
  await p.getByRole("button", { name: "Ouvrir mon carnet" }).click();
  await p.getByRole("heading", { name: "Pour qui", exact: true }).waitFor();
  const common = p.locator(".person-card").filter({
    has: p.getByRole("heading", { name: "Commun E&A", exact: true }),
  });
  await common.waitFor();
  assert.equal(
    await common
      .getByRole("button", { name: "Modifier Commun E&A", exact: true })
      .count(),
    0,
  );
  for (const name of [a, b, c]) {
    await p.getByRole("button", { name: "+ Personne", exact: true }).click();
    const d = p.getByRole("dialog");
    await d.getByLabel("Nom", { exact: true }).fill(name);
    await d.getByRole("button", { name: "Créer la personne" }).click();
    await d.waitFor({ state: "hidden" });
    await p.getByRole("heading", { name, exact: true }).waitFor();
  }
  const people = (
    await sql.query("select id,name from recipients where name=any($1)", [
      [a, b, c],
    ])
  ).rows;
  const ids = [a, b, c].map((name) => people.find((r) => r.name === name).id);
  const actor = (
    await sql.query("select id from profiles where email=$1", [
      accounts.Alex.email,
    ])
  ).rows[0].id;
  await sql.query(
    "update profiles set preferences=preferences || jsonb_build_object('order',$1::jsonb,'favorites','[]'::jsonb) where id=$2",
    [JSON.stringify(ids), actor],
  );
  await p.reload();
  await p
    .getByRole("button", { name: "Modifier l’ordre", exact: true })
    .click();
  await p.getByRole("button", { name: "Descendre " + a, exact: true }).click();
  await expect(p.locator(".person-card h2").first()).toHaveText(b);
  await p.getByRole("button", { name: "Terminer", exact: true }).click();
  await p.reload();
  await expect(p.locator(".person-card h2").first()).toHaveText(b);
  await p
    .getByRole("button", { name: "Modifier l’ordre", exact: true })
    .click();
  await p.setViewportSize({ width: 1440, height: 1050 });
  await p
    .locator(".person-card")
    .filter({ has: p.getByRole("heading", { name: c, exact: true }) })
    .dragTo(
      p
        .locator(".person-card")
        .filter({ has: p.getByRole("heading", { name: b, exact: true }) }),
    );
  await expect(p.locator(".person-card h2").first()).toHaveText(c);
  await p.getByRole("button", { name: "Terminer", exact: true }).click();
  await p.getByRole("button", { name: "Modifier " + a, exact: true }).click();
  let d = p.getByRole("dialog");
  await d.getByLabel("Nom de la personne").fill(renamed);
  await d.getByRole("button", { name: "Enregistrer le nom" }).click();
  await d.waitFor({ state: "hidden" });
  await p.getByRole("heading", { name: renamed, exact: true }).click();
  await p.getByRole("button", { name: "+ Idée", exact: true }).last().click();
  d = p.getByRole("dialog");
  await d.getByLabel("Votre idée", { exact: true }).fill(title);
  await expect(d.getByLabel("Prix minimum (€)", { exact: true })).toBeVisible();
  assert.equal(
    await d
      .locator("details")
      .filter({ has: d.getByLabel("Prix minimum (€)", { exact: true }) })
      .count(),
    0,
  );
  await d.getByLabel("Prix minimum (€)", { exact: true }).fill("45");
  await d.getByLabel("Priorité", { exact: true }).selectOption("1");
  await d.getByText("Précisions", { exact: true }).click();
  await d.getByLabel("Note de gestion privée").fill("NEVER_SHARE_NOTE");
  await d
    .locator(".notify-add")
    .getByRole("checkbox", { name: "Elise", exact: true })
    .check();
  await d.getByRole("button", { name: "Garder cette idée" }).click();
  await d.waitFor({ state: "hidden" });
  const gift = (
    await sql.query(
      "select p.id,p.idea_id from proposals p join ideas i on i.id=p.idea_id where i.title=$1",
      [title],
    )
  ).rows[0];
  assert.equal(
    (
      await sql.query(
        "select count(*)::int n from email_jobs where kind='idea_added' and payload->>'proposalId'=$1",
        [gift.id],
      )
    ).rows[0].n,
    1,
  );
  await p.getByRole("button", { name: "Partage rapide", exact: true }).click();
  d = p.getByRole("dialog");
  const whatsapp = await d
    .getByRole("link", { name: "Partager sur WhatsApp ↗" })
    .getAttribute("href");
  assert.ok(decodeURIComponent(whatsapp).includes(title));
  assert.ok(!decodeURIComponent(whatsapp).includes("NEVER_SHARE_NOTE"));
  await d.getByLabel("Email du destinataire").fill("share@example.test");
  await d.getByRole("button", { name: "Envoyer l’email", exact: true }).click();
  await d.getByText(/Email enregistré en attente/).waitFor();
  assert.equal(
    (
      await sql.query(
        "select count(*)::int n from email_jobs where kind='quick_share' and payload->>'ideaId'=$1",
        [gift.idea_id],
      )
    ).rows[0].n,
    1,
  );
  await d.getByRole("button", { name: "Fermer", exact: true }).click();
  await p.getByRole("button", { name: "Kad’Humbert" }).click();
  await p
    .getByRole("button", { name: "Modifier " + renamed, exact: true })
    .click();
  d = p.getByRole("dialog");
  await d.getByRole("button", { name: "Supprimer cette personne" }).click();
  d = p.getByRole("dialog");
  await d
    .getByRole("radio", { name: "Conserver les idées dans À classer" })
    .check();
  await d.getByRole("button", { name: "Confirmer la suppression" }).click();
  await d.waitFor({ state: "hidden" });
  await expect(
    p.getByRole("heading", { name: renamed, exact: true }),
  ).toHaveCount(0);
  await p.getByRole("button", { name: /À classer/ }).click();
  await p.getByRole("heading", { name: title, exact: true }).waitFor();
  await p.getByRole("button", { name: "+ Idée", exact: true }).last().click();
  d = p.getByRole("dialog");
  await d.getByLabel("Qui peut voir cette idée ?").selectOption("private");
  await expect(
    d
      .locator(".notify-add")
      .getByRole("checkbox", { name: "Elise", exact: true }),
  ).toBeDisabled();
  await d.getByRole("button", { name: "Fermer", exact: true }).click();

  const archiveTitle = "Archive choice " + run;
  await sql.query("begin");
  await sql.query("select set_config('request.jwt.claim.sub',$1,true)", [
    actor,
  ]);
  await sql.query("select save_gift_for_recipients($1::jsonb)", [
    {
      title: archiveTitle,
      description: "",
      specifications: "",
      privateNote: "",
      url: "",
      imageUrl: "",
      imageCredit: null,
      priceMin: 30,
      priceMax: null,
      visibility: "public",
      candidates: [ids[1]],
      recipientId: ids[1],
      listIds: [],
      global: false,
      priority: 2,
      collective: false,
      targetAmount: null,
    },
  ]);
  await sql.query("commit");
  await p.getByRole("button", { name: "Kad’Humbert" }).click();
  await p.getByRole("button", { name: "Modifier " + b, exact: true }).click();
  d = p.getByRole("dialog");
  await d.getByRole("button", { name: "Supprimer cette personne" }).click();
  d = p.getByRole("dialog");
  await d
    .getByRole("radio", {
      name: "Retirer les idées du carnet et les conserver aux archives",
    })
    .check();
  await d.getByRole("button", { name: "Confirmer la suppression" }).click();
  await d.waitFor({ state: "hidden" });
  await p.getByRole("button", { name: "◷ Archives", exact: true }).click();
  const archivedCard = p
    .locator(".gift-card")
    .filter({
      has: p.getByRole("heading", { name: archiveTitle, exact: true }),
    });
  await expect(archivedCard).toBeVisible();
  await expect(archivedCard.locator(".recipient")).toContainText(b);
  await p.getByRole("button", { name: "Ouvrir mon compte" }).click();
  d = p.getByRole("dialog");
  const diagnostic = await p.request.get(origin + "/api/gmail/connect", {
    maxRedirects: 0,
  });
  assert.equal(diagnostic.headers().location, "/?mail=not_configured");
  await d.getByRole("link", { name: "Connecter mon Gmail" }).click();
  await p
    .getByText(
      "La connexion Gmail n’est pas encore configurée dans l’application.",
      { exact: true },
    )
    .waitFor();
  console.log(
    "PASS: common protection, arrows/touch order, desktop drag, reload order, rename, quick price/priority, notification queue, quick sharing without private notes, delete to inbox or archives, private notification disabled, Gmail setup state",
  );
} finally {
  await browser.close();
  await sql.end();
}
