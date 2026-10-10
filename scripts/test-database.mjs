import pg from "pg";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
// Isolated throwaway database. No changes to a configured Supabase project.
const base =
  process.env.TEST_DATABASE_URL ||
  "postgresql://postgres@127.0.0.1:55432/postgres";
const root = new pg.Client({ connectionString: base });
await root.connect();
const name = "kad_test_" + Date.now();
await root.query(`create database ${name}`);
const url = new URL(base);
url.pathname = "/" + name;
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
let checks = 0;
async function admin(id, sql, params = []) {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    const r = await db.query(sql, params);
    await db.query("commit");
    return r;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}
async function check(name, fn) {
  await fn();
  checks++;
  console.log("✓ " + name);
}
try {
  await db.query(
    `do $$begin create role anon nologin;exception when duplicate_object then null;end$$;do $$begin create role authenticated nologin;exception when duplicate_object then null;end$$;do $$begin create role service_role nologin bypassrls;exception when duplicate_object then null;end$$;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key,name text,bucket_id text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`,
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
  const alex = randomUUID(),
    elise = randomUUID(),
    outsider = randomUUID();
  await db.query("insert into auth.users values($1),($2),($3)", [
    alex,
    elise,
    outsider,
  ]);
  await db.query(
    "insert into profiles(id,display_name,email) values($1,'Alex','alex@example.test'),($2,'Elise','elise@example.test')",
    [alex, elise],
  );
  const recipient = (
    await db.query("select id from recipients where name='Alex'")
  ).rows[0].id;
  const list = (
    await admin(
      alex,
      "insert into lists(name,created_by) values('Noël',$1) returning *",
      [alex],
    )
  ).rows[0];
  const make = async (visibility = "public", collective = false) => {
    const data = {
      title: "Lampe",
      description: "Description",
      specifications: "Bleue",
      privateNote: "SECRET_NOTE",
      url: "https://example.com",
      imageUrl: "",
      imageCredit: null,
      priceMin: 30,
      priceMax: 60,
      visibility,
      candidates: [recipient],
      recipientId: recipient,
      listIds: [list.id],
      global: false,
      priority: 0,
      collective,
      targetAmount: collective ? 100 : null,
    };
    return (await admin(alex, "select save_gift($1::jsonb) id", [data])).rows[0]
      .id;
  };
  let priv = await make("private"),
    pub = await make();
  const ideaPriv = (
    await db.query("select idea_id from proposals where id=$1", [priv])
  ).rows[0].idea_id;
  await check(
    "Elise ne voit ni idée, ni proposition, ni historique privés",
    async () => {
      for (const [table, condition] of [
        ["ideas", "id"],
        ["proposals", "idea_id"],
        ["activity", "idea_id"],
      ])
        assert.equal(
          (
            await admin(elise, `select * from ${table} where ${condition}=$1`, [
              ideaPriv,
            ])
          ).rowCount,
          0,
        );
    },
  );
  await check(
    "Un compte connecté non autorisé ne voit pas le carnet",
    async () =>
      assert.equal((await admin(outsider, "select * from ideas")).rowCount, 0),
  );
  await check("Elise ne peut pas rendre privée une idée d’Alex", async () => {
    const iid = (
      await db.query("select idea_id from proposals where id=$1", [pub])
    ).rows[0].idea_id;
    await assert.rejects(
      admin(elise, "update ideas set visibility='private' where id=$1", [iid]),
      /creator_only_privacy/,
    );
  });
  await check(
    "Les colonnes de réservation et les profils ne sont pas modifiables directement",
    async () => {
      await assert.rejects(
        admin(alex, "update proposals set reserved=true where id=$1", [pub]),
        /permission denied/,
      );
      await assert.rejects(
        admin(alex, "update profiles set display_name='X' where id=$1", [alex]),
        /permission denied/,
      );
    },
  );
  await check(
    "La vue invitée ne contient ni notes privées ni identité du réservant",
    async () => {
      await db.query("set role anon");
      try {
        const result = (
          await db.query("select shared_list($1) data", [list.share_token])
        ).rows[0].data;
        assert.equal(result.gifts.length, 1);
        assert.ok(!JSON.stringify(result).includes("SECRET_NOTE"));
        assert.ok(!JSON.stringify(result).includes("owner_id"));
        await assert.rejects(
          db.query("select * from reservations"),
          /permission denied/,
        );
        await assert.rejects(
          db.query(
            "select reserve_gift($1,$2,'Test','test@example.test',null)",
            [list.share_token, pub],
          ),
          /permission denied/,
        );
      } finally {
        await db.query("reset role");
      }
    },
  );
  async function reserve(p, amount = null) {
    const c = new pg.Client({ connectionString: url.toString() });
    await c.connect();
    try {
      await c.query("set role service_role");
      return (
        await c.query(
          "select reserve_gift($1,$2,'Sophie et Marc','guest@example.test',$3) data",
          [list.share_token, p, amount],
        )
      ).rows[0].data;
    } finally {
      await c.end();
    }
  }
  let access;
  await check("Deux réservations simultanées : une seule réussit", async () => {
    const results = await Promise.allSettled([reserve(pub), reserve(pub)]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    access = results.find((r) => r.status === "fulfilled").value.accessToken;
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from reservations where proposal_id=$1 and cancelled_at is null",
          [pub],
        )
      ).rows[0].n,
      1,
    );
  });
  await check(
    "Nom et email exigés sans confirmation ou expiration",
    async () => {
      const p = await make();
      await assert.rejects(
        db.query("select reserve_gift($1,$2,'','guest@example.test',null)", [
          list.share_token,
          p,
        ]),
        /invalid_guest/,
      );
      assert.equal(
        (await db.query("select reservation_info($1) data", [access])).rows[0]
          .data.cancelled,
        false,
      );
    },
  );
  await check(
    "Annulation idempotente remet le cadeau à disposition",
    async () => {
      await db.query("select cancel_reservation($1)", [access]);
      await db.query("select cancel_reservation($1)", [access]);
      assert.equal(
        (await db.query("select reserved from proposals where id=$1", [pub]))
          .rows[0].reserved,
        false,
      );
    },
  );
  await check(
    "Participation collective : le budget ne peut pas être dépassé",
    async () => {
      const p = await make("public", true);
      const results = await Promise.allSettled([
        reserve(p, 60),
        reserve(p, 60),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      await reserve(p, 40);
      await assert.rejects(reserve(p, 1), /gift_unavailable/);
      assert.equal(
        Number(
          (await db.query("select contributed from proposals where id=$1", [p]))
            .rows[0].contributed,
        ),
        100,
      );
    },
  );
  await check(
    "Restaurer une archive annule les anciennes réservations",
    async () => {
      await reserve(pub);
      await admin(
        alex,
        "update proposals set archived_at=now(),archive_reason='offered' where id=$1",
        [pub],
      );
      await admin(alex, "select reset_gift($1,true)", [pub]);
      const p = (await db.query("select * from proposals where id=$1", [pub]))
        .rows[0];
      assert.equal(p.reserved, false);
      assert.equal(p.archived_at, null);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from reservations where proposal_id=$1 and cancelled_at is null",
            [pub],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await check(
    "La file email contient récapitulatifs et changements, sans noms dans les notifications admin",
    async () => {
      const hidden = await make();
      const receipt = await reserve(hidden);
      const iid = (
        await db.query("select idea_id from proposals where id=$1", [hidden])
      ).rows[0].idea_id;
      await admin(
        alex,
        "update ideas set visibility='private',title='NOUVEAU_TITRE_CONFIDENTIEL' where id=$1",
        [iid],
      );
      await admin(
        alex,
        "update ideas set title='AUTRE_TITRE_CONFIDENTIEL' where id=$1",
        [iid],
      );
      assert.equal(
        (
          await db.query("select reservation_info($1) data", [
            receipt.accessToken,
          ])
        ).rows[0].data.title,
        "Votre cadeau",
      );
      const changed = (
        await db.query(
          "select payload from email_jobs where kind='changed' and payload->>'accessToken'=$1",
          [receipt.accessToken],
        )
      ).rows;
      assert.ok(changed.length);
      assert.ok(
        changed.every(
          (r) => !JSON.stringify(r.payload).includes("CONFIDENTIEL"),
        ),
      );
      const rows = (await db.query("select * from email_jobs")).rows;
      assert.ok(rows.some((r) => r.kind === "reserved"));
      assert.ok(rows.some((r) => r.kind === "changed"));
      assert.ok(
        rows
          .filter((r) => r.kind === "admin_reserved")
          .every((r) => !JSON.stringify(r.payload).includes("Sophie")),
      );
      const a = (await db.query("select * from claim_email_jobs()")).rows;
      assert.ok(a.length);
      const b = (await db.query("select * from claim_email_jobs()")).rows;
      assert.ok(!b.some((row) => a.some((old) => old.id === row.id)));
    },
  );
  await check("Limiter les requêtes bloque la suivante au seuil", async () => {
    assert.equal(
      (await db.query("select rate_limit('test',1,600) ok")).rows[0].ok,
      true,
    );
    assert.equal(
      (await db.query("select rate_limit('test',1,600) ok")).rows[0].ok,
      false,
    );
  });
  await check(
    "L’état réservé ne peut pas être forgé lors de la création",
    async () => {
      const iid = (
        await db.query("select idea_id from proposals where id=$1", [pub])
      ).rows[0].idea_id;
      await assert.rejects(
        admin(
          alex,
          "insert into proposals(idea_id,recipient_id,reserved) values($1,$2,true)",
          [iid, recipient],
        ),
        /reservation_state_is_managed/,
      );
    },
  );
  await check(
    "Retirer un destinataire déjà attribué est refusé sans perte de données",
    async () => {
      const iid = (
        await db.query("select idea_id from proposals where id=$1", [pub])
      ).rows[0].idea_id;
      await assert.rejects(
        admin(alex, "update ideas set candidates='{}' where id=$1", [iid]),
        /recipient_used_by_another_proposal/,
      );
      assert.deepEqual(
        (await db.query("select candidates from ideas where id=$1", [iid]))
          .rows[0].candidates,
        [recipient],
      );
    },
  );
  await check(
    "Dupliquer une idée globale crée une proposition libre sans doublon ni ancienne réservation",
    async () => {
      const p = await make();
      await admin(alex, "update proposals set is_global=true where id=$1", [p]);
      await reserve(p);
      const lid = (
        await admin(
          alex,
          "select duplicate_proposals($1,$2,'Nouvelle édition') id",
          [list.id, [p]],
        )
      ).rows[0].id;
      const copy = (
        await db.query("select * from proposals where $1=any(list_ids)", [lid])
      ).rows[0];
      assert.equal(copy.reserved, false);
      assert.equal(Number(copy.contributed), 0);
      const token = (
        await db.query("select share_token from lists where id=$1", [lid])
      ).rows[0].share_token;
      const shared = (await db.query("select shared_list($1) data", [token]))
        .rows[0].data;
      assert.equal(shared.gifts.length, 1);
      assert.equal(shared.gifts[0].id, copy.id);
      await assert.rejects(
        db.query(
          "select reserve_gift($1,$2,'Invité','guest@example.test',null)",
          [token, p],
        ),
        /gift_unavailable/,
      );
    },
  );
  await check(
    "Une duplication incompatible ne crée pas de liste partielle",
    async () => {
      const count = (await db.query("select count(*)::int n from lists"))
        .rows[0].n;
      await assert.rejects(
        admin(elise, "select duplicate_proposals($1,$2,'Interdite')", [
          list.id,
          [priv],
        ]),
        /not_authorized/,
      );
      assert.equal(
        (await db.query("select count(*)::int n from lists")).rows[0].n,
        count,
      );
    },
  );
  await check(
    "Archiver la liste ferme ses réservations sans archiver les idées",
    async () => {
      const p = await make();
      await admin(alex, "update lists set archived_at=now() where id=$1", [
        list.id,
      ]);
      assert.equal(
        (await db.query("select shared_list($1) data", [list.share_token]))
          .rows[0].data.gifts.length,
        0,
      );
      await assert.rejects(reserve(p), /gift_unavailable/);
      assert.equal(
        (await db.query("select archived_at from proposals where id=$1", [p]))
          .rows[0].archived_at,
        null,
      );
    },
  );
  console.log(`${checks} vérifications PostgreSQL réussies.`);
} finally {
  await db.end();
  await root.query(`drop database ${name} with (force)`);
  await root.end();
}
