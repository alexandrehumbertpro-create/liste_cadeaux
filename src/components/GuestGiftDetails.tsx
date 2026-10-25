"use client";
import { useState } from "react";
import type { SharedGift } from "@/lib/types";
import { formatPrice } from "@/lib/validation";
import GuestQuestion from "./GuestQuestion";
export default function GuestGiftDetails({
  gift,
  token,
  reserve,
}: {
  gift: SharedGift;
  token: string;
  reserve: () => void;
}) {
  const [question, setQuestion] = useState(false);
  return (
    <>
      {gift.imageUrl && (
        <img
          className="guest-detail-image"
          src={gift.imageUrl}
          alt={gift.title}
        />
      )}
      <h3>{gift.title}</h3>
      <p className="recipient">
        Pour qui ? <strong>{gift.recipient}</strong>
      </p>
      <p>
        <strong>{formatPrice(gift.priceMin, gift.priceMax)}</strong> ·{" "}
        {["♥ Coup de cœur", "★ Idée prioritaire", "Idée"][gift.priority]}
      </p>
      {gift.description && <p className="gift-full-text">{gift.description}</p>}
      {gift.specifications && (
        <div className="reservation-recap">
          <strong>Précisions</strong>
          <p className="gift-full-text">{gift.specifications}</p>
        </div>
      )}
      {gift.imageCredit && (
        <small>
          Photo :{" "}
          <a
            href={gift.imageCredit.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {gift.imageCredit.name} / Unsplash
          </a>
        </small>
      )}
      {gift.url && (
        <a
          className="product-link"
          href={gift.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Voir le produit ↗
        </a>
      )}
      {gift.collective && (
        <p>
          {gift.contributed.toLocaleString("fr-FR")} /{" "}
          {Number(gift.targetAmount).toLocaleString("fr-FR")} € de
          participations, sans paiement.
        </p>
      )}
      <div className="detail-actions">
        {gift.reserved ? (
          <span className="detail-reserved">✓ Déjà réservé</span>
        ) : (
          <button onClick={reserve}>
            {gift.collective ? "Participer" : "Réserver"}
          </button>
        )}
        <button
          className="secondary"
          aria-expanded={question}
          aria-controls="gift-question"
          onClick={() => setQuestion(!question)}
        >
          {question ? "Fermer la question" : "Poser une question"}
        </button>
      </div>
      {question && (
        <section id="gift-question">
          <GuestQuestion token={token} giftId={gift.id} />
        </section>
      )}
    </>
  );
}
