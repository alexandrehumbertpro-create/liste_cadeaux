"use client";
import Brand from "@/components/Brand";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { SharedList, SharedGift } from "@/lib/types";
import { formatPrice, budgetOverlap } from "@/lib/validation";
import { reserveGift } from "@/lib/client-actions";
import Modal from "./Modal";
export default function Guest({
  list,
  token,
}: {
  list: SharedList;
  token: string;
}) {
  const router = useRouter();
  const [person, setPerson] = useState(""),
    [max, setMax] = useState(""),
    [status, setStatus] = useState(""),
    [priority, setPriority] = useState(""),
    [gift, setGift] = useState<SharedGift | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState("");
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 20000);
    return () => clearInterval(id);
  }, [router]);
  const gifts = list.gifts
    .filter(
      (g) =>
        (!person || g.recipientId === person) &&
        (priority === "" || g.priority === Number(priority)) &&
        budgetOverlap(g.priceMin, g.priceMax, null, max ? Number(max) : null) &&
        (!status || (status === "reserved" ? g.reserved : !g.reserved)),
    )
    .sort(
      (a, b) =>
        Number(a.reserved) - Number(b.reserved) || a.priority - b.priority,
    );
  const recipients = [
    ...new Map(list.gifts.map((g) => [g.recipientId, g.recipient])).entries(),
  ];
  return (
    <>
      <header className="topbar">
        <a href={"/l/" + token} className="brand">
          <Brand />
        </a>
        <small>La liste qu’on vous a partagée</small>
      </header>
      <main className="guest">
        <div className="guest-heading">
          {list.imageUrl && (
            <img src={list.imageUrl} alt="Couverture de la liste" />
          )}
          <p className="eyebrow">POUR LES ÂMES EN PANNE D’INSPIRATION</p>
          <h1>{list.name}</h1>
          <p>{list.slogan || "Une petite attention, un grand sourire."}</p>
          <small>Aucun compte nécessaire pour réserver.</small>
        </div>
        {list.archived ? (
          <p className="notice">
            Cette liste est archivée. Les réservations sont fermées.
          </p>
        ) : (
          <>
            <div className="filter-grid filters">
              <label>
                Pour qui ?
                <select
                  value={person}
                  onChange={(e) => setPerson(e.target.value)}
                >
                  <option value="">Tout le monde</option>
                  {recipients.map(([id, name]) => (
                    <option value={id} key={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Budget maximum (€)
                <input
                  type="number"
                  min="0"
                  value={max}
                  onChange={(e) => setMax(e.target.value)}
                />
              </label>
              <label>
                Priorité
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="">Toutes les priorités</option>
                  <option value="0">♥ Coup de cœur</option>
                  <option value="1">★ Idée prioritaire</option>
                  <option value="2">Idée</option>
                </select>
              </label>
              <label>
                Disponibilité
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">Toutes les idées</option>
                  <option value="available">Disponibles</option>
                  <option value="reserved">Réservées</option>
                </select>
              </label>
            </div>
            <p>{gifts.length} idées</p>
            {success && (
              <p role="status" className="notice">
                Réservation enregistrée. Conservez ce lien pour la retrouver :{" "}
                <a href={success}>Ma réservation</a>.
              </p>
            )}
            {!gifts.length && (
              <p className="empty">Aucune idée pour ces filtres.</p>
            )}
            {[false, true].map((reserved) => {
              const rows = gifts.filter((g) => g.reserved === reserved);
              return (
                rows.length > 0 && (
                  <section key={String(reserved)}>
                    {reserved && (
                      <h2 className="reserved-heading">Déjà réservés</h2>
                    )}
                    <div className="grid">
                      {rows.map((g) => (
                        <article
                          key={g.id}
                          className={
                            "gift-card " + (reserved ? "reserved" : "")
                          }
                        >
                          <div className="gift-image">
                            {reserved && (
                              <span className="reserved-badge">
                                Déjà réservé
                              </span>
                            )}
                            {g.imageUrl ? (
                              <img src={g.imageUrl} alt="" />
                            ) : (
                              <img
                                className="placeholder-mark"
                                src="/brand-mark.svg"
                                alt=""
                              />
                            )}
                            <span className="badge">
                              {
                                [
                                  "♥ Coup de cœur",
                                  "★ Idée prioritaire",
                                  "Idée",
                                ][g.priority]
                              }
                            </span>
                          </div>
                          <div className="gift-body">
                            <h2>{g.title}</h2>
                            <p className="recipient">
                              Pour qui ? <b>{g.recipient}</b>
                            </p>
                            <p>{formatPrice(g.priceMin, g.priceMax)}</p>
                            <p>{g.description}</p>
                            {g.specifications && (
                              <p className="specs">{g.specifications}</p>
                            )}
                            {g.imageCredit && (
                              <small>
                                <a
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  href={g.imageCredit.url}
                                >
                                  Photo : {g.imageCredit.name} / Unsplash
                                </a>
                              </small>
                            )}
                            {g.url && (
                              <a
                                className="product-link"
                                href={g.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Voir le produit ↗
                              </a>
                            )}
                            {g.collective && (
                              <p>
                                {Number(g.contributed).toLocaleString("fr-FR")}{" "}
                                /{" "}
                                {Number(g.targetAmount).toLocaleString("fr-FR")}{" "}
                                € de participations
                              </p>
                            )}
                            {reserved ? (
                              <p className="reservation-action">
                                ✓ Déjà réservé
                              </p>
                            ) : (
                              <button
                                className="wide reservation-action"
                                onClick={() => {
                                  setGift(g);
                                  setError("");
                                }}
                              >
                                {g.collective
                                  ? "Participer"
                                  : "Réserver cette idée"}
                              </button>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                )
              );
            })}
          </>
        )}
        {gift && (
          <Modal title="Votre réservation" close={() => setGift(null)}>
            <h2>{gift.title}</h2>
            <p>
              Pour <b>{gift.recipient}</b> ·{" "}
              {formatPrice(gift.priceMin, gift.priceMax)}
            </p>
            <p>
              {gift.specifications || "Aucune option particulière indiquée."}
            </p>
            {gift.url && (
              <a href={gift.url} target="_blank" rel="noopener noreferrer">
                Vérifier le produit ↗
              </a>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const f = new FormData(e.currentTarget);
                const r = await reserveGift({
                  token,
                  gift: gift.id,
                  name: String(f.get("name")),
                  email: String(f.get("email")),
                  amount: gift.collective ? Number(f.get("amount")) : null,
                });
                setBusy(false);
                if (r.ok && r.data) {
                  setSuccess("/reservation/" + r.data.accessToken);
                  setGift(null);
                  router.refresh();
                } else if (!r.ok) {
                  setError(r.error);
                  router.refresh();
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
                    Reste {Number(gift.targetAmount) - Number(gift.contributed)}{" "}
                    €. Organisez-vous entre vous pour l’achat.
                  </small>
                </label>
              )}
              <p className="notice">
                La réservation est immédiate. Votre nom reste masqué par défaut
                pour les gestionnaires. L’email sert au récapitulatif et aux
                changements concernant ce cadeau.
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
          </Modal>
        )}
      </main>
    </>
  );
}
