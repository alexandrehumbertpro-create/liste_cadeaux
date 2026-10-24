import "server-only";
import { gmailConfigured, sendGmail, type InlineImage } from "./gmail";
import { serviceClient } from "./supabase/server";
const escape = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
// The automatic sender is deliberately Alex, never whichever administrator
// happens to be logged in or the first connected mailbox.
export async function transactionalSenderId() {
  if (!gmailConfigured()) return null;
  const db = serviceClient();
  const { data: alex } = await db
    .from("profiles")
    .select("id,email")
    .ilike("display_name", "Alex")
    .maybeSingle();
  if (!alex) return null;
  const { data: connection } = await db
    .from("admin_mailboxes")
    .select("email")
    .eq("profile_id", alex.id)
    .maybeSingle();
  return connection?.email.toLowerCase() === alex.email.toLowerCase()
    ? alex.id
    : null;
}
export async function drainEmails() {
  const gmail = gmailConfigured();
  const automaticSender = await transactionalSenderId();
  if (!gmail)
    return {
      configured: false,
      transactionalConfigured: false,
      gmailConfigured: false,
      sent: 0,
    };
  const db = serviceClient();
  const jobs: any[] = [];
  for (const provider of [
    // "resend" is the legacy SQL queue selector for reservation jobs.
    // Retaining it avoids a database migration; delivery below uses Gmail.
    ...(automaticSender ? ["resend"] : []),
    ...(gmail ? ["gmail"] : []),
  ]) {
    const result = await db.rpc("claim_email_jobs_for_provider", { provider });
    if (result.data) jobs.push(...result.data);
  }
  let sent = 0;
  for (const job of jobs ?? []) {
    if (["idea_added", "quick_share"].includes(job.kind)) {
      try {
        const { data: idea } = await db
          .from("ideas")
          .select("*")
          .eq("id", job.payload.ideaId)
          .single();
        const allowed =
          idea &&
          (idea.visibility !== "private" ||
            idea.owner_id === job.payload.senderProfileId) &&
          (job.kind !== "idea_added" ||
            idea.visibility !== "private" ||
            idea.owner_id === job.payload.recipientProfileId);
        if (!allowed) {
          await db
            .from("email_jobs")
            .update({
              status: "cancelled",
              last_error: "Envoi annulé : accès à l’idée retiré.",
            })
            .eq("id", job.id);
          continue;
        }
        const { data: proposals } = await db
          .from("proposals")
          .select("id,recipient_id,priority,archived_at")
          .eq("idea_id", idea.id);
        const { data: recipients } = await db
          .from("recipients")
          .select("id,name,deleted_at");
        const selectedProposals = job.payload.proposalId
          ? (proposals || []).filter((p) => p.id === job.payload.proposalId)
          : proposals || [];
        const priority = ["♥ Coup de cœur", "★ Idée prioritaire", "Idée"][
          selectedProposals[0]?.priority ?? 2
        ];
        const people = [
          ...new Set(
            selectedProposals
              .map(
                (p) =>
                  recipients?.find(
                    (r) =>
                      r.id === p.recipient_id &&
                      (!r.deleted_at || p.archived_at),
                  )?.name,
              )
              .filter(Boolean),
          ),
        ].join(", ");
        const subject =
          job.kind === "idea_added"
            ? "Nouvelle idée cadeau : " + idea.title
            : "Une idée cadeau pour vous : " + idea.title;
        const price =
          idea.price_min === null
            ? "Prix non renseigné"
            : String(idea.price_min) +
              (idea.price_max !== null ? "–" + idea.price_max : "") +
              " €";
        const product =
          typeof idea.url === "string" && /^https?:\/\//.test(idea.url)
            ? `<p><a href="${escape(idea.url)}">Voir le produit</a></p>`
            : "";
        const link =
          job.kind === "idea_added"
            ? `<p><a href="${escape(process.env.APP_URL + "/?idea=" + job.payload.proposalId)}">Ouvrir le carnet</a></p>`
            : "";
        let image: InlineImage | undefined;
        let illustration = "";
        if (
          typeof idea.image_url === "string" &&
          idea.image_url.startsWith("storage:")
        ) {
          const { data: photo } = await db.storage
            .from("gift-images")
            .download(idea.image_url.slice(8));
          if (
            photo &&
            photo.size <= 5 * 1024 * 1024 &&
            ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
              photo.type,
            )
          ) {
            image = {
              content: new Uint8Array(await photo.arrayBuffer()),
              contentType: photo.type,
            };
            illustration =
              '<img src="cid:gift-image" width="400" alt="Illustration du cadeau">';
          }
        } else if (
          typeof idea.image_url === "string" &&
          /^https?:\/\//.test(idea.image_url)
        )
          illustration = `<img src="${escape(idea.image_url)}" width="400" alt="Illustration du cadeau">`;
        const html = `<h1>Kad’Humbert</h1><h2>${escape(idea.title)}</h2>${illustration}${people ? `<p>Pour : ${escape(people)}</p>` : ""}<p>${escape(price)} · ${escape(priority)}</p><p>${escape(idea.description)}</p><p>${escape(idea.specifications)}</p>${product}${link}<p>Pour les âmes en panne d’inspiration</p>`;
        await sendGmail(
          job.payload.senderProfileId,
          job.email,
          subject,
          html,
          image,
        );
        await db
          .from("email_jobs")
          .update({ status: "sent", last_error: null })
          .eq("id", job.id);
        sent++;
      } catch (e) {
        const reason =
          e instanceof Error &&
          /^(Connectez|La connexion Gmail|Gmail n’a)/.test(e.message)
            ? e.message
            : "Envoi Gmail en attente. Réessayez.";
        await db
          .from("email_jobs")
          .update({ status: "pending", last_error: reason })
          .eq("id", job.id);
      }
      continue;
    }

    const url =
      process.env.APP_URL +
      "/reservation/" +
      encodeURIComponent(job.payload.accessToken ?? "");
    const title = escape(job.payload.title || "Votre cadeau");
    const subjects: Record<string, string> = {
      reserved: "Votre cadeau est réservé",
      admin_reserved: "Une idée a été réservée",
      changed: "Une idée réservée a changé",
      cancelled: "Votre réservation est annulée",
    };
    const recap =
      job.kind === "reserved"
        ? `<p>Pour : ${escape(job.payload.recipient)}</p><p>${escape(job.payload.specifications)}</p><p>Budget : ${escape(job.payload.priceMin ?? "non renseigné")}${job.payload.priceMax !== null && job.payload.priceMax !== undefined ? "–" + escape(job.payload.priceMax) : ""} €</p>${job.payload.amount !== null && job.payload.amount !== undefined ? `<p>Participation : ${escape(job.payload.amount)} € (sans paiement)</p>` : ""}${typeof job.payload.url === "string" && /^https?:\/\//.test(job.payload.url) ? `<p><a href="${escape(job.payload.url)}">Voir le produit</a></p>` : ""}`
        : "";
    const html = `<h1>Kad’Humbert</h1><p>${escape(subjects[job.kind] || "Votre réservation")} : ${title}</p>${job.kind === "admin_reserved" ? "<p>Le nom du réservant reste masqué. Consultez votre carnet pour en savoir plus.</p>" : `<p><a href="${escape(url)}">Consulter ou annuler ma réservation</a></p>`}${recap}<p>Pour les âmes en panne d’inspiration</p>`;
    try {
      if (!automaticSender)
        throw Error(
          "Connectez le Gmail d’Alex pour envoyer les notifications de réservation.",
        );
      await sendGmail(
        automaticSender,
        job.email,
        subjects[job.kind] || "Kad’Humbert",
        html,
      );
      await db
        .from("email_jobs")
        .update({ status: "sent", last_error: null })
        .eq("id", job.id);
      sent++;
    } catch {
      await db
        .from("email_jobs")
        .update({
          status: "pending",
          last_error:
            "Envoi automatique Gmail en attente. Vérifiez la connexion Gmail d’Alex, puis réessayez.",
        })
        .eq("id", job.id);
    }
  }
  return {
    configured: true,
    transactionalConfigured: Boolean(automaticSender),
    gmailConfigured: gmail,
    sent,
  };
}
