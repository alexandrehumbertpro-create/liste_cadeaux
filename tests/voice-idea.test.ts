import { expect, it } from "vitest";
import { parseVoiceIdea, voiceGiftInput } from "../src/lib/voice-idea";
import { giftInput } from "../src/lib/validation";
const people = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Alex",
    is_common: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Élise",
    is_common: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Commun E&A",
    is_common: true,
  },
];
it("ajoute une idée simple sans exiger personne, prix ou liste", () => {
  const p = parseVoiceIdea("Un atelier de céramique", people);
  expect(p.questions).toEqual([]);
  expect(p.idea).toMatchObject({
    title: "Un atelier de céramique",
    candidates: [],
    visibility: "public",
    priority: 2,
  });
  expect(giftInput.safeParse(voiceGiftInput(p.idea)).success).toBe(true);
  expect(voiceGiftInput(p.idea).listIds).toEqual([]);
});
it("extrait une personne réelle, le budget et la priorité sans perdre les accents du titre", () => {
  const p = parseVoiceIdea(
    "Ajoute un atelier de céramique pour Elise à 60 euros en coup de cœur.",
    people,
  );
  expect(p.questions).toEqual([]);
  expect(p.idea).toMatchObject({
    title: "un atelier de céramique",
    candidates: [people[1].id],
    priceMin: 60,
    priority: 0,
  });
  expect(giftInput.safeParse(voiceGiftInput(p.idea)).success).toBe(true);
});
it("conserve les personnes indépendantes et ne déduit jamais Commun", () => {
  const p = parseVoiceIdea("Une lampe pour Alex et Élise", people);
  expect(p.questions).toEqual([]);
  expect(p.idea.candidates.sort()).toEqual([people[0].id, people[1].id]);
  expect(
    parseVoiceIdea("Une lampe pour commun", people).idea.candidates,
  ).toEqual([people[2].id]);
  expect(
    parseVoiceIdea("Une lampe pour Commun E&A et Alex", people).questions
      .length,
  ).toBeGreaterThan(0);
});
it("n’attribue jamais par approximation un nom inconnu et ignore les personnes supprimées", () => {
  for (const name of ["Alice", "Alex et Alice", "ma mère", "Élise"]) {
    const p = parseVoiceIdea(
      `Une lampe pour ${name}`,
      people.map((p) => ({
        ...p,
        deleted_at: p.name === "Élise" ? "2026-10-01" : null,
      })),
    );
    expect(p.questions.length).toBeGreaterThan(0);
    expect(p.idea.candidates).toEqual([]);
    expect(p.idea.title).toBe("Une lampe");
  }
});
it("respecte la confidentialité explicite et demande en cas de doute", () => {
  for (const privacy of [
    "privé",
    "confidentielle",
    "moi uniquement",
    "pour moi uniquement",
  ]) {
    const p = parseVoiceIdea(`Un livre pour Alex ${privacy}`, people);
    expect(p.questions).toEqual([]);
    expect(p.idea.visibility).toBe("private");
    expect(p.idea.title).toBe("Un livre");
  }
  expect(
    parseVoiceIdea("Un livre pour Alex entre nous", people).idea.visibility,
  ).toBe("household");
  for (const text of [
    "Un livre surprise pour Alex",
    "Un livre pas privé",
    "Un livre pas public",
    "Une lampe coup de cœur et prioritaire",
  ])
    expect(parseVoiceIdea(text, people).questions.length).toBeGreaterThan(0);
});
it("accepte les montants décimaux et fourchettes, demande les budgets indéchiffrables", () => {
  expect(
    parseVoiceIdea("Un livre à 12,50 euros pour Alex", people).idea.priceMin,
  ).toBe(12.5);
  expect(
    parseVoiceIdea("Un livre entre 20 et 40 euros", people).idea,
  ).toMatchObject({ title: "Un livre", priceMin: 20, priceMax: 40 });
  expect(
    parseVoiceIdea("Un livre à soixante euros", people).questions.length,
  ).toBeGreaterThan(0);
  expect(
    parseVoiceIdea("Un livre entre 40 et 20 euros", people).questions.length,
  ).toBeGreaterThan(0);
});
it("reprend le contexte actif seulement quand la dictée ne précise aucune personne", () => {
  expect(
    parseVoiceIdea("Une lampe", people, people[0].id).idea.candidates,
  ).toEqual([people[0].id]);
  expect(
    parseVoiceIdea("Une lampe pour Élise", people, people[0].id).idea
      .candidates,
  ).toEqual([people[1].id]);
  expect(parseVoiceIdea("Une lampe", people, "absent").idea.candidates).toEqual(
    [],
  );
});
it("ne lance aucune autre action et demande de préciser les dictées vides", () => {
  for (const text of [
    "",
    "Ajoute une idée",
    "oui",
    "merci",
    "Supprime une lampe",
    "Réserve un livre",
    "Annule",
    "N’ajoute pas de lampe",
  ])
    expect(parseVoiceIdea(text, people).questions.length, text).toBeGreaterThan(
      0,
    );
  const payload = voiceGiftInput(parseVoiceIdea("Un livre", people).idea);
  for (const key of ["ideaId", "proposalId", "notifyIds"])
    expect(key in payload).toBe(false);
});
