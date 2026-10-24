"use client";
import Brand from "@/components/Brand";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelReservation } from "@/lib/client-actions";
export default function Reservation({
  token,
  info,
}: {
  token: string;
  info: {
    title: string;
    name: string;
    amount: number | null;
    cancelled: boolean;
    archived: boolean;
  };
}) {
  const router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="setup">
      <p className="brand">
        <Brand />
      </p>
      <h1>Votre réservation</h1>
      <h2>{info.title}</h2>
      <p>Au nom de {info.name}</p>
      {info.amount !== null && <p>Participation : {info.amount} €</p>}
      <p>
        {info.cancelled
          ? "Cette réservation a été annulée."
          : info.archived
            ? "L’idée a été archivée par le gestionnaire."
            : "Votre réservation est bien enregistrée."}
      </p>
      {!info.cancelled && (
        <button
          disabled={busy}
          onClick={async () => {
            if (!confirm("Annuler votre réservation ?")) return;
            setBusy(true);
            const r = await cancelReservation(token);
            setBusy(false);
            if (r.ok) router.refresh();
            else setError(r.error);
          }}
        >
          Annuler ma réservation
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      <small>
        Ce lien est personnel. Conservez-le pour gérer votre réservation.
      </small>
    </main>
  );
}
