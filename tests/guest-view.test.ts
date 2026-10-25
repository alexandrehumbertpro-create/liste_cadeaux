import { expect, it } from "vitest";
import { guestGifts } from "../src/lib/guest-view";
import { giftQuestionInput } from "../src/lib/validation";
import type { SharedGift } from "../src/lib/types";
const gift = (id: string, props: Partial<SharedGift> = {}): SharedGift => ({
  id,
  title: id,
  description: "",
  specifications: "",
  url: null,
  imageUrl: null,
  imageCredit: null,
  priceMin: 40,
  priceMax: null,
  priority: 2,
  recipient: "Alex",
  recipientId: "alex",
  collective: false,
  targetAmount: null,
  contributed: 0,
  reserved: false,
  ...props,
});
const filters = {
  people: [] as string[],
  max: "",
  priority: "",
  status: "",
  sort: "priority" as const,
};
it("combine plusieurs personnes avec un filtre OU et conserve les autres filtres", () => {
  const rows = [
    gift("a"),
    gift("b", { recipientId: "elise", priority: 0 }),
    gift("c", { recipientId: "commun" }),
    gift("d", { recipientId: "elise", priceMin: 80 }),
  ];
  expect(
    guestGifts(rows, { ...filters, people: ["alex", "elise"], max: "50" }).map(
      (g) => g.id,
    ),
  ).toEqual(["b", "a"]);
  expect(guestGifts(rows, { ...filters, people: [] }).length).toBe(4);
});
it("trie les prix dans les deux sens, avec prix inconnus et réservés à la fin", () => {
  const rows = [
    gift("unknown", { priceMin: null }),
    gift("expensive", { priceMin: 100 }),
    gift("cheap", { priceMin: 10 }),
    gift("reserved", { priceMin: 1, reserved: true }),
  ];
  expect(
    guestGifts(rows, { ...filters, sort: "price_asc" }).map((g) => g.id),
  ).toEqual(["cheap", "expensive", "unknown", "reserved"]);
  expect(
    guestGifts(rows, { ...filters, sort: "price_desc" }).map((g) => g.id),
  ).toEqual(["expensive", "cheap", "unknown", "reserved"]);
});
it("trie les derniers ajouts sans déplacer les réservations en tête", () => {
  const rows = [
    gift("old", { createdAt: "2026-01-01" }),
    gift("new", { createdAt: "2026-10-25" }),
    gift("reserved", { createdAt: "2026-10-26", reserved: true }),
  ];
  expect(
    guestGifts(rows, { ...filters, sort: "newest" }).map((g) => g.id),
  ).toEqual(["new", "old", "reserved"]);
});
it("exige un nom, un email et une question bornée", () => {
  const input = {
    token: crypto.randomUUID(),
    gift: crypto.randomUUID(),
    name: "Sophie",
    email: "sophie@example.test",
    question: "Quelle taille ?",
  };
  expect(giftQuestionInput.safeParse(input).success).toBe(true);
  for (const patch of [
    { name: " " },
    { email: "" },
    { question: " " },
    { question: "x".repeat(2001) },
  ])
    expect(giftQuestionInput.safeParse({ ...input, ...patch }).success).toBe(
      false,
    );
});
