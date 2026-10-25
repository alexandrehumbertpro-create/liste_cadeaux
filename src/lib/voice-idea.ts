import type { Recipient, Visibility } from "./types";
import type { GiftInput } from "./validation";

export type VoiceIdea = {
  title: string;
  candidates: string[];
  priceMin: number | null;
  priceMax: number | null;
  priority: number;
  visibility: Visibility;
};
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe");
const clean = (text: string) =>
  text.replace(/^[\s,;:.!?]+|[\s,;:.!?]+$/g, "").trim();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Deliberately conservative: ambiguous instructions are reviewed, never guessed.
// No external language model, API key or audio storage is needed.
export function parseVoiceIdea(
  transcript: string,
  recipients: Recipient[],
  defaultRecipientId?: string,
): { idea: VoiceIdea; questions: string[] } {
  const people = recipients.filter((r) => !r.deleted_at);
  const idea: VoiceIdea = {
    title: "",
    candidates:
      defaultRecipientId && people.some((r) => r.id === defaultRecipientId)
        ? [defaultRecipientId]
        : [],
    priceMin: null,
    priceMax: null,
    priority: 2,
    visibility: "public",
  };
  const questions: string[] = [];
  let text = clean(transcript);
  // Replace normalized matches using their actual original lengths (œ can expand).
  const remove = (pattern: RegExp) => {
    const match = normalize(text).match(pattern);
    if (!match || match.index === undefined) return null;
    const original = [...text];
    let start = 0,
      end = 0,
      count = 0;
    for (let i = 0; i < original.length; i++) {
      if (count <= match.index) start = i;
      count += normalize(original[i]).length;
      if (count >= match.index + match[0].length) {
        end = i + 1;
        break;
      }
    }
    text = clean(
      original.slice(0, start).join("") + " " + original.slice(end).join(""),
    );
    return match;
  };
  if (
    /^(?:reserve|supprime|archive|modifie|envoie|partage|liste|montre|annule|n['’]ajoute|ne\s+)\b/.test(
      normalize(text),
    )
  )
    questions.push(
      "La dictée sert uniquement à ajouter une idée. Quelle idée souhaitez-vous noter ?",
    );
  remove(
    /^(?:(?:s'il te plait|peux-tu)\s+)?(?:ajoute(?:r)?|note(?:r)?|enregistre(?:r)?|cree(?:r)?)\s+(?:(?:une|cette|l')\s*idee(?:\s+cadeau)?\s*[:,:]?\s*)?/,
  );
  remove(/\s+s'il te plait$/);

  if (
    /\b(?:pas|non|sans)\s+(?:en\s+)?(?:public|prive|coup de coeur|prioritaire)\b/.test(
      normalize(text),
    )
  )
    questions.push(
      "Pouvez-vous vérifier la visibilité et la priorité souhaitées ?",
    );
  if (
    remove(
      /\b(?:en\s+)?(?:pour moi uniquement|moi uniquement|privee?|confidentielle?)\b/,
    )
  )
    idea.visibility = "private";
  else if (remove(/\b(?:visibilite\s+)?(?:nous deux|entre nous)\b/))
    idea.visibility = "household";
  else remove(/\b(?:visibilite\s+)?publi(?:c|que)\b/);
  if (
    /\b(?:secret|surprise|cacher)\b/.test(normalize(text)) &&
    idea.visibility === "public"
  )
    questions.push(
      "Cette idée doit-elle rester privée ? Vérifiez sa visibilité.",
    );
  if (
    /\bcoup de coeur\b/.test(normalize(text)) &&
    /\bprioritaire\b/.test(normalize(text))
  )
    questions.push("Choisissez une seule priorité pour cette idée.");
  if (remove(/\b(?:en\s+)?coup de coeur\b/)) idea.priority = 0;
  else if (remove(/\b(?:en\s+)?(?:idee\s+)?prioritaire\b/)) idea.priority = 1;

  const amount = "(\\d+(?:[.,]\\d{1,2})?)";
  const range = remove(
    new RegExp(
      `\\b(?:budget\\s+)?entre\\s+${amount}\\s+(?:et|a)\\s+${amount}\\s*(?:euros?|€)`,
      "i",
    ),
  );
  const price = range
    ? null
    : remove(
        new RegExp(
          `(?:\\b(?:pour un budget de|avec un budget de|budget(?: de)?|autour de|environ|a)\\s+)?${amount}\\s*(?:euros?\\b|€)`,
          "i",
        ),
      );
  if (range) {
    idea.priceMin = Number(range[1].replace(",", "."));
    idea.priceMax = Number(range[2].replace(",", "."));
  } else if (price) idea.priceMin = Number(price[1].replace(",", "."));
  if (idea.priceMax !== null && idea.priceMin! > idea.priceMax)
    questions.push("Quel est le bon budget minimum et maximum ?");
  if (/\b(?:budget|euros?)\b|€/.test(normalize(text)))
    questions.push(
      "Je n’ai pas identifié le budget avec certitude. Pouvez-vous le préciser en chiffres ?",
    );

  const marker = normalize(text).match(/\bpour\s+/);
  if (marker && marker.index !== undefined) {
    // Recipient clauses are only accepted if every name is accounted for.
    // Never fuzzy-match an unknown name to somebody else.
    const suffix = normalize(text).slice(marker.index + marker[0].length);
    let rest = clean(suffix);
    const found: string[] = [];
    for (const person of [...people].sort(
      (a, b) => b.name.length - a.name.length,
    )) {
      const aliases = person.is_common
        ? [normalize(person.name), "commun"]
        : [normalize(person.name)];
      for (const alias of aliases) {
        const re = new RegExp(
          `(^|[\\s,;&])${escape(alias)}(?=$|[\\s,;.!?&])`,
          "g",
        );
        if (re.test(rest)) {
          found.push(person.id);
          rest = rest.replace(re, " ");
          break;
        }
      }
    }
    rest = clean(rest.replace(/\b(?:et|aussi|egalement)\b|[&,;]/g, " "));
    if (found.length && !rest) {
      idea.candidates = [...new Set(found)];
      // Remove suffix using normalized matching helper.
      remove(/\bpour\s+.+$/);
    } else {
      questions.push(
        `Pour qui est cette idée ? Je n’ai pas identifié « ${clean(suffix)} » avec certitude.`,
      );
      idea.candidates = [];
      // Keep uncertain clause out of the title, but keep transcript in the UI.
      remove(/\bpour\s+.+$/);
    }
  }
  if (
    idea.candidates.length > 1 &&
    people.some((r) => r.is_common && idea.candidates.includes(r.id))
  )
    questions.push("Choisissez Commun E&A seul, ou les personnes séparément.");
  idea.title = clean(text.replace(/\s+/g, " "));
  if (
    !idea.title ||
    /^(?:(?:une?\s+)?idee(?:\s+cadeau)?|merci|oui|non|euh|stop|annuler)$/i.test(
      normalize(idea.title),
    )
  )
    questions.push("Quelle idée souhaitez-vous ajouter ?");
  if (idea.title.length > 200)
    questions.push("Pouvez-vous raccourcir le titre à 200 caractères ?");
  return { idea, questions };
}

export function voiceGiftInput(idea: VoiceIdea, listId?: string): GiftInput {
  return {
    ...idea,
    description: "",
    specifications: "",
    privateNote: "",
    url: "",
    imageUrl: "",
    imageCredit: null,
    recipientId: idea.candidates[0] ?? null,
    listIds: listId ? [listId] : [],
    global: false,
    collective: false,
    targetAmount: null,
  };
}
