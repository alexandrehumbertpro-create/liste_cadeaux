"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SharedGift } from "@/lib/types";
import { formatPrice } from "@/lib/validation";
import { reserveGift } from "@/lib/client-actions";
export default function GuestReservation({
  gift,
  token,
  done,
}: {
  gift: SharedGift;
  token: string;
  done: (accessToken: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <h3>{gift.title}</h3>
      <p>
        Pour <strong>{gift.recipient}</strong> ·{" "}
        {formatPrice(gift.priceMin, gift.priceMax)}
      </p>
      <p>{gift.specifications || "Aucune option particulière indiquée."}</p>
      {gift.url && (
        <a href={gift.url} target="_blank" rel="noopener noreferrer">
          Vérifier le produit ↗
        </a>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            const r = await reserveGift({
              token,
              gift: gift.id,
              name: String(f.get("name")),
              email: String(f.get("email")),
              amount: gift.collective ? Number(f.get("amount")) : null,
            });
            if (r.ok && r.data) {
              done(r.data.accessToken);
              router.refresh();
            } else if (!r.ok) {
              setError(r.error);
              router.refresh();
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Votre nom, ou vos noms
          <input
            required
            name="name"
            autoComplete="name"
            placeholder="Sophie et Marc"
            maxLength={100}
          />
        </label>
        <label>
          Votre email
          <input
            required
            type="email"
            name="email"
            autoComplete="email"
            maxLength={254}
          />
        </label>
        {gift.collective && (
          <label>
            Votre participation, sans paiement (€)
            <input
              name="amount"
              type="number"
              required
              min="0.01"
              step="0.01"
              max={Number(gift.targetAmount) - Number(gift.contributed)}
            />
            <small>
              Reste {Number(gift.targetAmount) - Number(gift.contributed)} €.
              Organisez-vous entre vous pour l’achat.
            </small>
          </label>
        )}
        <p className="notice">
          La réservation est immédiate. Votre nom reste masqué par défaut pour
          les gestionnaires. L’email sert au récapitulatif et aux changements
          concernant ce cadeau.
        </p>
        {error && <p role="alert">{error}</p>}
        <button disabled={busy} className="wide">
          {busy
            ? "Enregistrement…"
            : gift.collective
              ? "Enregistrer ma participation"
              : "Réserver"}
        </button>
      </form>
    </>
  );
}
