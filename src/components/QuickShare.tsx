"use client";
import { useState } from "react";
import type { Dataset, Proposal, Idea } from "@/lib/types";
import { ideaShareText } from "@/lib/idea-share";
import { shareIdeaEmail } from "@/lib/client-actions";
export default function QuickShare({
  data,
  idea,
  proposal,
}: {
  data: Dataset;
  idea?: Idea;
  proposal: Proposal;
}) {
  const [to, setTo] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  if (!idea)
    return (
      <p role="status">
        Cette idée n’est plus accessible. Fermez cette fenêtre pour revenir au
        carnet.
      </p>
    );
  const text = ideaShareText(idea, proposal, data.recipients);
  return (
    <>
      <h3>{idea.title}</h3>
      {idea.visibility === "private" && (
        <p className="notice">
          Idée confidentielle : le partage transmet les détails de ce cadeau au
          contact choisi.
        </p>
      )}
      <p>Les notes de gestion ne sont jamais partagées.</p>
      <a
        className="secondary guest-preview-link"
        target="_blank"
        rel="noopener noreferrer"
        href={"https://wa.me/?text=" + encodeURIComponent(text)}
      >
        Partager sur WhatsApp ↗
      </a>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await shareIdeaEmail(proposal.id, to);
            setMessage(r.ok ? r.notice || "Email préparé." : r.error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Email du destinataire
          <input
            type="email"
            required
            value={to}
            maxLength={254}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <p className="hint">
          Expéditeur : {data.profile.email}.{" "}
          {data.mailbox
            ? "Votre compte Gmail est connecté."
            : "Connectez Gmail depuis Mon compte pour permettre l’envoi direct."}
        </p>
        <button disabled={busy}>{busy ? "Envoi…" : "Envoyer l’email"}</button>
      </form>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <details>
        <summary>Voir le texte partagé</summary>
        <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>
      </details>
    </>
  );
}
