import type { Activity, Dataset } from "./types";
export const shareChannels: Record<string, string> = {
  whatsapp: "WhatsApp",
  gmail: "Email",
  sms: "SMS",
};
export function listHistory(data: Dataset, listId: string) {
  const visible = new Set(data.ideas.map((i) => i.id));
  return data.activity
    .filter(
      (a) =>
        a.list_ids?.includes(listId) && (!a.idea_id || visible.has(a.idea_id)),
    )
    .sort(
      (a, b) =>
        Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id,
    );
}
const labels: Record<string, string> = {
  name: "Nom de la liste",
  slogan: "Message d’accueil",
  image_url: "Illustration",
  title: "Titre",
  description: "Description",
  specifications: "Précisions",
  private_note: "Note de gestion",
  price_min: "Prix minimum",
  price_max: "Prix maximum",
  visibility: "Visibilité",
  candidates: "Pour qui",
  recipient_id: "Pour qui",
  list_ids: "Listes",
  is_global: "Toutes les listes",
  priority: "Priorité",
  collective: "Cadeau collectif",
  target_amount: "Budget collectif",
  contributed: "Participation totale",
  reserved: "Réservation",
  archive_reason: "Motif d’archivage",
  archive_note: "Précision d’archivage",
  archived_at: "Archivage",
  contact_name: "Destinataire du partage",
  channel: "Mode de partage",
  url: "Lien produit",
  image_credit: "Crédit photo",
};
function value(key: string, raw: unknown, data: Dataset): string {
  if (raw === null || raw === undefined || raw === "") return "Non renseigné";
  if (key === "image_url") return "Image renseignée";
  if (key === "image_credit") return "Crédit renseigné";
  if (key === "private_note") return "Note renseignée";
  if (key === "recipient_id")
    return (
      data.recipients.find((r) => r.id === raw)?.name || "Personne retirée"
    );
  if (key === "candidates")
    return Array.isArray(raw)
      ? raw
          .map(
            (id) =>
              data.recipients.find((r) => r.id === id)?.name ||
              "Personne retirée",
          )
          .join(", ") || "Aucune personne"
      : "Aucune personne";
  if (key === "list_ids")
    return Array.isArray(raw)
      ? raw
          .map(
            (id) =>
              data.lists.find((l) => l.id === id)?.name || "Liste retirée",
          )
          .join(", ") || "Aucune liste"
      : "Aucune liste";
  if (key === "priority")
    return ["Coup de cœur", "Idée prioritaire", "Idée"][Number(raw)] || "Idée";
  if (key === "visibility")
    return (
      (
        {
          public: "Public",
          household: "Nous deux",
          private: "Moi uniquement",
        } as Record<string, string>
      )[String(raw)] || String(raw)
    );
  if (key === "archive_reason")
    return (
      (
        {
          offered: "Offert",
          abandoned: "Idée écartée",
          unavailable: "Indisponible",
          other: "Autre motif",
        } as Record<string, string>
      )[String(raw)] || String(raw)
    );
  if (key === "reserved") return raw ? "Réservé" : "Disponible";
  if (key === "channel") return shareChannels[String(raw)] || String(raw);
  if (key === "archived_at") return "Archivé";
  if (["price_min", "price_max", "target_amount", "contributed"].includes(key))
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(Number(raw));
  if (typeof raw === "boolean") return raw ? "Oui" : "Non";
  if (typeof raw === "string" || typeof raw === "number") return String(raw);
  return "Valeur modifiée";
}
export function activityDetails(a: Activity, data: Dataset) {
  return Object.entries(a.changes)
    .filter(([, c]) => JSON.stringify(c.before) !== JSON.stringify(c.after))
    .map(([key, c]) => {
      const label = labels[key] || "Paramètre";
      if (["image_url", "image_credit", "private_note"].includes(key))
        return label + " : " + (c.after ? "modifiée" : "retirée");
      if (key === "archived_at")
        return "Archivage : " + (c.after ? "Archivé" : "Actif");
      return `${label} : ${value(key, c.before, data)} → ${value(key, c.after, data)}`;
    });
}
export function activityActor(a: Activity, data: Dataset) {
  return (
    data.profiles.find((p) => p.id === a.actor_id)?.display_name ||
    (a.actor_id
      ? "Ancien gestionnaire"
      : "reserved" in a.changes || "contributed" in a.changes
        ? "Invité (identité masquée)"
        : "Système")
  );
}
