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
  await db.query(
    await readFile(
      new URL(
        "../supabase/migrations/202610130001_simplify_capture.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.query(
    await readFile(
      new URL(
        "../supabase/migrations/202610240001_people_and_gmail.sql",
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
  // Simulate existing personal choices before migrating to shared colours.
  await db.query(
    "update profiles set preferences=jsonb_build_object('recipientColors',jsonb_build_object($1::text,$2::text)) where id=$3",
    [recipient, "#123456", alex],
  );
  await db.query(
    "update profiles set preferences=jsonb_build_object('recipientColors',jsonb_build_object($1::text,$2::text,(select id::text from recipients where name='Elise'),'#d8f36a')) where id=$3",
    [recipient, "#abcdef", elise],
  );
  await db.query(
    await readFile(
      new URL(
        "../supabase/migrations/202610240002_shared_recipient_colors.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await check(
    "La migration partage les couleurs existantes en privilégiant Alex puis Elise",
    async () => {
      assert.equal(
        (
          await db.query("select color from recipients where id=$1", [
            recipient,
          ])
        ).rows[0].color,
        "#123456",
      );
      assert.equal(
        (await db.query("select color from recipients where name='Elise'"))
          .rows[0].color,
        "#d8f36a",
      );
    },
  );
  await check(
    "Une couleur changée par Alex est visible par Elise et réciproquement",
    async () => {
      await admin(alex, "select set_recipient_color($1,'#3155FF')", [
        recipient,
      ]);
      assert.equal(
        (
          await admin(elise, "select color from recipients where id=$1", [
            recipient,
          ])
        ).rows[0].color,
        "#3155ff",
      );
      await admin(elise, "select set_recipient_color($1,'#d8f36a')", [
        recipient,
      ]);
      assert.equal(
        (
          await admin(alex, "select color from recipients where id=$1", [
            recipient,
          ])
        ).rows[0].color,
        "#d8f36a",
      );
    },
  );
  await check(
    "Commun E&A accepte une couleur mais reste protégé contre le renommage",
    async () => {
      const id = (await db.query("select id from recipients where is_common"))
        .rows[0].id;
      await admin(elise, "select set_recipient_color($1,'#3155ff')", [id]);
      await assert.rejects(
        admin(alex, "select rename_recipient($1,'Autre')", [id]),
        /common_is_protected/,
      );
      await assert.rejects(
        admin(alex, "update recipients set deleted_at=now() where id=$1", [id]),
        /common_is_protected/,
      );
    },
  );
  await check(
    "Les couleurs invalides et les visiteurs sont refusés ; création avec couleur atomique",
    async () => {
      await assert.rejects(
        admin(alex, "select set_recipient_color($1,'red')", [recipient]),
        /invalid_color/,
      );
      await assert.rejects(
        admin(outsider, "select set_recipient_color($1,'#ffffff')", [
          recipient,
        ]),
        /not_authorized/,
      );
      await assert.rejects(
        admin(
          alex,
          "select add_recipient_with_color('Couleur invalide','invalid')",
        ),
        /invalid_color/,
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from recipients where name='Couleur invalide'",
          )
        ).rows[0].n,
        0,
      );
      const id = (
        await admin(
          elise,
          "select add_recipient_with_color('Couleur commune','#aabbcc') id",
        )
      ).rows[0].id;
      assert.equal(
        (await admin(alex, "select color from recipients where id=$1", [id]))
          .rows[0].color,
        "#aabbcc",
      );
    },
  );
  const legacyList = (
    await admin(
      alex,
      "insert into lists(name,created_by) values('Liste avant historique',$1) returning id",
      [alex],
    )
  ).rows[0].id;
  const legacyIdea = (
    await admin(
      alex,
      "insert into ideas(title,owner_id,candidates) values('Idée antérieure',$1,array[$2::uuid]) returning id",
      [alex, recipient],
    )
  ).rows[0].id;
  await admin(
    alex,
    "insert into proposals(idea_id,recipient_id,list_ids) values($1,$2,array[$3::uuid])",
    [legacyIdea, recipient, legacyList],
  );
  await admin(alex, "update ideas set price_min=12 where id=$1", [legacyIdea]);
  await admin(
    elise,
    "insert into share_history(list_id,created_by,contact_name,channel) values($1,$2,'Contact antérieur','sms')",
    [legacyList, elise],
  );
  await db.query(
    await readFile(
      new URL(
        "../supabase/migrations/202610240003_list_history.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.query(
    await readFile(
      new URL(
        "../supabase/migrations/202610250001_admin_reservations.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.query(
    await readFile(
      new URL(
        "../supabase/migrations/202610250002_guest_experience.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  await check(
    "La migration conserve les anciens changements et partages avec leur date et leur auteur",
    async () => {
      const changes = (
        await admin(
          alex,
          "select * from activity where $1=any(list_ids) and idea_id=$2",
          [legacyList, legacyIdea],
        )
      ).rows;
      assert.ok(changes.some((a) => a.changes.price_min?.after === 12));
      const shares = (
        await admin(
          alex,
          "select * from activity where $1=any(list_ids) and message='Partage préparé'",
          [legacyList],
        )
      ).rows;
      assert.equal(shares.length, 1);
      assert.equal(shares[0].actor_id, elise);
      assert.equal(shares[0].changes.contact_name.after, "Contact antérieur");
    },
  );
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

  await check(
    "Capture publique sans destinataire reste absente du lien invité",
    async () => {
      await admin(alex, "update lists set archived_at=null where id=$1", [
        list.id,
      ]);
      const input = {
        title: "À classer",
        description: "",
        specifications: "",
        privateNote: "",
        url: "",
        imageUrl: "",
        imageCredit: null,
        priceMin: null,
        priceMax: null,
        visibility: "public",
        candidates: [],
        recipientId: null,
        listIds: [list.id],
        global: false,
        priority: 2,
        collective: false,
        targetAmount: null,
      };
      const pid = (
        await admin(alex, "select save_gift_for_recipients($1::jsonb) id", [
          input,
        ])
      ).rows[0].id;
      const shared = (
        await db.query("select shared_list($1) data", [list.share_token])
      ).rows[0].data;
      assert.equal(
        shared.gifts.some((g) => g.id === pid),
        false,
      );
    },
  );
  await check(
    "Plusieurs personnes créent des idées indépendantes et restent atomiques",
    async () => {
      const second = (
        await db.query("select id from recipients where name='Elise'")
      ).rows[0].id;
      const input = {
        title: "Indépendante",
        description: "",
        specifications: "",
        privateNote: "",
        url: "",
        imageUrl: "",
        imageCredit: null,
        priceMin: 50,
        priceMax: null,
        visibility: "public",
        candidates: [recipient, second],
        recipientId: recipient,
        listIds: [list.id],
        global: false,
        priority: 2,
        collective: false,
        targetAmount: null,
      };
      await admin(alex, "select save_gift_for_recipients($1::jsonb)", [input]);
      const rows = (
        await db.query(
          "select p.* from proposals p join ideas i on i.id=p.idea_id where i.title='Indépendante'",
        )
      ).rows;
      assert.equal(rows.length, 2);
      assert.notEqual(rows[0].idea_id, rows[1].idea_id);
      await reserve(rows[0].id);
      assert.equal(
        (
          await db.query("select reserved from proposals where id=$1", [
            rows[1].id,
          ])
        ).rows[0].reserved,
        false,
      );
      await assert.rejects(
        admin(alex, "select save_gift_for_recipients($1::jsonb)", [
          {
            ...input,
            title: "Rollback",
            candidates: [recipient, randomUUID()],
          },
        ]),
        /unknown_recipient/,
      );
      assert.equal(
        (await db.query("select count(*) from ideas where title='Rollback'"))
          .rows[0].count,
        "0",
      );
      const common = (
        await db.query("select id from recipients where is_common")
      ).rows[0].id;
      await assert.rejects(
        admin(alex, "select save_gift_for_recipients($1::jsonb)", [
          { ...input, candidates: [recipient, common] },
        ]),
        /common_is_exclusive/,
      );
    },
  );

  await check(
    "Déréserver prévient chaque participant et ne renvoie pas deux notifications",
    async () => {
      await admin(alex, "update lists set archived_at=null where id=$1", [
        list.id,
      ]);
      const gift = await make("public", true);
      const first = await reserve(gift, 30);
      const second = await reserve(gift, 40);
      await admin(elise, "select reset_gift($1,false)", [gift]);
      const p = (
        await db.query(
          "select reserved,contributed from proposals where id=$1",
          [gift],
        )
      ).rows[0];
      assert.equal(p.reserved, false);
      assert.equal(Number(p.contributed), 0);
      // Inspect the actual reservation tokens rather than names in admin notifications.
      const reservations = (
        await db.query(
          "select access_token from reservations where proposal_id=$1",
          [gift],
        )
      ).rows;
      const access = reservations.map((r) => r.access_token);
      let jobs = (
        await db.query(
          "select payload from email_jobs where kind='changed' and payload->>'title'='Cadeau remis à disposition' and payload->>'accessToken'=any($1)",
          [access],
        )
      ).rows;
      assert.equal(jobs.length, 2);
      await admin(elise, "select reset_gift($1,false)", [gift]);
      jobs = (
        await db.query(
          "select payload from email_jobs where kind='changed' and payload->>'title'='Cadeau remis à disposition' and payload->>'accessToken'=any($1)",
          [access],
        )
      ).rows;
      assert.equal(jobs.length, 2);
    },
  );

  const customInput = (person, visibility = "public") => ({
    title: "Nouvelle idée test",
    description: "Description partageable",
    specifications: "Bleu",
    privateNote: "NE_JAMAIS_ENVOYER",
    url: "https://example.test/produit",
    imageUrl: "",
    imageCredit: null,
    priceMin: 30,
    priceMax: null,
    visibility,
    candidates: [person],
    recipientId: person,
    listIds: [list.id],
    global: false,
    priority: 1,
    collective: false,
    targetAmount: null,
  });
  await check(
    "Commun E&A ne peut être renommé, supprimé ou transformé",
    async () => {
      const common = (
        await db.query("select id,name from recipients where is_common")
      ).rows[0];
      assert.equal(common.name, "Commun E&A");
      await assert.rejects(
        admin(alex, "select rename_recipient($1,'Autre')", [common.id]),
        /common_is_protected/,
      );
      await assert.rejects(
        admin(alex, "select remove_recipient($1,false)", [common.id]),
        /common_is_protected/,
      );
      await assert.rejects(
        admin(alex, "delete from recipients where id=$1", [common.id]),
        /common_is_protected|permission denied/,
      );
      await assert.rejects(
        admin(alex, "update recipients set is_common=false where id=$1", [
          common.id,
        ]),
        /common_is_protected/,
      );
    },
  );
  await check(
    "Renommer une personne conserve ses cadeaux et met à jour le nom invité",
    async () => {
      await admin(alex, "update lists set archived_at=null where id=$1", [
        list.id,
      ]);
      const person = (
        await admin(
          alex,
          "insert into recipients(name) values('Renommage') returning id",
        )
      ).rows[0].id;
      const pid = (
        await admin(alex, "select save_gift_for_recipients($1::jsonb) id", [
          customInput(person),
        ])
      ).rows[0].id;
      await admin(elise, "select rename_recipient($1,'Nouveau nom')", [person]);
      assert.equal(
        (
          await db.query("select shared_list($1) data", [list.share_token])
        ).rows[0].data.gifts.find((g) => g.id === pid).recipient,
        "Nouveau nom",
      );
    },
  );
  await check(
    "Supprimer vers À classer garde les idées et protège celles qui sont privées",
    async () => {
      const person = (
        await admin(
          alex,
          "insert into recipients(name) values('À supprimer') returning id",
        )
      ).rows[0].id;
      const publicGift = (
        await admin(alex, "select save_gift_for_recipients($1::jsonb) id", [
          customInput(person),
        ])
      ).rows[0].id;
      const privateGift = (
        await admin(elise, "select save_gift_for_recipients($1::jsonb) id", [
          customInput(person, "private"),
        ])
      ).rows[0].id;
      await reserve(publicGift);
      await admin(alex, "select remove_recipient($1,false)", [person]);
      const p = (
        await db.query("select * from proposals where id=$1", [publicGift])
      ).rows[0];
      assert.equal(p.recipient_id, null);
      assert.deepEqual(p.list_ids, [list.id]);
      assert.equal(p.reserved, false);
      assert.equal(p.archived_at, null);
      assert.equal(
        (
          await db.query("select recipient_id from proposals where id=$1", [
            privateGift,
          ])
        ).rows[0].recipient_id,
        person,
      );
      await assert.rejects(reserve(publicGift), /gift_unavailable/);
      assert.ok(
        (
          await db.query("select deleted_at from recipients where id=$1", [
            person,
          ])
        ).rows[0].deleted_at,
      );
      await assert.rejects(
        admin(alex, "select save_gift_for_recipients($1::jsonb)", [
          customInput(person),
        ]),
        /recipient_not_found/,
      );
    },
  );
  await check(
    "Supprimer avec retrait conserve les cadeaux aux archives",
    async () => {
      const person = (
        await admin(
          alex,
          "insert into recipients(name) values('Archives personne') returning id",
        )
      ).rows[0].id;
      const gift = (
        await admin(alex, "select save_gift_for_recipients($1::jsonb) id", [
          customInput(person),
        ])
      ).rows[0].id;
      await admin(alex, "select remove_recipient($1,true)", [person]);
      const p = (await db.query("select * from proposals where id=$1", [gift]))
        .rows[0];
      assert.ok(p.archived_at);
      assert.equal(p.archive_reason, "abandoned");
      assert.match(p.archive_note, /suppression/);
    },
  );
  await check(
    "Prévenir de l’ajout prépare un email sans note privée et interdit les fuites",
    async () => {
      const data = { ...customInput(recipient), notifyIds: [elise] };
      const p = (
        await admin(alex, "select save_gift_with_notifications($1::jsonb) id", [
          data,
        ])
      ).rows[0].id;
      const jobs = (
        await db.query(
          "select * from email_jobs where kind='idea_added' and payload->>'proposalId'=$1",
          [p],
        )
      ).rows;
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].email, "elise@example.test");
      assert.equal(jobs[0].payload.senderProfileId, alex);
      assert.equal(JSON.stringify(jobs).includes("NE_JAMAIS_ENVOYER"), false);
      await assert.rejects(
        admin(alex, "select save_gift_with_notifications($1::jsonb)", [
          { ...data, visibility: "private" },
        ]),
        /private_notification_forbidden/,
      );
      await assert.rejects(
        admin(alex, "select save_gift_with_notifications($1::jsonb)", [
          { ...data, notifyIds: [randomUUID()] },
        ]),
        /invalid_notification_recipient/,
      );
    },
  );
  await check(
    "Recréer une personne supprimée réactive sa fiche sans doublon",
    async () => {
      const person = (
        await admin(alex, "select add_recipient('Réactivation') id")
      ).rows[0].id;
      await admin(alex, "select remove_recipient($1,false)", [person]);
      const restored = (
        await admin(alex, "select add_recipient('Réactivation') id")
      ).rows[0].id;
      assert.equal(restored, person);
      assert.equal(
        (
          await db.query("select deleted_at from recipients where id=$1", [
            person,
          ])
        ).rows[0].deleted_at,
        null,
      );
    },
  );
  await check(
    "Les jetons Gmail sont inaccessibles aux administrateurs et aux invités",
    async () => {
      await db.query(
        "insert into admin_mailboxes(profile_id,email,refresh_token) values($1,'alex@example.test','encrypted-test-only')",
        [alex],
      );
      await assert.rejects(
        admin(alex, "select * from admin_mailboxes"),
        /permission denied/,
      );
      await assert.rejects(
        admin(elise, "select * from admin_mailboxes"),
        /permission denied/,
      );
      const rows = (
        await db.query("select * from claim_email_jobs_for_provider('gmail')")
      ).rows;
      assert.ok(rows.length);
      assert.ok(
        rows.every((r) => ["idea_added", "quick_share"].includes(r.kind)),
      );
      await assert.rejects(
        admin(alex, "select * from claim_email_jobs_for_provider('gmail')"),
        /permission denied/,
      );
    },
  );
  await check(
    "L’historique suit les modifications de liste et leur auteur sans événements vides",
    async () => {
      const id = (
        await admin(
          alex,
          "insert into lists(name,created_by) values('Historique',$1) returning id",
          [alex],
        )
      ).rows[0].id;
      await admin(
        elise,
        "update lists set name='Historique modifié',slogan='Bienvenue' where id=$1",
        [id],
      );
      const event = (
        await admin(
          alex,
          "select * from activity where $1=any(list_ids) and message='Liste modifiée' order by id desc",
          [id],
        )
      ).rows[0];
      assert.equal(event.actor_id, elise);
      assert.equal(event.changes.name.before, "Historique");
      assert.equal(event.changes.name.after, "Historique modifié");
      const count = (
        await db.query(
          "select count(*)::int n from activity where $1=any(list_ids)",
          [id],
        )
      ).rows[0].n;
      await admin(elise, "update lists set name=name where id=$1", [id]);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from activity where $1=any(list_ids)",
            [id],
          )
        ).rows[0].n,
        count,
      );
    },
  );
  await check(
    "Le prix, la priorité et le retrait d’une idée conservent la portée historique des listes",
    async () => {
      const pid = await make();
      const iid = (
        await db.query("select idea_id from proposals where id=$1", [pid])
      ).rows[0].idea_id;
      const other = (
        await admin(
          alex,
          "insert into lists(name,created_by) values('Autre liste',$1) returning id",
          [alex],
        )
      ).rows[0].id;
      await admin(elise, "update ideas set price_min=40 where id=$1", [iid]);
      const price = (
        await admin(
          alex,
          "select * from activity where idea_id=$1 and changes ? 'price_min' order by id desc",
          [iid],
        )
      ).rows[0];
      assert.ok(price.list_ids.includes(list.id));
      assert.equal(price.actor_id, elise);
      assert.equal(Number(price.changes.price_min.before), 30);
      assert.equal(Number(price.changes.price_min.after), 40);
      await admin(
        elise,
        "update proposals set priority=1,list_ids=array[$2::uuid] where id=$1",
        [pid, other],
      );
      const moved = (
        await db.query(
          "select * from activity where idea_id=$1 and changes ? 'list_ids' order by id desc",
          [iid],
        )
      ).rows[0];
      assert.ok(moved.list_ids.includes(list.id));
      assert.ok(moved.list_ids.includes(other));
      assert.deepEqual(moved.changes.priority, { before: 0, after: 1 });
      await admin(alex, "update ideas set price_min=50 where id=$1", [iid]);
      const latest = (
        await db.query(
          "select * from activity where idea_id=$1 and changes ? 'price_min' order by id desc",
          [iid],
        )
      ).rows[0];
      assert.deepEqual(latest.list_ids, [other]);
    },
  );
  await check(
    "L’historique d’une idée devenue privée reste inaccessible à Elise et aux visiteurs",
    async () => {
      const pid = await make();
      const iid = (
        await db.query("select idea_id from proposals where id=$1", [pid])
      ).rows[0].idea_id;
      await admin(
        alex,
        "update ideas set visibility='private',title='HISTORIQUE_CONFIDENTIEL' where id=$1",
        [iid],
      );
      assert.ok(
        (await admin(alex, "select * from activity where idea_id=$1", [iid]))
          .rows.length,
      );
      assert.equal(
        (await admin(elise, "select * from activity where idea_id=$1", [iid]))
          .rows.length,
        0,
      );
      assert.equal(
        (
          await admin(
            outsider,
            "select * from activity where $1=any(list_ids)",
            [list.id],
          )
        ).rows.length,
        0,
      );
      await assert.rejects(
        admin(elise, "select history_idea_lists($1)", [iid]),
        /permission denied/,
      );
    },
  );
  await check(
    "Un partage préparé conserve le contact, le canal, la liste et l’auteur",
    async () => {
      await admin(
        elise,
        "insert into share_history(list_id,created_by,contact_name,channel) values($1,$2,'Sophie et Marc','whatsapp')",
        [list.id, elise],
      );
      const entry = (
        await admin(
          alex,
          "select * from activity where $1=any(list_ids) and message='Partage préparé' order by id desc",
          [list.id],
        )
      ).rows[0];
      assert.equal(entry.actor_id, elise);
      assert.equal(entry.changes.contact_name.after, "Sophie et Marc");
      assert.equal(entry.changes.channel.after, "whatsapp");
    },
  );
  await check(
    "Une réservation invitée figure dans l’historique sans divulguer son identité",
    async () => {
      const pid = await make();
      const iid = (
        await db.query("select idea_id from proposals where id=$1", [pid])
      ).rows[0].idea_id;
      await db.query(
        "select reserve_gift($1,$2,'NOM_SECRET','secret@example.test',null)",
        [list.share_token, pid],
      );
      const entry = (
        await admin(
          alex,
          "select * from activity where idea_id=$1 and message='Idée réservée' order by id desc",
          [iid],
        )
      ).rows[0];
      assert.ok(entry.list_ids.includes(list.id));
      assert.equal(entry.actor_id, null);
      assert.equal(entry.changes.reserved.after, true);
      assert.ok(!JSON.stringify(entry).includes("NOM_SECRET"));
      assert.ok(!JSON.stringify(entry).includes("secret@example.test"));
    },
  );
  await check(
    "Une proposition non classée n’ajoute pas d’événement à la liste d’une autre proposition",
    async () => {
      const pid = await make();
      const iid = (
        await db.query("select idea_id from proposals where id=$1", [pid])
      ).rows[0].idea_id;
      const second = (
        await admin(
          alex,
          "insert into proposals(idea_id,recipient_id) values($1,$2) returning id",
          [iid, recipient],
        )
      ).rows[0].id;
      await admin(alex, "update proposals set priority=1 where id=$1", [
        second,
      ]);
      const latest = (
        await db.query(
          "select * from activity where idea_id=$1 order by id desc limit 1",
          [iid],
        )
      ).rows[0];
      assert.equal(latest.message, "Paramètres de l’idée modifiés");
      assert.deepEqual(latest.list_ids, []);
    },
  );

  await check(
    "Un administrateur réserve sans email : nom obligatoire, auteur conservé et aucun faux email",
    async () => {
      const pid = await make();
      await assert.rejects(
        admin(alex, "select admin_reserve_gift($1,$2,'   ',null,null)", [
          list.id,
          pid,
        ]),
        /invalid_guest/,
      );
      const reply = (
        await admin(
          alex,
          "select admin_reserve_gift($1,$2,'Sophie et Marc',null,null) data",
          [list.id, pid],
        )
      ).rows[0].data;
      assert.equal(reply.emailQueued, false);
      const reservation = (
        await db.query("select * from reservations where proposal_id=$1", [pid])
      ).rows[0];
      assert.equal(reservation.name, "Sophie et Marc");
      assert.equal(reservation.email, null);
      assert.equal(reservation.reserved_by, alex);
      assert.equal(
        (await db.query("select reserved from proposals where id=$1", [pid]))
          .rows[0].reserved,
        true,
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from email_jobs where payload->>'accessToken'=$1",
            [reservation.access_token],
          )
        ).rows[0].n,
        0,
      );
      const iid = (
        await db.query("select idea_id from proposals where id=$1", [pid])
      ).rows[0].idea_id;
      const event = (
        await admin(
          elise,
          "select * from activity where idea_id=$1 and message='Idée réservée' order by id desc",
          [iid],
        )
      ).rows[0];
      assert.equal(event.actor_id, alex);
      assert.ok(!JSON.stringify(event).includes("Sophie et Marc"));
      assert.equal(
        (await admin(elise, "select reveal_gift($1) data", [pid])).rows[0]
          .data[0].name,
        "Sophie et Marc",
      );
    },
  );
  await check(
    "Un email facultatif valide reçoit le récapitulatif et la notification de déréservation",
    async () => {
      const pid = await make();
      const response = (
        await admin(
          elise,
          "select admin_reserve_gift($1,$2,'Sophie',' SOPHIE@example.test ',null) data",
          [list.id, pid],
        )
      ).rows[0].data;
      assert.equal(response.emailQueued, true);
      const r = (
        await db.query("select * from reservations where proposal_id=$1", [pid])
      ).rows[0];
      assert.equal(r.email, "sophie@example.test");
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from email_jobs where kind='reserved' and payload->>'accessToken'=$1",
            [r.access_token],
          )
        ).rows[0].n,
        1,
      );
      await admin(alex, "select reset_gift($1,false)", [pid]);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from email_jobs where kind='changed' and payload->>'accessToken'=$1",
            [r.access_token],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await check(
    "Les invités ne peuvent pas réserver sans email, ni appeler la fonction administrateur",
    async () => {
      const pid = await make();
      await assert.rejects(
        db.query("select reserve_gift($1,$2,'Invité',null,null)", [
          list.share_token,
          pid,
        ]),
        /invalid_guest/,
      );
      await assert.rejects(
        db.query("select reserve_gift($1,$2,'Invité','',null)", [
          list.share_token,
          pid,
        ]),
        /invalid_guest/,
      );
      await assert.rejects(
        admin(outsider, "select admin_reserve_gift($1,$2,'Intrus',null,null)", [
          list.id,
          pid,
        ]),
        /not_authorized/,
      );
      await db.query("begin");
      try {
        await db.query("set local role anon");
        await assert.rejects(
          db.query("select admin_reserve_gift($1,$2,'Intrus',null,null)", [
            list.id,
            pid,
          ]),
          /permission denied/,
        );
      } finally {
        await db.query("rollback");
      }
      await assert.rejects(
        db.query(
          "insert into reservations(proposal_id,name) values($1,'Sans auteur')",
          [pid],
        ),
        /email_optional_only_for_admin/,
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from reservations where proposal_id=$1",
            [pid],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await check(
    "Les réservations admin respectent la confidentialité et ne notifient pas une idée privée à l’autre compte",
    async () => {
      const pid = await make("private");
      const iid = (
        await db.query("select idea_id from proposals where id=$1", [pid])
      ).rows[0].idea_id;
      await admin(
        alex,
        "update ideas set title='PRIVE_ADMIN_TEST' where id=$1",
        [iid],
      );
      await assert.rejects(
        admin(elise, "select admin_reserve_gift($1,$2,'Autre',null,null)", [
          list.id,
          pid,
        ]),
        /gift_unavailable/,
      );
      await admin(
        alex,
        "select admin_reserve_gift($1,$2,'Personne',null,null)",
        [list.id, pid],
      );
      const jobs = (
        await db.query(
          "select email from email_jobs where kind='admin_reserved' and payload->>'title'='PRIVE_ADMIN_TEST'",
        )
      ).rows;
      assert.deepEqual(
        jobs.map((j) => j.email),
        ["alex@example.test"],
      );
    },
  );
  await check(
    "Une réservation sans email supporte une modification du cadeau et une déréservation",
    async () => {
      const pid = await make();
      await admin(
        alex,
        "select admin_reserve_gift($1,$2,'Sans email','',null)",
        [list.id, pid],
      );
      const r = (
        await db.query("select * from reservations where proposal_id=$1", [pid])
      ).rows[0];
      await admin(
        alex,
        "update ideas set specifications='Nouvelle taille' where id=(select idea_id from proposals where id=$1)",
        [pid],
      );
      await admin(elise, "select reset_gift($1,false)", [pid]);
      assert.ok(
        (
          await db.query("select cancelled_at from reservations where id=$1", [
            r.id,
          ])
        ).rows[0].cancelled_at,
      );
      assert.equal(
        (await db.query("select reserved from proposals where id=$1", [pid]))
          .rows[0].reserved,
        false,
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from email_jobs where payload->>'accessToken'=$1",
            [r.access_token],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await check(
    "Les participations admin s’arrêtent au budget et une liste étrangère ou archivée est refusée",
    async () => {
      const pid = await make("public", true);
      await assert.rejects(
        admin(alex, "select admin_reserve_gift($1,$2,'Montant',null,100.001)", [
          list.id,
          pid,
        ]),
        /invalid_contribution/,
      );
      await admin(
        alex,
        "select admin_reserve_gift($1,$2,'Participant',null,60)",
        [list.id, pid],
      );
      await assert.rejects(
        admin(elise, "select admin_reserve_gift($1,$2,'Trop',null,60)", [
          list.id,
          pid,
        ]),
        /invalid_contribution/,
      );
      await admin(
        elise,
        "select admin_reserve_gift($1,$2,'Complément',null,40)",
        [list.id, pid],
      );
      assert.equal(
        (await db.query("select reserved from proposals where id=$1", [pid]))
          .rows[0].reserved,
        true,
      );
      const other = (
        await admin(
          alex,
          "insert into lists(name,created_by) values('Refus réservation',$1) returning id",
          [alex],
        )
      ).rows[0].id;
      const free = await make();
      await assert.rejects(
        admin(alex, "select admin_reserve_gift($1,$2,'Hors liste',null,null)", [
          other,
          free,
        ]),
        /gift_unavailable/,
      );
      await admin(alex, "update lists set archived_at=now() where id=$1", [
        other,
      ]);
      await assert.rejects(
        admin(
          alex,
          "select admin_reserve_gift($1,$2,'Liste archivée',null,null)",
          [other, free],
        ),
        /gift_unavailable/,
      );
    },
  );
  await check(
    "Une réservation invitée et une réservation admin simultanées ne créent pas de doublon",
    async () => {
      const pid = await make();
      const adminCall = async () => {
        const c = new pg.Client({ connectionString: url.toString() });
        await c.connect();
        try {
          await c.query("begin");
          await c.query("set local role authenticated");
          await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
            alex,
          ]);
          await c.query(
            "select admin_reserve_gift($1,$2,'Admin concurrent',null,null)",
            [list.id, pid],
          );
          await c.query("commit");
        } finally {
          await c.end();
        }
      };
      const results = await Promise.allSettled([reserve(pid), adminCall()]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from reservations where proposal_id=$1 and cancelled_at is null",
            [pid],
          )
        ).rows[0].n,
        1,
      );
    },
  );

  await check(
    "La liste invitée expose seulement la couleur et la date utiles aux nouveaux filtres",
    async () => {
      const pid = await make();
      const shared = (
        await db.query("select shared_list($1) data", [list.share_token])
      ).rows[0].data;
      const gift = shared.gifts.find((g) => g.id === pid);
      assert.equal(
        gift.recipientColor,
        (
          await db.query("select color from recipients where id=$1", [
            recipient,
          ])
        ).rows[0].color,
      );
      assert.ok(gift.createdAt);
      assert.ok(!("private_note" in gift));
      assert.ok(!("email" in gift));
    },
  );
  await check(
    "Une question crée un seul email destiné simultanément à Alex et Elise",
    async () => {
      const pid = await make();
      const id = (
        await db.query(
          "select submit_gift_question($1,$2,'Sophie','sophie@example.test','Quelle couleur choisir ?') id",
          [list.share_token, pid],
        )
      ).rows[0].id;
      const job = (await db.query("select * from email_jobs where id=$1", [id]))
        .rows[0];
      assert.equal(job.kind, "gift_question");
      assert.deepEqual(
        job.payload.recipientProfileIds.slice().sort(),
        [alex, elise].sort(),
      );
      assert.equal(job.payload.guestEmail, "sophie@example.test");
      assert.equal(job.payload.question, "Quelle couleur choisir ?");
      assert.equal(job.payload.giftId, pid);
      assert.equal(job.payload.listId, list.id);
      await assert.rejects(
        admin(
          alex,
          "select submit_gift_question($1,$2,'Intrus','intrus@example.test','Question')",
          [list.share_token, pid],
        ),
        /permission denied/,
      );
    },
  );
  await check(
    "Une question ne peut pas viser une idée privée, hors liste ou une liste archivée",
    async () => {
      const hidden = await make("private");
      await assert.rejects(
        db.query(
          "select submit_gift_question($1,$2,'Sophie','sophie@example.test','Question')",
          [list.share_token, hidden],
        ),
        /gift_unavailable/,
      );
      const pid = await make();
      const other = (
        await admin(
          alex,
          "insert into lists(name,created_by,archived_at) values('Question fermée',$1,now()) returning share_token",
          [alex],
        )
      ).rows[0].share_token;
      await assert.rejects(
        db.query(
          "select submit_gift_question($1,$2,'Sophie','sophie@example.test','Question')",
          [other, pid],
        ),
        /gift_unavailable/,
      );
      await assert.rejects(
        db.query(
          "select submit_gift_question($1,$2,'Sophie','sophie@example.test','Question')",
          [randomUUID(), pid],
        ),
        /gift_unavailable/,
      );
    },
  );
  await check(
    "Nom, email et message sont requis et la question reste limitée à 2 000 caractères",
    async () => {
      const pid = await make();
      for (const args of [
        [null, "sophie@example.test", "Question"],
        ["Sophie", null, "Question"],
        ["Sophie", "invalide", "Question"],
        ["Sophie", "sophie@example.test", " "],
        ["Sophie", "sophie@example.test", "x".repeat(2001)],
      ]) {
        await assert.rejects(
          db.query("select submit_gift_question($1,$2,$3,$4,$5)", [
            list.share_token,
            pid,
            ...args,
          ]),
          /invalid_question/,
        );
      }
    },
  );
  console.log(`${checks} vérifications PostgreSQL réussies.`);
} finally {
  await db.end();
  await root.query(`drop database ${name} with (force)`);
  await root.end();
}
