"use client";
import Brand from "@/components/Brand";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { SharedList } from "@/lib/types";
import { formatPrice } from "@/lib/validation";
import { recipientStyle } from "@/lib/recipient-colors";
import { guestGifts, type GuestSort } from "@/lib/guest-view";
import Modal from "./Modal";
import GuestGiftDetails from "./GuestGiftDetails";
import GuestReservation from "./GuestReservation";
export default function Guest({
  list,
  token,
}: {
  list: SharedList;
  token: string;
}) {
  const router = useRouter();
  const [people, setPeople] = useState<string[]>([]),
    [max, setMax] = useState(""),
    [status, setStatus] = useState(""),
    [priority, setPriority] = useState(""),
    [sort, setSort] = useState<GuestSort>("priority"),
    [detailId, setDetailId] = useState(""),
    [reserveId, setReserveId] = useState(""),
    [success, setSuccess] = useState("");
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 20000);
    return () => clearInterval(id);
  }, [router]);
  const recipients = [
    ...new Map(
      list.gifts.map((g) => [
        g.recipientId,
        { id: g.recipientId, name: g.recipient, color: g.recipientColor },
      ]),
    ).values(),
  ];
  const activePeople = people.filter((id) =>
    recipients.some((r) => r.id === id),
  );
  const gifts = guestGifts(list.gifts, {
    people: activePeople,
    max,
    status,
    priority,
    sort,
  });
  const detail = list.gifts.find((g) => g.id === detailId),
    reservation = list.gifts.find((g) => g.id === reserveId);
  return (
    <>
      <header className="topbar">
        <a href={"/l/" + token} className="brand">
          <Brand />
        </a>
        <small>La liste qu’on vous a partagée</small>
      </header>
      <main className="guest">
        <div className="guest-heading compact-guest-heading">
          <div className="guest-intro">
            <h1>{list.name}</h1>
            <p>{list.slogan || "Une petite attention, un grand sourire."}</p>
            <small>Aucun compte nécessaire pour réserver.</small>
          </div>
          {list.imageUrl && (
            <img src={list.imageUrl} alt="Couverture de la liste" />
          )}
        </div>
        {list.archived ? (
          <p className="notice">
            Cette liste est archivée. Les réservations sont fermées.
          </p>
        ) : (
          <>
            <fieldset className="guest-people">
              <legend>Pour qui ?</legend>
              <div className="chips">
                <button
                  className={"chip " + (!activePeople.length ? "selected" : "")}
                  aria-pressed={!activePeople.length}
                  onClick={() => setPeople([])}
                >
                  Tout le monde
                </button>
                {recipients.map((p) => (
                  <button
                    key={p.id}
                    className={
                      "chip " + (activePeople.includes(p.id) ? "selected" : "")
                    }
                    style={recipientStyle(p.color)}
                    aria-pressed={activePeople.includes(p.id)}
                    onClick={() =>
                      setPeople((old) =>
                        old.includes(p.id)
                          ? old.filter((id) => id !== p.id)
                          : [...old, p.id],
                      )
                    }
                  >
                    {activePeople.includes(p.id) ? "✓ " : ""}
                    {p.name}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="guest-filter-bar">
              <label>
                Budget max (€)
                <input
                  type="number"
                  min="0"
                  value={max}
                  placeholder="Sans limite"
                  onChange={(e) => setMax(e.target.value)}
                />
              </label>
              <label>
                Priorité
                <select
                  aria-label="Priorité"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="">Toutes</option>
                  <option value="0">♥ Coup de cœur</option>
                  <option value="1">★ Idée prioritaire</option>
                  <option value="2">Idée</option>
                </select>
              </label>
              <label>
                Disponibilité
                <select
                  aria-label="Disponibilité"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">Toutes</option>
                  <option value="available">Disponibles</option>
                  <option value="reserved">Réservées</option>
                </select>
              </label>
              <label>
                Trier par
                <select
                  aria-label="Trier par"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as GuestSort)}
                >
                  <option value="priority">Priorité</option>
                  <option value="price_asc">Prix croissant</option>
                  <option value="price_desc">Prix décroissant</option>
                  <option value="newest">Derniers ajouts</option>
                </select>
              </label>
            </div>
            <p className="guest-result-count" role="status">
              {gifts.length} {gifts.length === 1 ? "idée" : "idées"}
            </p>
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
                          onClick={(e) => {
                            if (
                              !(e.target as HTMLElement).closest(
                                "button,a,input,select,label",
                              )
                            )
                              setDetailId(g.id);
                          }}
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
                                src="/brand-mark.svg?v=3"
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
                            <h2>
                              <button
                                className="text-button card-open"
                                onClick={() => setDetailId(g.id)}
                              >
                                {g.title}
                              </button>
                            </h2>
                            <p className="recipient">
                              Pour qui ? <strong>{g.recipient}</strong>
                            </p>
                            <p>{formatPrice(g.priceMin, g.priceMax)}</p>
                            {g.description && (
                              <p className="gift-excerpt">{g.description}</p>
                            )}
                            {g.specifications && (
                              <p className="specs gift-excerpt">
                                {g.specifications}
                              </p>
                            )}
                            {g.imageCredit && (
                              <small>
                                Photo :{" "}
                                <a
                                  href={g.imageCredit.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {g.imageCredit.name} / Unsplash
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
                                onClick={() => setReserveId(g.id)}
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
        {detailId && (
          <Modal title="Détails du cadeau" close={() => setDetailId("")}>
            {detail && !list.archived ? (
              <GuestGiftDetails
                gift={detail}
                token={token}
                reserve={() => {
                  setDetailId("");
                  setReserveId(detail.id);
                }}
              />
            ) : (
              <p>Cette idée n’est plus disponible dans la liste.</p>
            )}
          </Modal>
        )}
        {reserveId && (
          <Modal title="Votre réservation" close={() => setReserveId("")}>
            {reservation && !reservation.reserved && !list.archived ? (
              <GuestReservation
                gift={reservation}
                token={token}
                done={(access) => {
                  setSuccess("/reservation/" + access);
                  setReserveId("");
                }}
              />
            ) : (
              <p>
                Cette idée n’est plus disponible à la réservation. Fermez cette
                fenêtre pour poursuivre votre choix.
              </p>
            )}
          </Modal>
        )}
      </main>
    </>
  );
}
