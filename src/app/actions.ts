"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  requireAdmin,
  serverClient,
  serviceClient,
} from "@/lib/supabase/server";
import {
  giftInput,
  reservationInput,
  adminReservationInput,
  imageReference,
} from "@/lib/validation";
import { drainEmails, transactionalSenderId } from "@/lib/mail";
import { gmailConfigured, mailbox } from "@/lib/gmail";
import { signImage } from "@/lib/images";
export type Result<T = unknown> =
  { ok: true; data?: T; notice?: string } | { ok: false; error: string };
function message(error: unknown) {
  const text =
    error instanceof Error ? error.message : "Une erreur est survenue.";
  if (text.includes("duplicate key value"))
    return "Ce nom est déjà utilisé. Choisissez un autre nom.";
  const known: Record<string, string> = {
    recipient_exists: "Cette personne existe déjà.",
    common_is_protected: "Commun E&A ne peut pas être modifié ni supprimé.",
    private_notification_forbidden:
      "Une idée privée ne peut pas être envoyée à l’autre administrateur.",
    recipient_not_found: "Personne introuvable.",
    invalid_guest:
      "Indiquez un nom et une adresse email valide si vous en renseignez une.",
    invalid_color: "Choisissez une couleur valide.",
    invalid_name: "Indiquez un nom valide.",
    gift_unavailable:
      "Ce cadeau vient d’être réservé ou n’est plus disponible.",
    invalid_contribution: "Vérifiez le montant restant.",
    creator_only_privacy: "Seul le créateur peut rendre cette idée privée.",
    public_requires_recipient: "Choisissez à qui proposer ce cadeau.",
    other_public_proposal_missing_recipient:
      "Une autre proposition de cette idée n’a pas de destinataire. Attribuez-la avant de publier.",
    recipient_not_a_candidate:
      "Le destinataire doit figurer dans les personnes possibles.",
    recipient_used_by_another_proposal:
      "Cette personne est choisie dans une autre proposition. Modifiez-la avant de retirer la personne.",
    active_collective_participations:
      "Retirez les participations avant de désactiver le cadeau collectif.",
    common_is_exclusive:
      "Commun E&A ne peut pas être sélectionné avec une autre personne.",
  };
  return Object.entries(known).find(([k]) => text.includes(k))?.[1] ?? text;
}
export async function login(email: string, password: string): Promise<Result> {
  const db = await serverClient();
  const { data: session, error } = await db.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !session.user)
    return { ok: false, error: "Email ou mot de passe incorrect." };
  const { data: profile } = await db
    .from("profiles")
    .select("id")
    .eq("id", session.user.id)
    .single();
  if (!profile) {
    await db.auth.signOut();
    return {
      ok: false,
      error: "Ce compte n’a pas été autorisé comme administrateur.",
    };
  }
  return { ok: true };
}
export async function logout() {
  const db = await serverClient();
  await db.auth.signOut();
  redirect("/login");
}
export async function saveGift(input: unknown): Promise<Result<string>> {
  try {
    const { db, user } = await requireAdmin(),
      data = giftInput.parse(input);
    const { data: id, error } = await db.rpc("save_gift_with_notifications", {
      data,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/");
    await drainEmails();
    const connected = data.notifyIds?.length ? await mailbox(user.id) : null;
    return {
      ok: true,
      data: id,
      notice: data.notifyIds?.length
        ? connected && gmailConfigured()
          ? "Idée enregistrée. Notification par email préparée."
          : "Idée enregistrée. Notification en attente : connectez votre compte Gmail depuis Mon compte."
        : undefined,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof z.ZodError ? e.issues[0].message : message(e),
    };
  }
}
export async function createRecipient(
  name: string,
  color = "#e9eeff",
): Promise<Result<{ id: string }>> {
  try {
    const { db } = await requireAdmin();
    const { data: recipient, error } = await db.rpc(
      "add_recipient_with_color",
      {
        new_name: z.string().trim().min(1).max(100).parse(name),
        new_color: z
          .string()
          .regex(/^#[0-9a-f]{6}$/i, "Choisissez une couleur valide.")
          .parse(color),
      },
    );
    if (error)
      throw new Error(
        error.code === "23505" ? "Ce destinataire existe déjà." : error.message,
      );
    revalidatePath("/");
    return { ok: true, data: { id: recipient! } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function updateRecipientColor(
  id: string,
  color: string,
): Promise<Result> {
  try {
    const { db } = await requireAdmin();
    const { error } = await db.rpc("set_recipient_color", {
      person: z.uuid().parse(id),
      new_color: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i, "Choisissez une couleur valide.")
        .parse(color),
    });
    if (error) throw Error(error.message);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function saveList(input: {
  id?: string;
  name: string;
  slogan: string;
  imageUrl: string | null;
}): Promise<Result> {
  try {
    const { db, user } = await requireAdmin();
    const data = z
      .object({
        id: z.uuid().optional(),
        name: z.string().trim().min(1).max(150),
        slogan: z.string().max(1000),
        imageUrl: imageReference.nullable(),
      })
      .parse(input);
    const row = {
      name: data.name,
      slogan: data.slogan,
      image_url: data.imageUrl,
    };
    const query = data.id
      ? db.from("lists").update(row).eq("id", data.id)
      : db.from("lists").insert({ ...row, created_by: user.id });
    const { error } = await query;
    if (error) throw new Error(error.message);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function archiveGift(
  id: string,
  reason: string,
  note: string,
): Promise<Result> {
  try {
    const { db } = await requireAdmin();
    z.uuid().parse(id);
    z.enum(["offered", "abandoned", "unavailable", "other"]).parse(reason);
    if (reason === "other" && !note.trim())
      throw new Error("Précisez le motif.");
    const { error } = await db
      .from("proposals")
      .update({
        archive_reason: reason,
        archive_note: note,
        archived_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/");
    await drainEmails();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function resetGift(
  id: string,
  restore = false,
): Promise<Result<{ emailConfigured: boolean }>> {
  try {
    const { db } = await requireAdmin();
    const { error } = await db.rpc("reset_gift", {
      gift: z.uuid().parse(id),
      restore,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/");
    const delivery = await drainEmails();
    return {
      ok: true,
      data: { emailConfigured: delivery.transactionalConfigured },
    };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function revealGift(
  id: string,
): Promise<Result<{ name: string; amount: number | null }[]>> {
  try {
    const { db } = await requireAdmin();
    const { data, error } = await db.rpc("reveal_gift", {
      gift: z.uuid().parse(id),
    });
    if (error) throw new Error(error.message);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function archiveList(
  id: string,
  restore = false,
): Promise<Result> {
  try {
    const { db } = await requireAdmin();
    const { error } = await db
      .from("lists")
      .update({ archived_at: restore ? null : new Date().toISOString() })
      .eq("id", z.uuid().parse(id));
    if (error) throw new Error(error.message);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function updatePreferences(
  preferences: Record<string, unknown>,
): Promise<Result> {
  try {
    const { db, user } = await requireAdmin();
    if (JSON.stringify(preferences).length > 50000)
      throw new Error("Préférences trop volumineuses.");
    const { error } = await db
      .from("profiles")
      .update({ preferences })
      .eq("id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function uploadImage(
  form: FormData,
): Promise<Result<{ path: string; url: string }>> {
  try {
    const { db, user } = await requireAdmin();
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size > 5 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        file.type,
      )
    )
      throw new Error(
        "Choisissez une image JPG, PNG, WebP ou GIF de moins de 5 Mo.",
      );
    const path =
      user.id + "/" + crypto.randomUUID() + "." + file.type.split("/")[1];
    const { error } = await db.storage
      .from("gift-images")
      .upload(path, file, { contentType: file.type });
    if (error) throw new Error(error.message);
    return {
      ok: true,
      data: {
        path: "storage:" + path,
        url: (await signImage("storage:" + path))!,
      },
    };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function recordShare(
  listId: string,
  name: string,
  channel: string,
): Promise<Result> {
  try {
    const { db, user } = await requireAdmin();
    const { error } = await db.from("share_history").insert({
      list_id: z.uuid().parse(listId),
      created_by: user.id,
      contact_name: z.string().trim().min(1).max(100).parse(name),
      channel: z.enum(["whatsapp", "gmail", "sms"]).parse(channel),
    });
    if (error) throw new Error(error.message);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
async function throttle(scope: string) {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "local";
  const key = createHash("sha256")
    .update(scope + ":" + ip)
    .digest("hex");
  const { data, error } = await serviceClient().rpc("rate_limit", {
    request_key: key,
    max_requests: 15,
    window_seconds: 600,
  });
  if (error || !data)
    throw new Error("Trop de demandes. Réessayez dans quelques minutes.");
}
export async function reserveGift(
  input: unknown,
): Promise<Result<{ accessToken: string; emailQueued: boolean }>> {
  try {
    const v = reservationInput.parse(input);
    await throttle("reserve");
    const { data, error } = await serviceClient().rpc("reserve_gift", {
      token: v.token,
      gift: v.gift,
      guest_name: v.name,
      guest_email: v.email,
      contribution: v.amount,
    });
    if (error) throw new Error(error.message);
    await drainEmails();
    return {
      ok: true,
      data: { accessToken: data.accessToken, emailQueued: true },
    };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof z.ZodError
          ? "Vérifiez votre nom, email et montant."
          : message(e),
    };
  }
}
export async function reserveForGuest(
  input: unknown,
): Promise<Result<{ emailQueued: boolean }>> {
  try {
    const { db } = await requireAdmin();
    const v = adminReservationInput.parse(input);
    const { data, error } = await db.rpc("admin_reserve_gift", {
      list_ref: v.listId,
      gift: v.gift,
      guest_name: v.name,
      guest_email: v.email || null,
      contribution: v.amount,
    });
    if (error) throw Error(error.message);
    revalidatePath("/");
    await drainEmails().catch(() => undefined);
    return { ok: true, data: { emailQueued: Boolean(data?.emailQueued) } };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof z.ZodError
          ? "Vérifiez le nom, l’email et le montant."
          : message(e),
    };
  }
}
export async function cancelReservation(token: string): Promise<Result> {
  try {
    await throttle("cancel");
    const { data, error } = await serviceClient().rpc("cancel_reservation", {
      token: z.uuid().parse(token),
    });
    if (error || !data) throw new Error("Réservation introuvable.");
    await drainEmails();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function changeProposalLists(
  id: string,
  listIds: string[],
): Promise<Result> {
  try {
    const { db } = await requireAdmin();
    const { error } = await db
      .from("proposals")
      .update({ list_ids: z.array(z.uuid()).parse(listIds) })
      .eq("id", z.uuid().parse(id));
    if (error) throw new Error(error.message);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function duplicateProposals(
  listId: string,
  ids: string[],
  name: string,
): Promise<Result> {
  try {
    const { db } = await requireAdmin();
    const { error } = await db.rpc("duplicate_proposals", {
      source_list: z.uuid().parse(listId),
      gifts: z.array(z.uuid()).max(1000).parse(ids),
      list_name: z.string().trim().min(1).max(150).parse(name),
    });
    if (error) throw new Error(error.message);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function undoArchive(id: string): Promise<Result> {
  try {
    const { db } = await requireAdmin();
    const { error } = await db
      .from("proposals")
      .update({ archived_at: null, archive_reason: null, archive_note: "" })
      .eq("id", z.uuid().parse(id));
    if (error) throw new Error(error.message);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function addCandidate(
  ideaId: string,
  recipientId: string,
): Promise<Result> {
  try {
    const { db } = await requireAdmin();
    z.uuid().parse(ideaId);
    z.uuid().parse(recipientId);
    const { data: idea, error } = await db
      .from("ideas")
      .select("candidates")
      .eq("id", ideaId)
      .single();
    if (error) throw new Error("Idée inaccessible.");
    const { data: person } = await db
      .from("recipients")
      .select("is_common")
      .eq("id", recipientId)
      .single();
    if (!person) throw new Error("Destinataire introuvable.");
    const { data: commons } = await db
      .from("recipients")
      .select("id")
      .eq("is_common", true);
    const candidates = person.is_common
      ? [recipientId]
      : [
          ...new Set([
            ...idea.candidates.filter(
              (id: string) => !commons?.some((c) => c.id === id),
            ),
            recipientId,
          ]),
        ];
    const { error: updateError } = await db
      .from("ideas")
      .update({ candidates })
      .eq("id", ideaId);
    if (updateError) throw new Error(updateError.message);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function renameRecipient(
  id: string,
  name: string,
): Promise<Result> {
  try {
    const { db } = await requireAdmin();
    const { error } = await db.rpc("rename_recipient", {
      person: z.uuid().parse(id),
      new_name: z.string().trim().min(1).max(100).parse(name),
    });
    if (error) throw Error(error.message);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function removeRecipient(
  id: string,
  archive: boolean,
): Promise<Result> {
  try {
    const { db } = await requireAdmin();
    const { error } = await db.rpc("remove_recipient", {
      person: z.uuid().parse(id),
      archive_ideas: archive,
    });
    if (error) throw Error(error.message);
    revalidatePath("/");
    await drainEmails();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function shareIdeaEmail(
  proposalId: string,
  to: string,
): Promise<Result> {
  try {
    const { db, user } = await requireAdmin();
    await throttle("share");
    const address = z.email().max(254).parse(to);
    const { data: proposal } = await db
      .from("proposals")
      .select("idea_id")
      .eq("id", z.uuid().parse(proposalId))
      .single();
    if (!proposal) throw Error("Idée inaccessible.");
    const { data: job, error } = await serviceClient()
      .from("email_jobs")
      .insert({
        email: address,
        kind: "quick_share",
        payload: {
          senderProfileId: user.id,
          ideaId: proposal.idea_id,
          proposalId,
        },
      })
      .select("id")
      .single();
    if (error) throw Error("Impossible de préparer cet email.");
    await drainEmails();
    const { data: state } = await serviceClient()
      .from("email_jobs")
      .select("status,last_error")
      .eq("id", job.id)
      .single();
    return {
      ok: true,
      notice:
        state?.status === "sent"
          ? "Email envoyé depuis votre compte Gmail."
          : state?.status === "cancelled"
            ? "Envoi annulé : l’accès à l’idée a changé."
            : "Email enregistré en attente. Connectez ou reconnectez votre compte Gmail depuis Mon compte.",
    };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof z.ZodError
          ? "Indiquez une adresse email valide."
          : message(e),
    };
  }
}
export async function disconnectGmail(): Promise<Result> {
  try {
    const { user } = await requireAdmin();
    const { error } = await serviceClient()
      .from("admin_mailboxes")
      .delete()
      .eq("profile_id", user.id);
    if (error) throw Error("Impossible de déconnecter Gmail.");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function retryMyEmails(): Promise<Result> {
  try {
    const { user } = await requireAdmin();
    if (!gmailConfigured() || !(await mailbox(user.id)))
      throw Error(
        "Connectez votre compte Gmail avant de réessayer les emails.",
      );
    await serviceClient()
      .from("email_jobs")
      .update({ attempts: 0 })
      .eq("status", "pending")
      .eq("payload->>senderProfileId", user.id);
    // Only the designated automatic sender may restart reservation jobs.
    if ((await transactionalSenderId()) === user.id) {
      await serviceClient()
        .from("email_jobs")
        .update({ attempts: 0 })
        .eq("status", "pending")
        .not("kind", "in", "(idea_added,quick_share)");
    }
    await drainEmails();
    return { ok: true, notice: "Les emails en attente ont été réessayés." };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
