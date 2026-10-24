import { z } from "zod";
export const imageReference = z
  .string()
  .trim()
  .max(4000)
  .refine((value) => {
    if (
      !value ||
      /^storage:[a-f0-9-]+\/[a-f0-9-]+\.(jpeg|jpg|png|webp|gif)$/i.test(value)
    )
      return true;
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Utilisez le lien direct d’une image en http ou https.");
const nullableNumber = z.number().finite().min(0).max(999999999).nullable();
export const giftInput = z
  .object({
    ideaId: z.uuid().optional(),
    proposalId: z.uuid().optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(10000),
    specifications: z.string().max(5000),
    privateNote: z.string().max(10000),
    url: z.union([
      z.literal(""),
      z.url().refine((v) => /^https?:\/\//.test(v)),
    ]),
    imageUrl: imageReference,
    imageCredit: z
      .object({
        name: z.string().max(200),
        url: z.url(),
        downloadUrl: z.url().optional(),
      })
      .nullable(),
    priceMin: nullableNumber,
    priceMax: nullableNumber,
    visibility: z.enum(["private", "household", "public"]),
    candidates: z.array(z.uuid()).max(100),
    recipientId: z.uuid().nullable(),
    listIds: z.array(z.uuid()).max(100),
    global: z.boolean(),
    priority: z.number().int().min(0).max(2),
    collective: z.boolean(),
    targetAmount: nullableNumber,
  })
  .superRefine((v, c) => {
    if (v.priceMax !== null && (v.priceMin === null || v.priceMax < v.priceMin))
      c.addIssue({
        code: "custom",
        message: "Le maximum doit être supérieur ou égal au minimum.",
      });
    if (v.recipientId && !v.candidates.includes(v.recipientId))
      c.addIssue({
        code: "custom",
        message:
          "Le destinataire choisi doit faire partie des personnes possibles.",
      });
    if (v.collective && (!v.targetAmount || v.targetAmount <= 0))
      c.addIssue({
        code: "custom",
        message: "Indiquez le budget du cadeau collectif.",
      });
  });
export const reservationInput = z.object({
  token: z.uuid(),
  gift: z.uuid(),
  name: z.string().trim().min(1).max(100),
  email: z.email().max(254),
  amount: z.number().finite().positive().max(999999999).nullable(),
});
export type GiftInput = z.infer<typeof giftInput>;
export function formatPrice(min: number | null, max: number | null) {
  if (min === null) return "Prix non renseigné";
  return max !== null
    ? `${min.toLocaleString("fr-FR")}–${max.toLocaleString("fr-FR")} €`
    : `${min.toLocaleString("fr-FR")} €`;
}
export function budgetOverlap(
  min: number | null,
  max: number | null,
  filterMin: number | null,
  filterMax: number | null,
) {
  if (filterMin === null && filterMax === null) return true;
  return (
    min !== null &&
    (max ?? min) >= (filterMin ?? 0) &&
    min <= (filterMax ?? Infinity)
  );
}

export function inList(
  p: {
    id: string;
    idea_id: string;
    recipient_id: string | null;
    list_ids: string[];
    is_global: boolean;
  },
  id: string,
  all: (typeof p)[],
) {
  return (
    p.list_ids.includes(id) ||
    (p.is_global &&
      !all.some(
        (other) =>
          other.id !== p.id &&
          other.idea_id === p.idea_id &&
          other.recipient_id === p.recipient_id &&
          other.list_ids.includes(id),
      ))
  );
}
