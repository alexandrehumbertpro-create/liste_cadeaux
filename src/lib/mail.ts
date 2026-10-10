import "server-only";
import { Resend } from "resend";
import { serviceClient } from "./supabase/server";
const escape = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function drainEmails() {
  if (
    !process.env.RESEND_API_KEY ||
    !process.env.EMAIL_FROM ||
    !process.env.APP_URL
  )
    return { configured: false, sent: 0 };
  const db = serviceClient();
  const { data: jobs, error } = await db.rpc("claim_email_jobs");
  if (error) return { configured: true, sent: 0 };
  let sent = 0;
  for (const job of jobs ?? []) {
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
      const { error: sendError } = await new Resend(
        process.env.RESEND_API_KEY,
      ).emails.send(
        {
          from: process.env.EMAIL_FROM,
          to: job.email,
          subject: subjects[job.kind] || "Kad’Humbert",
          html,
        },
        { idempotencyKey: job.id },
      );
      if (sendError) throw new Error("Envoi refusé");
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
          last_error: "Échec fournisseur, réessai prévu.",
        })
        .eq("id", job.id);
    }
  }
  return { configured: true, sent };
}
