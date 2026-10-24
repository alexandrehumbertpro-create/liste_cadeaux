import { formatPrice } from "./validation";
import type { Idea, Proposal, Recipient } from "./types";
export function ideaShareText(
  idea: Idea,
  proposal: Proposal,
  recipients: Recipient[],
) {
  const person = recipients.find((r) => r.id === proposal.recipient_id)?.name;
  return [
    "🎁 Une idée cadeau sur La Hotte Humbert",
    idea.title,
    person ? "Pour : " + person : "",
    formatPrice(idea.price_min, idea.price_max),
    ["♥ Coup de cœur", "★ Idée prioritaire", "Idée"][proposal.priority],
    idea.description,
    idea.specifications ? "Précisions : " + idea.specifications : "",
    idea.url || "",
    "Pour les âmes en panne d’inspiration",
  ]
    .filter(Boolean)
    .join("\n\n");
}
