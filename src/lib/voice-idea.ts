import type { Recipient, Visibility, GiftList } from "./types";
import type { GiftInput } from "./validation";

export type VoiceIdea = {
  title: string;
  candidates: string[];
  listIds: string[];
  priceMin: number | null;
  priceMax: number | null;
  priority: number | null;
  visibility: Visibility | null;
  description: string;
  specifications: string;
  privateNote: string;
  url: string;
};
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/’/g, "'");
const clean = (s: string) =>
  s
    .replace(/^[\s,;:.!?]+|[\s,;:.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const units: Record<string, number> = {
  zero: 0,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
  vingt: 20,
  trente: 30,
  quarante: 40,
  cinquante: 50,
  soixante: 60,
};
function numberValue(s: string): number {
  const parts = normalize(s)
    .trim()
    .split(/\s+virgule\s+/);
  function integer(text: string) {
    if (/^\d+(?:[.,]\d+)?$/.test(text)) return Number(text.replace(",", "."));
    let total = 0,
      group = 0,
      previous = "";
    for (const word of text.split(/[\s-]+/)) {
      if (word === "et") continue;
      if (word === "mille") {
        total += (group || 1) * 1000;
        group = 0;
      } else if (/^cents?$/.test(word)) group = (group || 1) * 100;
      else if (/^vingts?$/.test(word) && previous === "quatre") group += 76;
      else if (word in units) group += units[word];
      else if (word === "vingts") group += 20;
      else if (/^\d+$/.test(word)) group += Number(word);
      else return NaN;
      previous = word;
    }
    return total + group;
  }
  const n = integer(parts[0]);
  if (parts.length === 1) return n;
  const decimal = integer(parts[1]);
  return n + decimal / 10 ** String(decimal).length;
}
const numWord = `(?:\\d+(?:[.,]\\d{1,2})?|${Object.keys(units).join("|")}|vingts|cents?|mille)`;
const amount = `(${numWord}(?:[ -]+(?:${numWord}|et|virgule))*)`;

// Resolve only explicit fields against the current catalogue. No page context,
// guessed recipient/list, external language model or audio storage is used.
export function parseVoiceIdea(
  transcript: string,
  recipients: Recipient[],
  lists: Pick<GiftList, "id" | "name" | "archived_at">[] = [],
): { idea: VoiceIdea; questions: string[] } {
  const idea: VoiceIdea = {
    title: "",
    candidates: [],
    listIds: [],
    priceMin: null,
    priceMax: null,
    priority: null,
    visibility: null,
    description: "",
    specifications: "",
    privateNote: "",
    url: "",
  };
  const questions: string[] = [];
  let text = clean(transcript);
  // Work on accent-insensitive text but preserve original title/detail spelling.
  function originalSpan(start: number, length: number) {
    const chars = [...text];
    let count = 0,
      from = 0,
      to = chars.length;
    for (let i = 0; i < chars.length; i++) {
      if (count <= start) from = i;
      count += normalize(chars[i]).length;
      if (count >= start + length) {
        to = i + 1;
        break;
      }
    }
    return { chars, from, to };
  }
  function remove(pattern: RegExp) {
    const m = normalize(text).match(pattern);
    if (!m || m.index === undefined) return null;
    const { chars, from, to } = originalSpan(m.index, m[0].length);
    const original = chars.slice(from, to).join("");
    text = clean(
      chars.slice(0, from).join("") + " " + chars.slice(to).join(""),
    );
    return { match: m, original };
  }
  if (
    /^(?:reserve|supprime|archive|modifie|envoie|partage|liste|montre|annule|n'ajoute|ne\s+)\b/.test(
      normalize(text),
    )
  )
    questions.push(
      "La dictée sert uniquement à ajouter une idée. Quelle idée souhaitez-vous noter ?",
    );
  const introduction =
    /^(?:(?:s'il te plait|peux-tu|je (?:veux|voudrais|souhaite)|j'aimerais)\s+)?(?:ajoute[rz]?|note[rz]?|enregistre[rz]?|cree[rz]?)\s+(?:(?:une|cette|l')\s*idee(?:\s+cadeau)?\s*[:,:]?\s*)?/;
  remove(introduction);
  remove(/\s+s'il te plait$/);

  // Labeled details remain separate from the title and private notes never leak
  // into the public description. A following explicit field ends each detail.
  const boundary =
    "(?=\\s*(?:[.;]\\s*)?(?:dans (?:la |les )?listes? |(?:pour |budget |prix |priorite |visibilite |description |precisions? |note privee |commentaire prive ))|$)";
  for (const [field, marker] of [
    ["privateNote", "(?:note (?:privee|personnelle)|commentaire prive)"],
    ["description", "description"],
    ["specifications", "(?:precisions?|details?|caracteristiques)"],
  ] as const) {
    const found = remove(
      new RegExp(`\\b${marker}\\s*[:,-]?\\s+(.+?)${boundary}`),
    );
    if (found) {
      const prefix = found.original.match(
        new RegExp(`^${marker}\\s*[:,-]?\\s+`, "i"),
      );
      // Match the normalized prefix to account for accents in Précisions etc.
      const prefixLength = found.match[0].length - found.match[1].length;
      idea[field] = clean(
        prefix
          ? found.original.slice(prefix[0].length)
          : [...found.original].slice(prefixLength).join(""),
      );
    }
  }
  const link = remove(/https?:\/\/[^\s]+/);
  if (link) idea.url = link.original.replace(/[.,;]+$/, "");

  if (
    /\b(?:pas|non|sans)\s+(?:en\s+)?(?:public|prive|coup de coeur|prioritaire)\b/.test(
      normalize(text),
    )
  )
    questions.push(
      "Pouvez-vous vérifier la visibilité et la priorité souhaitées ?",
    );
  const visibilities: [Visibility, RegExp][] = [
    [
      "private",
      /\b(?:(?:avec (?:une )?)?visibilite\s+|(?:a (?:garder|mettre|rendre)|(?:je (?:veux|souhaite) )?(?:la |le )?(?:garder|mettre|rendre))\s+|en\s+)?(?:pour moi uniquement|moi uniquement|visible (?:uniquement )?(?:par|pour) moi|privee?|confidentielle?)\b/,
    ],
    [
      "household",
      /\b(?:(?:avec (?:une )?)?visibilite\s+|visible (?:par|pour)\s+)?(?:nous deux|entre nous)\b/,
    ],
    [
      "public",
      /\b(?:(?:avec (?:une )?)?visibilite\s+|en\s+)?(?:publi(?:c|que)|visible (?:par|pour) tout le monde)\b/,
    ],
  ];
  for (const [v, regex] of visibilities)
    if (remove(regex)) {
      if (idea.visibility !== null && idea.visibility !== v)
        questions.push("Quelle visibilité souhaitez-vous conserver ?");
      idea.visibility = v;
    }
  if (
    /\b(?:secret|surprise|cacher)\b/.test(normalize(text)) &&
    idea.visibility !== "private"
  )
    questions.push(
      "Cette idée doit-elle rester privée ? Vérifiez sa visibilité.",
    );
  const priorities: [number, RegExp][] = [
    [0, /\b(?:(?:avec (?:une )?|en )?(?:priorite\s+)?)coup de coeur\b/],
    [
      1,
      /\b(?:(?:avec (?:une )?|en )?(?:priorite\s+haute|(?:idee\s+)?prioritaire))\b/,
    ],
    [2, /\bpriorite\s+(?:normale|standard|idee)\b/],
  ];
  for (const [p, regex] of priorities)
    if (remove(regex)) {
      if (idea.priority !== null && idea.priority !== p)
        questions.push("Choisissez une seule priorité pour cette idée.");
      idea.priority = p;
    }
  const range = remove(
    new RegExp(
      `\\b(?:(?:avec un )?(?:budget|prix)\\s+)?entre\\s+${amount}\\s+(?:et|a)\\s+${amount}\\s*(?:euros?\\b|€)`,
    ),
  );
  const price = range
    ? null
    : remove(
        new RegExp(
          `(?:\\b(?:(?:pour|avec) un budget de|budget(?: de)?|prix(?: de)?|autour de|environ|a)\\s+)?${amount}\\s*(?:euros?\\b|€)(?:\\s+${amount}\\s+centimes?)?`,
        ),
      );
  if (range) {
    idea.priceMin = numberValue(range.match[1]);
    idea.priceMax = numberValue(range.match[2]);
  } else if (price)
    idea.priceMin =
      numberValue(price.match[1]) +
      (price.match[2] ? numberValue(price.match[2]) / 100 : 0);
  // Budget/prix labels also permit a number without the euro unit.
  if (!range && !price) {
    const labeled = remove(
      new RegExp(`\\b(?:budget|prix)(?: de)?\\s*[:,-]?\\s*${amount}\\b`),
    );
    if (labeled) idea.priceMin = numberValue(labeled.match[1]);
  }
  if (
    (idea.priceMin !== null && !Number.isFinite(idea.priceMin)) ||
    (idea.priceMax !== null &&
      (!Number.isFinite(idea.priceMax) || idea.priceMin! > idea.priceMax))
  )
    questions.push("Quel est le bon budget minimum et maximum ?");
  if (/\b(?:budget|prix|euros?)\b|€/.test(normalize(text)))
    questions.push(
      "Je n’ai pas identifié le budget avec certitude. Pouvez-vous le préciser ?",
    );

  function names(
    marker: RegExp,
    catalogue: { id: string; name: string; aliases?: string[] }[],
    target: "candidates" | "listIds",
    label: string,
  ) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const m = normalize(text).match(marker);
      if (!m || m.index === undefined) break;
      const suffix = normalize(text).slice(m.index + m[0].length);
      let remaining = suffix,
        consumed = 0,
        found = false;
      const sorted = [...catalogue].sort(
        (a, b) => b.name.length - a.name.length,
      );
      while (remaining) {
        const person = sorted.find((r) =>
          [r.name, ...(r.aliases ?? [])].some((alias) =>
            new RegExp(`^${escape(normalize(alias))}(?=$|[\\s,;.!?&])`).test(
              remaining,
            ),
          ),
        );
        if (!person) break;
        const alias = [person.name, ...(person.aliases ?? [])].find((a) =>
          new RegExp(`^${escape(normalize(a))}(?=$|[\\s,;.!?&])`).test(
            remaining,
          ),
        )!;
        consumed += normalize(alias).length;
        remaining = suffix.slice(consumed);
        idea[target].push(person.id);
        found = true;
        const join = remaining.match(
          /^(?:\s*(?:,|et|ainsi que|&)\s+)(?:(?:la |les )?listes?\s+|pour\s+)?/,
        );
        if (!join) break;
        const next = remaining.slice(join[0].length);
        if (
          !sorted.some((r) =>
            [r.name, ...(r.aliases ?? [])].some((a) =>
              new RegExp(`^${escape(normalize(a))}(?=$|[\\s,;.!?&])`).test(
                next,
              ),
            ),
          )
        ) {
          // A conjunction followed by an unknown name is a doubt; an explicit
          // following field is a separate clause and must not be discarded.
          if (
            !/^(?:dans|sur|budget|prix|priorite|visibilite|description|en |a |pour |note |precisions? )/.test(
              next,
            )
          ) {
            questions.push(
              `${label} : je n’ai pas identifié « ${clean(next.split(/[.;]/)[0])} » avec certitude.`,
            );
            consumed += join[0].length + next.split(/[.;]/)[0].length;
          }
          break;
        }
        consumed += join[0].length;
        remaining = suffix.slice(consumed);
      }
      if (!found) {
        const unknown = suffix.split(/[,;.]/)[0];
        questions.push(
          `${label} : je n’ai pas identifié « ${clean(unknown)} » avec certitude.`,
        );
        consumed = unknown.length;
      }
      const length = m[0].length + consumed;
      remove(
        new RegExp(escape(normalize(text).slice(m.index, m.index + length))),
      );
    }
    idea[target] = [...new Set(idea[target])];
  }
  names(
    new RegExp(
      "\\b(?:(?:dans|sur|a mettre dans|a ajouter a)\\s+)?(?:(?:la|les|ma|mes)\\s+)?listes?\\s*[:,-]?\\s+(?:de\\s+)?" +
        (lists.some((l) => !l.archived_at)
          ? `|\\b(?:dans|sur)\\s+(?=(?:${lists
              .filter((l) => !l.archived_at)
              .map((l) => escape(normalize(l.name)))
              .join("|")})(?=$|[\\s,;.!?]))`
          : ""),
    ),
    lists.filter((l) => !l.archived_at),
    "listIds",
    "Quelle liste",
  );
  names(
    /\bpour\s+(?:(?:la personne|le destinataire)\s+)?/,
    recipients
      .filter((r) => !r.deleted_at)
      .map((r) => ({ ...r, aliases: r.is_common ? ["commun"] : [] })),
    "candidates",
    "Pour qui est cette idée",
  );
  if (
    idea.candidates.length > 1 &&
    recipients.some((r) => r.is_common && idea.candidates.includes(r.id))
  )
    questions.push("Choisissez Commun E&A seul, ou les personnes séparément.");
  // Natural colour/size details may be spoken without a Précisions label.
  const specs = remove(/\b(?:taille|couleur)\s+.+$/);
  if (specs)
    idea.specifications = clean(
      [idea.specifications, specs.original].filter(Boolean).join(". "),
    );
  if (
    /\b(?:priorite|visibilite|listes?|destinataire|plutot|finalement)\b/.test(
      normalize(text),
    )
  )
    questions.push(
      "Certains détails restent à préciser. Vérifiez les champs avant d’ajouter l’idée.",
    );
  remove(introduction);
  idea.title = clean(
    text
      .replace(/(?:^|[,;.]\s*)et\s+/g, " ")
      .replace(/\b(?:et|avec|dans|sur|en)\s*$/i, ""),
  );
  if (
    !idea.title ||
    /^(?:(?:une?\s+)?idee(?:\s+cadeau)?|merci|oui|non|euh|stop|annuler)$/i.test(
      normalize(idea.title),
    )
  )
    questions.push("Quelle idée souhaitez-vous ajouter ?");
  if (idea.title.length > 200)
    questions.push("Pouvez-vous raccourcir le titre à 200 caractères ?");
  return { idea, questions: [...new Set(questions)] };
}

export function voiceGiftInput(idea: VoiceIdea): GiftInput {
  return {
    ...idea,
    priority: idea.priority ?? 2,
    visibility: idea.visibility ?? "public",
    imageUrl: "",
    imageCredit: null,
    recipientId: idea.candidates[0] ?? null,
    global: false,
    collective: false,
    targetAmount: null,
  };
}
