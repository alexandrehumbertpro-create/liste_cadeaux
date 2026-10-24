"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/client-actions";
export default function Login({ destination = "/" }: { destination?: string }) {
  const router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="setup">
      <a className="brand" href="/">
        Kad’Humbert <span>✳</span>
      </a>
      <p>Pour les âmes en panne d’inspiration</p>
      <h1>Votre carnet à deux</h1>
      <p>Connectez-vous pour retrouver vos idées et vos listes.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          const r = await login(
            String(f.get("email")),
            String(f.get("password")),
          );
          setBusy(false);
          if (r.ok) {
            router.push(destination);
            router.refresh();
          } else setError(r.error);
        }}
      >
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Mot de passe
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button disabled={busy}>
          {busy ? "Connexion…" : "Ouvrir mon carnet"}
        </button>
      </form>
      <p>
        <a href="/confidentialite">Confidentialité et connexion Gmail</a>
      </p>
    </main>
  );
}
