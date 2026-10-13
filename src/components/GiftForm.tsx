"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Dataset, Idea, Proposal } from "@/lib/types";
import type { GiftInput } from "@/lib/validation";
import {
  saveGift,
  uploadImage,
  createRecipient,
  saveList,
} from "@/lib/client-actions";
const initial: GiftInput = {
  title: "",
  description: "",
  specifications: "",
  privateNote: "",
  url: "",
  imageUrl: "",
  imageCredit: null,
  priceMin: null,
  priceMax: null,
  visibility: "public",
  candidates: [],
  recipientId: null,
  listIds: [],
  global: false,
  priority: 2,
  collective: false,
  targetAmount: null,
};
export default function GiftForm({
  data,
  idea,
  proposal,
  preview,
  draft,
  done,
  onDraft,
  defaultRecipientId,
  defaultListId,
}: {
  data: Dataset;
  idea?: Idea;
  proposal?: Proposal;
  preview?: string;
  draft?: GiftInput;
  done: () => void;
  onDraft: () => void;
  defaultRecipientId?: string;
  defaultListId?: string;
}) {
  const router = useRouter();
  const [v, set] = useState<GiftInput>(
    () =>
      draft ??
      (idea
        ? {
            ideaId: idea.id,
            proposalId: proposal?.id,
            title: idea.title,
            description: idea.description,
            specifications: idea.specifications,
            privateNote: idea.private_note,
            url: idea.url ?? "",
            imageUrl: idea.image_url ?? "",
            imageCredit: idea.image_credit,
            priceMin: idea.price_min,
            priceMax: idea.price_max,
            visibility: idea.visibility,
            candidates: proposal?.recipient_id
              ? [proposal.recipient_id]
              : idea.candidates,
            recipientId: proposal?.recipient_id ?? null,
            listIds: proposal?.list_ids ?? [],
            global: false,
            priority: proposal?.priority ?? 2,
            collective: proposal?.collective ?? false,
            targetAmount: proposal?.target_amount ?? null,
          }
        : {
            ...initial,
            candidates: defaultRecipientId ? [defaultRecipientId] : [],
            recipientId: defaultRecipientId ?? null,
            listIds: defaultListId ? [defaultListId] : [],
          }),
  );
  const [image, setImage] = useState(preview ?? draft?.imageUrl ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [metadataStatus, setMetadataStatus] = useState(""),
    [imageFailed, setImageFailed] = useState(false),
    [q, setQ] = useState(""),
    [photos, setPhotos] = useState<
      {
        id: string;
        url: string;
        name: string;
        credit: string;
        download: string;
      }[]
    >([]);
  const saved = useRef(false);
  const draftKey = "kad-draft-" + data.profile.id;
  useEffect(() => {
    if (!idea && !saved.current) {
      try {
        localStorage.setItem(draftKey, JSON.stringify(v));
        onDraft();
      } catch {
        setError(
          "Le brouillon ne peut pas être enregistré sur cet appareil. Gardez le formulaire ouvert jusqu’à l’enregistrement.",
        );
      }
    }
  }, [v, draftKey, idea, onDraft]);
  function change<K extends keyof GiftInput>(key: K, value: GiftInput[K]) {
    set((old) => ({ ...old, [key]: value }));
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    const f = new FormData();
    f.set("file", file);
    const r = await uploadImage(f);
    setBusy(false);
    if (r.ok && r.data) {
      change("imageUrl", r.data.path);
      change("imageCredit", null);
      setImage(r.data.url);
    } else if (!r.ok) setError(r.error);
  }
  async function extract() {
    if (!v.url) {
      setError("Ajoutez un lien avant de récupérer ses détails.");
      return;
    }
    setBusy(true);
    setError("");
    setMetadataStatus(
      "Recherche du nom, de la photo, du prix et de la description…",
    );
    try {
      const r = await fetch("/api/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: v.url }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "La récupération a échoué.");
      set((old) => ({
        ...old,
        title: d.title || old.title || "",
        description: d.description || old.description || "",
        imageUrl: d.image || old.imageUrl || "",
        imageCredit: d.image ? null : old.imageCredit,
        priceMin: d.price ?? old.priceMin ?? null,
        priceMax: d.price != null ? null : old.priceMax,
      }));
      if (d.image) {
        setImage(d.image);
        setImageFailed(false);
      }
      const found = [
        d.title && "nom",
        d.image && "photo",
        d.price != null && "prix",
        d.description && "description",
      ].filter(Boolean);
      setMetadataStatus(
        found.length
          ? "Informations trouvées : " +
              found.join(", ") +
              ". Vérifiez les champs avant d’enregistrer."
          : "Aucune information récupérable sur cette page. Complétez les champs à la main.",
      );
    } catch (e) {
      setMetadataStatus("");
      setError(
        (e as Error).message + " Vous pouvez compléter les champs à la main.",
      );
    }
    setBusy(false);
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const r = await saveGift({
          ...v,
          recipientId: v.candidates.includes(v.recipientId ?? "")
            ? v.recipientId
            : (v.candidates[0] ?? null),
          global: false,
        });
        setBusy(false);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        saved.current = true;
        if (!idea) localStorage.removeItem(draftKey);
        onDraft();
        done();
      }}
    >
      {!idea && (
        <p className="notice">
          Un titre suffit. Le brouillon est conservé sur cet appareil jusqu’à
          l’enregistrement.
        </p>
      )}
      <label>
        Lien du produit
        <div className="row">
          <input
            type="url"
            value={v.url}
            placeholder="https://…"
            onChange={(e) => change("url", e.target.value)}
          />
          <button
            type="button"
            className="secondary"
            disabled={busy || !v.url}
            onClick={extract}
          >
            {busy ? "En cours…" : "Récupérer"}
          </button>
        </div>
      </label>
      <div aria-live="polite" role="status">
        {metadataStatus && <p className="notice">{metadataStatus}</p>}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="metadata-preview">
        {image ? (
          <figure>
            <img
              src={image}
              alt="Aperçu de l’illustration du cadeau"
              onError={() => setImageFailed(true)}
              onLoad={() => setImageFailed(false)}
            />
            <figcaption>
              {imageFailed
                ? "Cette image ne peut pas être affichée. Vous pouvez importer une photo."
                : "Aperçu de l’image · vous pouvez la remplacer ci-dessous"}
            </figcaption>
          </figure>
        ) : (
          <p className="hint">
            Aucune image pour le moment. Récupérez un lien ou importez une
            photo.
          </p>
        )}
      </div>
      <label>
        Votre idée
        <input
          required
          maxLength={200}
          value={v.title}
          placeholder="Un atelier de céramique…"
          onChange={(e) => change("title", e.target.value)}
        />
      </label>
      <div className="image-tools">
        <label className="file-button">
          Importer une photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </label>
        <label className="file-button">
          Prendre une photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </label>
      </div>
      <details>
        <summary>Illustrer avec Unsplash</summary>
        <div className="row">
          <input
            aria-label="Rechercher une illustration"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Céramique, voyage…"
          />
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await fetch("/api/images?q=" + encodeURIComponent(q));
              const d = await r.json();
              setBusy(false);
              if (!r.ok) setError(d.error);
              else setPhotos(d.photos);
            }}
          >
            Chercher
          </button>
        </div>
        <div className="photo-grid">
          {photos.map((p) => (
            <button
              type="button"
              key={p.id}
              aria-label={"Choisir la photo de " + p.name}
              onClick={async () => {
                change("imageUrl", p.url);
                change("imageCredit", { name: p.name, url: p.credit });
                setImage(p.url);
                await fetch("/api/images", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ download: p.download }),
                });
              }}
            >
              <img src={p.url} alt={p.name} />
            </button>
          ))}
        </div>
        {v.imageCredit && (
          <a href={v.imageCredit.url} target="_blank" rel="noopener noreferrer">
            Photo : {v.imageCredit.name} / Unsplash
          </a>
        )}
      </details>
      <fieldset>
        <legend>Pour qui ?</legend>
        <div className="chips">
          {data.recipients.map((p) => (
            <button
              type="button"
              className={
                "chip " + (v.candidates.includes(p.id) ? "selected" : "")
              }
              key={p.id}
              onClick={() => {
                const ids = v.candidates.includes(p.id)
                  ? v.candidates.filter((id) => id !== p.id)
                  : p.is_common
                    ? [p.id]
                    : [
                        ...v.candidates.filter(
                          (id) =>
                            !data.recipients.find((r) => r.id === id)
                              ?.is_common,
                        ),
                        p.id,
                      ];
                set((old) => ({
                  ...old,
                  candidates: ids,
                  recipientId: ids.includes(old.recipientId ?? "")
                    ? old.recipientId
                    : (ids[0] ?? null),
                }));
              }}
            >
              {p.name}
            </button>
          ))}
          <button
            type="button"
            className="chip"
            onClick={async () => {
              const name = prompt("Nom du nouveau destinataire");
              if (name) {
                const r = await createRecipient(name);
                if (r.ok) router.refresh();
                else setError(r.error);
              }
            }}
          >
            + Destinataire
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend>Dans quelles listes ?</legend>
        <div className="chips">
          {data.lists
            .filter((l) => !l.archived_at)
            .map((l) => (
              <button
                type="button"
                key={l.id}
                className={
                  "chip " + (v.listIds.includes(l.id) ? "selected" : "")
                }
                onClick={() =>
                  change(
                    "listIds",
                    v.listIds.includes(l.id)
                      ? v.listIds.filter((id) => id !== l.id)
                      : [...v.listIds, l.id],
                  )
                }
              >
                {l.name}
              </button>
            ))}
          <button
            type="button"
            className="chip"
            onClick={async () => {
              const name = prompt("Nom de la nouvelle liste");
              if (name) {
                const r = await saveList({ name, slogan: "", imageUrl: null });
                if (r.ok) router.refresh();
                else setError(r.error);
              }
            }}
          >
            + Liste
          </button>
        </div>
        <small>
          Facultatif : vous pourrez ajouter cette idée à des listes depuis Mes
          idées.
        </small>
      </fieldset>
      <label>
        Qui peut voir cette idée ?
        <select
          value={v.visibility}
          onChange={(e) =>
            change("visibility", e.target.value as GiftInput["visibility"])
          }
        >
          <option value="household">
            Nous deux · gestionnaires uniquement
          </option>
          <option value="public">Public · invités des listes partagées</option>
          {(!idea || idea.owner_id === data.profile.id) && (
            <option value="private">🔒 Moi uniquement</option>
          )}
        </select>
      </label>
      <p className="notice">
        Partagée dans :{" "}
        {v.visibility === "public"
          ? v.global
            ? "toutes les listes"
            : data.lists
                .filter((l) => v.listIds.includes(l.id) && !l.archived_at)
                .map((l) => l.name)
                .join(", ") || "aucune liste pour le moment"
          : v.visibility === "private"
            ? "aucune liste invitée, visible par vous uniquement"
            : "aucune liste invitée, visible par les gestionnaires"}
      </p>
      <details open={Boolean(idea) || Boolean(metadataStatus)}>
        <summary>Prix, priorité et précisions</summary>
        <div className="row">
          <label>
            Prix minimum (€)
            <input
              type="number"
              min="0"
              step="0.01"
              value={v.priceMin ?? ""}
              onChange={(e) =>
                change(
                  "priceMin",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
          </label>
          <label>
            Maximum, facultatif (€)
            <input
              type="number"
              min="0"
              step="0.01"
              value={v.priceMax ?? ""}
              onChange={(e) =>
                change(
                  "priceMax",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
          </label>
        </div>
        <label>
          Priorité
          <select
            aria-label="Priorité"
            value={v.priority}
            onChange={(e) => change("priority", Number(e.target.value))}
          >
            <option value="0">♥ Coup de cœur</option>
            <option value="1">★ Top idée</option>
            <option value="2">Bonne idée</option>
          </select>
        </label>
        <label>
          Description
          <textarea
            value={v.description}
            onChange={(e) => change("description", e.target.value)}
          />
        </label>
        <label>
          Précisions pour les invités
          <textarea
            placeholder="Taille M, bleu, option…"
            value={v.specifications}
            onChange={(e) => change("specifications", e.target.value)}
          />
        </label>
        <label>
          Note de gestion privée
          <textarea
            placeholder="Comparer avec l’autre modèle…"
            value={v.privateNote}
            onChange={(e) => change("privateNote", e.target.value)}
          />
        </label>
        <small>
          Les invités ne voient jamais cette note. « Nous deux » permet aux
          gestionnaires de la lire.
        </small>
        <label className="check">
          <input
            type="checkbox"
            checked={v.collective}
            onChange={(e) => change("collective", e.target.checked)}
          />{" "}
          Cadeau collectif, sans paiement
        </label>
        {v.collective && (
          <label>
            Budget à atteindre (€)
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={v.targetAmount ?? ""}
              onChange={(e) =>
                change(
                  "targetAmount",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            />
          </label>
        )}
      </details>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button disabled={busy} className="wide">
        {busy
          ? "En cours…"
          : idea
            ? "Enregistrer les modifications"
            : "Garder cette idée"}
      </button>
    </form>
  );
}
