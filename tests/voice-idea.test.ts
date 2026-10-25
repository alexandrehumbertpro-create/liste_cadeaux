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
    visibility: null,
    priority: null,
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
    expect(p.idea.candidates.every((id) => id === people[0].id)).toBe(true);
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
    parseVoiceIdea("Un livre à soixante euros", people).idea.priceMin,
  ).toBe(60);
  expect(
    parseVoiceIdea("Un livre entre 40 et 20 euros", people).questions.length,
  ).toBeGreaterThan(0);
});
it("ne reprend aucun contexte : seuls les champs dictés sont renseignés", () => {
  const p = parseVoiceIdea("Une lampe", people);
  expect(p.idea).toMatchObject({
    candidates: [],
    listIds: [],
    priceMin: null,
    priority: null,
    visibility: null,
  });
  expect(voiceGiftInput(p.idea)).toMatchObject({
    candidates: [],
    listIds: [],
    priceMin: null,
    priority: 2,
    visibility: "public",
  });
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

const lists = [
  {
    id: "00000000-0000-4000-8000-000000000010",
    name: "Noël",
    archived_at: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000011",
    name: "Anniversaire",
    archived_at: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000012",
    name: "Ancienne",
    archived_at: "2025-01-01",
  },
];
it("extrait les personnes, plusieurs listes et tous les réglages dictés", () => {
  const p = parseVoiceIdea(
    "Ajoute un atelier de céramique pour Élise et Alex dans les listes Noël et Anniversaire à soixante euros priorité haute visibilité nous deux",
    people,
    lists,
  );
  expect(p.questions).toEqual([]);
  expect(p.idea).toMatchObject({
    title: "un atelier de céramique",
    candidates: [people[1].id, people[0].id],
    listIds: [lists[0].id, lists[1].id],
    priceMin: 60,
    priority: 1,
    visibility: "household",
  });
  expect(giftInput.safeParse(voiceGiftInput(p.idea)).success).toBe(true);
});
it("accepte les noms et listes avant le titre", () => {
  const p = parseVoiceIdea(
    "Pour Élise dans la liste Noël ajoute un livre",
    people,
    lists,
  );
  expect(p.questions).toEqual([]);
  expect(p.idea.candidates).toEqual([people[1].id]);
  expect(p.idea.listIds).toEqual([lists[0].id]);
  expect(p.idea.title).toBe("un livre");
});
it("reconnaît une liste nommée directement et les noms répétés une seule fois", () => {
  const p = parseVoiceIdea(
    "Un livre pour Élise dans Noël et Anniversaire",
    people,
    lists,
  );
  expect(p.questions).toEqual([]);
  expect(p.idea.title).toBe("Un livre");
  expect(p.idea.listIds).toEqual([lists[0].id, lists[1].id]);
  const repeated = parseVoiceIdea(
    "Un livre pour Alex et Alex dans la liste Noël et Noël",
    people,
    lists,
  );
  expect(repeated.idea.candidates).toEqual([people[0].id]);
  expect(repeated.idea.listIds).toEqual([lists[0].id]);
});
it("demande une précision pour les listes inconnues ou archivées", () => {
  for (const name of ["Vacances", "Ancienne", "Noël et Vacances"]) {
    const p = parseVoiceIdea(
      `Un livre pour Alex dans la liste ${name}`,
      people,
      lists,
    );
    expect(
      p.questions.some((q) => q.includes("liste")),
      name,
    ).toBe(true);
    expect(p.idea.listIds.every((id) => id === lists[0].id)).toBe(true);
  }
});
it("sépare description, précisions et note privée", () => {
  const p = parseVoiceIdea(
    "Ajoute un pull pour Alex. Description : un modèle chaud. Précisions : taille M bleu. Note privée : comparer avec le modèle précédent",
    people,
    lists,
  );
  expect(p.questions).toEqual([]);
  expect(p.idea).toMatchObject({
    title: "un pull",
    candidates: [people[0].id],
    description: "un modèle chaud",
    specifications: "taille M bleu",
    privateNote: "comparer avec le modèle précédent",
  });
});
it("comprend les budgets en lettres et les centimes", () => {
  for (const [amount, value] of [
    ["quatre-vingt-dix", 90],
    ["cent vingt", 120],
    ["deux cent cinquante", 250],
    ["douze virgule cinquante", 12.5],
  ]) {
    const p = parseVoiceIdea(`Un livre pour Alex à ${amount} euros`, people);
    expect(p.questions, String(amount)).toEqual([]);
    expect(p.idea.priceMin, String(amount)).toBe(value);
  }
  expect(
    parseVoiceIdea("Un livre à douze euros cinquante centimes", people).idea
      .priceMin,
  ).toBe(12.5);
});
