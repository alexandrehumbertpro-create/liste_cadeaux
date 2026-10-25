"use client";
import { useState } from "react";
import type { Idea, Proposal } from "@/lib/types";
import { formatPrice } from "@/lib/validation";
import { reserveForGuest } from "@/lib/client-actions";
export default function AdminReservation({
  idea,
  proposal,
  listId,
  recipient,
  done,
}: {
  idea: Idea;
  proposal: Proposal;
  listId: string;
  recipient: string;
  done: (notice: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const remaining = Math.max(
    0,
    Number(proposal.target_amount) - Number(proposal.contributed),
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          const r = await reserveForGuest({
            gift: proposal.id,
            listId,
            name: String(f.get("name")),
            email: String(f.get("email") || "").trim(),
            amount: proposal.collective ? Number(f.get("amount")) : null,
          });
          if (!r.ok) {
            setError(r.error);
            return;
          }
          done(
            (proposal.collective
              ? "Participation enregistrée."
              : "Réservation enregistrée.") +
              (r.data?.emailQueued
                ? " Confirmation par email préparée."
                : " Aucun email ne sera envoyé à cette personne, car aucune adresse n’a été renseignée."),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="reservation-recap">
        <h3>{idea.title}</h3>
        <p>
          Pour qui ? <strong>{recipient}</strong>
        </p>
        <p>{formatPrice(idea.price_min, idea.price_max)}</p>
        {idea.specifications && <p>{idea.specifications}</p>}
      </div>
      <label>
        Au nom de qui ?
        <input name="name" autoComplete="off" required maxLength={100} />
      </label>
      <label>
        Email de cette personne (facultatif)
        <input name="email" type="email" autoComplete="off" maxLength={254} />
      </label>
      <small>
        Sans email, la réservation reste enregistrée. Cette personne ne recevra
        ni confirmation ni notification d’annulation.
      </small>
      {proposal.collective && (
        <>
          <p>
            Il reste {remaining.toLocaleString("fr-FR")} € à réserver, sans
            paiement.
          </p>
          <label>
            Montant de la participation (€)
            <input
              name="amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              max={remaining}
              required
            />
          </label>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <button className="wide" disabled={busy}>
        {busy
          ? "Enregistrement…"
          : proposal.collective
            ? "Enregistrer la participation"
            : "Réserver pour cette personne"}
      </button>
    </form>
  );
}
