"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="setup">
      <h1>Le carnet n’a pas pu s’ouvrir</h1>
      <p>
        Vérifiez la connexion puis réessayez. Vos idées enregistrées sont
        conservées.
      </p>
      <button onClick={reset}>Réessayer</button>
    </main>
  );
}
