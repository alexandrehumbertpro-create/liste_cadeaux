"use client";
import { useState } from "react";
import { askGiftQuestion } from "@/lib/client-actions";
export default function GuestQuestion({
  token,
  giftId,
}: {
  token: string;
  giftId: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  if (success)
    return (
      <p role="status" className="notice">
        {success}
      </p>
    );
  return (
    <form
      className="guest-question"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          const r = await askGiftQuestion({
            token,
            gift: giftId,
            name: String(f.get("name")).trim(),
            email: String(f.get("email")).trim(),
            question: String(f.get("question")).trim(),
          });
          if (r.ok)
            setSuccess(
              r.data?.sent
                ? "Votre question a été transmise à Alex et Elise. Ils pourront vous répondre par email."
                : "Votre question est enregistrée. Son envoi à Alex et Elise est en attente ; inutile de la renvoyer.",
            );
          else setError(r.error);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Une précision à demander ? Alex et Elise recevront votre question
        ensemble.
      </p>
      <div className="row">
        <label>
          Votre nom
          <input
            name="name"
            autoComplete="name"
            maxLength={100}
            required
            autoFocus
          />
        </label>
        <label>
          Votre email
          <input
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
          />
        </label>
      </div>
      <label>
        Votre question
        <textarea name="question" rows={3} maxLength={2000} required />
      </label>
      <small>Votre email leur permettra de vous répondre directement.</small>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} className="wide">
        {busy ? "Envoi…" : "Envoyer à Alex et Elise"}
      </button>
    </form>
  );
}
