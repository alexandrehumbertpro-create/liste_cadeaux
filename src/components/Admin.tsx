"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dataset, Proposal, GiftList } from "@/lib/types";
import type { GiftInput } from "@/lib/validation";
import { budgetOverlap, formatPrice, inList } from "@/lib/validation";
import * as actions from "@/lib/client-actions";
import Modal from "./Modal";
import GiftForm from "./GiftForm";
const priorities = ["♥ Coup de cœur", "★ Top idée", "Bonne idée"];
const reasons: Record<string, string> = {
  offered: "Offert",
  abandoned: "Idée écartée",
  unavailable: "Indisponible",
  other: "Autre motif",
};
export default function Admin({
  data,
  previews,
}: {
  data: Dataset;
  previews: Record<string, string>;
}) {
  const router = useRouter();
  const [view, setView] = useState("people"),
    [listId, setList] = useState(""),
    [person, setPerson] = useState(""),
    [query, setQuery] = useState(""),
    [min, setMin] = useState(""),
    [max, setMax] = useState(""),
    [status, setStatus] = useState(""),
    [visibility, setVisibility] = useState(""),
    [priority, setPriority] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [form, setForm] = useState<Proposal | "new" | null>(null),
    [draft, setDraft] = useState<GiftInput | undefined>(),
    [hasDraft, setHasDraft] = useState(false),
    [modal, setModal] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [names, setNames] = useState<Record<string, string>>({}),
    [bulkAction, setBulkAction] = useState("archive"),
    [reuse, setReuse] = useState(false),
    [undo, setUndo] = useState<string[]>([]),
    [editingList, setEditingList] = useState<GiftList | undefined>(),
    [organize, setOrganize] = useState(false);
  const draftKey = "kad-draft-" + data.profile.id;
  const checkDraft = useCallback(() => {
    try {
      const v = JSON.parse(localStorage.getItem(draftKey) || "null");
      setHasDraft(Boolean(v && (v.title || v.url || v.imageUrl)));
    } catch {
      setHasDraft(false);
    }
  }, [draftKey]);
  useEffect(() => {
    checkDraft();
    const params = new URLSearchParams(location.search);
    if (params.get("url") || params.get("title") || params.get("text")) {
      const existing = localStorage.getItem(draftKey);
      if (existing) {
        try {
          const old = JSON.parse(existing);
          if (
            (old.title || old.url || old.imageUrl) &&
            !confirm(
              "Une idée est déjà en brouillon. L’écarter pour capturer ce lien ?",
            )
          ) {
            setNotice(
              "Votre brouillon est conservé. Copiez le lien à ajouter puis reprenez votre brouillon.",
            );
            history.replaceState(null, "", "/");
            return;
          }
        } catch {}
      }
      setDraft({
        title:
          params.get("title") ||
          (!params.get("text")?.startsWith("http")
            ? params.get("text")?.slice(0, 200) || ""
            : ""),
        url:
          params.get("url") ||
          (params.get("text")?.startsWith("http") ? params.get("text")! : ""),
        description: "",
        specifications: "",
        privateNote: "",
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
      });
      setForm("new");
      history.replaceState(null, "", "/");
    }
  }, [checkDraft]);
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 60000);
    return () => clearInterval(interval);
  }, [router]);
  function refresh() {
    router.refresh();
  }
  function done() {
    setForm(null);
    setModal("");
    refresh();
    checkDraft();
  }
  async function run(task: () => Promise<actions.Result>, message: string) {
    setBusy(true);
    try {
      const r = await task();
      if (r.ok) {
        setNotice(message);
        refresh();
      } else setNotice(r.error);
    } catch {
      setNotice("Impossible d’effectuer cette action. Réessayez.");
    } finally {
      setBusy(false);
    }
  }
  function navigate(v: string) {
    setView(v);
    setList("");
    setPerson("");
    setSelected([]);
    setQuery("");
    setMin("");
    setMax("");
    setStatus("");
    setVisibility("");
    setPriority("");
  }
  function add() {
    setReuse(false);
    if (hasDraft) {
      setModal("draft");
      return;
    }
    setDraft(undefined);
    setForm("new");
  }
  function resume() {
    try {
      setDraft(
        JSON.parse(localStorage.getItem(draftKey) || "null") ?? undefined,
      );
      setModal("");
      setForm("new");
    } catch {
      setNotice("Brouillon illisible.");
    }
  }
  const prefs = data.profile.preferences;
  const favorites = Array.isArray(prefs.favorites)
    ? (prefs.favorites as string[])
    : [];
  const order = Array.isArray(prefs.order) ? (prefs.order as string[]) : [];
  const sorted = <T extends { id: string }>(rows: T[]) =>
    [...rows].sort(
      (a, b) =>
        Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)) ||
        (order.indexOf(a.id) < 0 ? 999 : order.indexOf(a.id)) -
          (order.indexOf(b.id) < 0 ? 999 : order.indexOf(b.id)),
    );
  function favorite(id: string) {
    run(
      () =>
        actions.updatePreferences({
          ...prefs,
          favorites: favorites.includes(id)
            ? favorites.filter((x) => x !== id)
            : [...favorites, id],
        }),
      "Favoris mis à jour",
    );
  }
  function move(id: string, ids: string[], delta: number) {
    const i = ids.indexOf(id),
      j = i + delta;
    if (j < 0 || j >= ids.length) return;
    const arr = [...ids];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    run(
      () =>
        actions.updatePreferences({
          ...prefs,
          order: [...arr, ...order.filter((x) => !ids.includes(x))],
        }),
      "Ordre enregistré",
    );
  }
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const proposals = data.proposals
    .filter((p) => {
      const idea = data.ideas.find((i) => i.id === p.idea_id);
      if (!idea) return false;
      const archived = !!p.archived_at;
      if (view === "archives" ? !archived : archived) return false;
      if (listId && !inList(p, listId, data.proposals)) return false;
      if (
        person &&
        (p.recipient_id
          ? p.recipient_id !== person
          : !idea.candidates.includes(person))
      )
        return false;
      if (view === "unfiled" && (p.recipient_id || idea.candidates.length))
        return false;
      return (
        normalize(
          idea.title + " " + idea.description + " " + idea.specifications,
        ).includes(normalize(query)) &&
        budgetOverlap(
          idea.price_min,
          idea.price_max,
          min ? Number(min) : null,
          max ? Number(max) : null,
        ) &&
        (!status || (status === "reserved" ? p.reserved : !p.reserved)) &&
        (!visibility || idea.visibility === visibility) &&
        (!priority || p.priority === Number(priority))
      );
    })
    .sort(
      (a, b) =>
        Number(a.reserved) - Number(b.reserved) ||
        a.priority - b.priority ||
        b.created_at.localeCompare(a.created_at),
    );
  const currentList = data.lists.find((l) => l.id === listId);
  const currentPerson = data.recipients.find((r) => r.id === person);
  const titles: Record<string, string> = {
    people: "Pour qui",
    lists: "Mes listes",
    ideas: "Mes idées",
    unfiled: "À classer",
    archives: "Archives",
  };
  const activeFilters = [
    person ? currentPerson?.name : "",
    min || max ? `${min || 0}–${max || "∞"} €` : "",
    status === "reserved" ? "Réservés" : status ? "Disponibles" : "",
    visibility === "private"
      ? "🔒 Moi uniquement"
      : visibility === "household"
        ? "Nous deux"
        : visibility
          ? "Public"
          : "",
    priority ? priorities[Number(priority)] : "",
  ].filter(Boolean);
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "kad-humbert-carnet.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function shareLink(l: GiftList) {
    return location.origin + "/l/" + l.share_token;
  }
  const selectedProposals = data.proposals.filter((p) =>
    selected.includes(p.id),
  );
  return (
    <>
      <header className="topbar">
        <button className="brand" onClick={() => navigate("people")}>
          Kad’Humbert <span>✳</span>
        </button>
        <button
          className="avatar"
          aria-label="Ouvrir mon compte"
          onClick={() => setModal("account")}
        >
          {data.profile.display_name.slice(0, 1)}
        </button>
      </header>
      <div className="shell">
        <aside>
          <p className="slogan">Pour les âmes en panne d’inspiration</p>
          <nav>
            {Object.entries(titles).map(([key, label]) => (
              <button
                key={key}
                className={view === key ? "active" : ""}
                onClick={() => navigate(key)}
              >
                {
                  (
                    {
                      ideas: "✦",
                      lists: "▤",
                      people: "☺",
                      archives: "◷",
                      unfiled: "↪",
                    } as Record<string, string>
                  )[key]
                }{" "}
                {label}
                {key === "unfiled" && (
                  <small>
                    {
                      data.proposals.filter(
                        (p) =>
                          !p.archived_at &&
                          data.ideas.some(
                            (i) =>
                              i.id === p.idea_id &&
                              !i.candidates.length &&
                              !p.recipient_id,
                          ),
                      ).length
                    }
                  </small>
                )}
              </button>
            ))}
          </nav>
          <p className="aside-note">
            Les bonnes idées méritent
            <br />
            un petit coin à elles.
          </p>
        </aside>
        <main className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">LE CARNET DES PETITES ATTENTIONS</p>
              {(listId || person) && (
                <button
                  className="back secondary"
                  onClick={() => {
                    setList("");
                    setPerson("");
                    setSelected([]);
                  }}
                >
                  ← Retour
                </button>
              )}
              <h1>
                {currentList?.name || currentPerson?.name || titles[view]}
              </h1>
              <p>
                {currentList?.slogan ||
                  (view === "ideas"
                    ? "Un coup de cœur aujourd’hui, un beau cadeau demain."
                    : view === "unfiled"
                      ? "Vos trouvailles en attendant de savoir à qui et quand."
                      : "À chaque attention, sa place.")}
              </p>
            </div>
            {view === "lists" && !listId && (
              <button
                onClick={() => {
                  setEditingList(undefined);
                  setModal("list");
                }}
              >
                + Liste
              </button>
            )}
            {view === "people" && !person && (
              <button onClick={() => setModal("person")}>+ Destinataire</button>
            )}
          </div>
          {undo.length > 0 && (
            <button
              className="secondary"
              onClick={async () => {
                const r = await Promise.all(
                  undo.map((id) => actions.undoArchive(id)),
                );
                if (r.every((v) => v.ok)) {
                  setUndo([]);
                  refresh();
                  setNotice("Archivage annulé");
                } else
                  setNotice("Certaines idées n’ont pas pu être restaurées");
              }}
            >
              Annuler le dernier archivage
            </button>
          )}
          {notice && (
            <p role="status" className="notice">
              {notice}
              <button
                className="icon secondary"
                aria-label="Masquer le message"
                onClick={() => setNotice("")}
              >
                ✕
              </button>
            </p>
          )}
          {hasDraft && (
            <button className="draft-banner" onClick={resume}>
              ✎ Votre brouillon vous attend <span>Reprendre →</span>
            </button>
          )}
          {currentList && (
            <div className="list-banner">
              {previews[currentList.id] && (
                <img src={previews[currentList.id]} alt="" />
              )}
              <div className="row">
                <button
                  className="secondary"
                  onClick={() => {
                    setEditingList(currentList);
                    setModal("list");
                  }}
                >
                  Modifier la liste
                </button>
                <a
                  className="secondary guest-preview-link"
                  href={"/l/" + currentList.share_token}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Afficher la liste en mode invité ↗
                </a>
                <button onClick={() => setModal("share")}>Partager ↗</button>
                <button
                  className="secondary"
                  onClick={() => setModal("duplicate")}
                >
                  Dupliquer
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    run(
                      () => actions.archiveList(currentList.id),
                      "Liste archivée, idées conservées",
                    )
                  }
                >
                  Archiver
                </button>
              </div>
              <small>
                {data.shares
                  .filter((s) => s.list_id === currentList.id)
                  .map(
                    (s) =>
                      s.contact_name + " · " + s.channel + " (partage préparé)",
                  )
                  .join(" / ")}
              </small>
            </div>
          )}
          {(view === "lists" && !listId) || (view === "people" && !person) ? (
            <>
              <div className="row">
                <input
                  aria-label="Rechercher"
                  placeholder="Rechercher…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  className="secondary"
                  onClick={() => setOrganize(!organize)}
                >
                  {organize ? "Terminer" : "Organiser"}
                </button>
              </div>
              <div className="grid">
                {view === "lists"
                  ? sorted(
                      data.lists.filter(
                        (l) =>
                          !l.archived_at &&
                          normalize(l.name + " " + l.slogan).includes(
                            normalize(query),
                          ),
                      ),
                    ).map((l, _, arr) => (
                      <article className="list-card" key={l.id}>
                        {previews[l.id] ? (
                          <img src={previews[l.id]} alt="" />
                        ) : (
                          <div className="cover-placeholder">✳</div>
                        )}
                        <button
                          className="text-button card-open"
                          onClick={() => {
                            setList(l.id);
                            setQuery("");
                          }}
                        >
                          <h2>{l.name}</h2>
                          <p>{l.slogan || "Une liste pleine d’attentions"}</p>
                        </button>
                        <div className="row">
                          <button
                            className="secondary"
                            onClick={() => favorite(l.id)}
                            aria-label={"Favori " + l.name}
                          >
                            {favorites.includes(l.id) ? "★" : "☆"}
                          </button>
                          <small>
                            {
                              data.proposals.filter(
                                (p) =>
                                  !p.archived_at &&
                                  inList(p, l.id, data.proposals),
                              ).length
                            }{" "}
                            idées
                          </small>
                          {organize && (
                            <>
                              <button
                                className="secondary"
                                onClick={() =>
                                  move(
                                    l.id,
                                    arr.map((x) => x.id),
                                    -1,
                                  )
                                }
                                aria-label="Monter"
                              >
                                ↑
                              </button>
                              <button
                                className="secondary"
                                onClick={() =>
                                  move(
                                    l.id,
                                    arr.map((x) => x.id),
                                    1,
                                  )
                                }
                                aria-label="Descendre"
                              >
                                ↓
                              </button>
                            </>
                          )}
                        </div>
                      </article>
                    ))
                  : sorted(
                      data.recipients.filter((r) =>
                        normalize(r.name).includes(normalize(query)),
                      ),
                    ).map((r, _, arr) => (
                      <article className="person-card" key={r.id}>
                        <button
                          className="text-button card-open"
                          onClick={() => {
                            setPerson(r.id);
                            setQuery("");
                          }}
                        >
                          <div className="person-icon">
                            {r.is_common ? "♡" : r.name.slice(0, 1)}
                          </div>
                          <h2>{r.name}</h2>
                          <p>
                            {
                              data.proposals.filter(
                                (p) =>
                                  !p.archived_at &&
                                  (p.recipient_id
                                    ? p.recipient_id === r.id
                                    : data.ideas.some(
                                        (i) =>
                                          i.id === p.idea_id &&
                                          i.candidates.includes(r.id),
                                      )),
                              ).length
                            }{" "}
                            idées
                          </p>
                        </button>
                        <button
                          className="secondary"
                          aria-label={"Favori " + r.name}
                          onClick={() => favorite(r.id)}
                        >
                          {favorites.includes(r.id) ? "★" : "☆"}
                        </button>
                        {organize && (
                          <>
                            <button
                              className="secondary"
                              onClick={() =>
                                move(
                                  r.id,
                                  arr.map((x) => x.id),
                                  -1,
                                )
                              }
                            >
                              ↑
                            </button>
                            <button
                              className="secondary"
                              onClick={() =>
                                move(
                                  r.id,
                                  arr.map((x) => x.id),
                                  1,
                                )
                              }
                            >
                              ↓
                            </button>
                          </>
                        )}
                      </article>
                    ))}
              </div>
            </>
          ) : (
            <>
              <section className="filters">
                <input
                  placeholder="Rechercher une idée…"
                  aria-label="Rechercher une idée"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <details>
                  <summary>Affiner · destinataire, budget, priorité</summary>
                  <div className="filter-grid">
                    <label>
                      Pour qui
                      <select
                        value={person}
                        onChange={(e) => setPerson(e.target.value)}
                      >
                        <option value="">Tout le monde</option>
                        {data.recipients.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Prix minimum
                      <input
                        type="number"
                        min="0"
                        value={min}
                        onChange={(e) => setMin(e.target.value)}
                        placeholder="€"
                      />
                    </label>
                    <label>
                      Prix maximum
                      <input
                        type="number"
                        min="0"
                        value={max}
                        onChange={(e) => setMax(e.target.value)}
                        placeholder="€"
                      />
                    </label>
                    <label>
                      Réservation
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        <option value="">Toutes</option>
                        <option value="available">Disponibles</option>
                        <option value="reserved">Réservés</option>
                      </select>
                    </label>
                    <label>
                      Visibilité
                      <select
                        value={visibility}
                        onChange={(e) => setVisibility(e.target.value)}
                      >
                        <option value="">Toutes</option>
                        <option value="private">🔒 Moi uniquement</option>
                        <option value="household">Nous deux</option>
                        <option value="public">Public</option>
                      </select>
                    </label>
                    <label>
                      Priorité
                      <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                      >
                        <option value="">Toutes</option>
                        {priorities.map((p, i) => (
                          <option key={i} value={i}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => {
                      const name = prompt("Nom de ce filtre");
                      if (name)
                        run(
                          () =>
                            actions.updatePreferences({
                              ...prefs,
                              filters: [
                                ...(Array.isArray(prefs.filters)
                                  ? prefs.filters
                                  : []),
                                {
                                  name,
                                  query,
                                  min,
                                  max,
                                  status,
                                  visibility,
                                  priority,
                                  person,
                                },
                              ],
                            }),
                          "Filtre enregistré",
                        );
                    }}
                  >
                    Enregistrer ce filtre
                  </button>
                </details>
                <div className="chips">
                  {activeFilters.map((f) => (
                    <span className="chip selected" key={f}>
                      {f}
                    </span>
                  ))}
                  {activeFilters.length > 0 && (
                    <button
                      className="chip"
                      onClick={() => {
                        setPerson("");
                        setMin("");
                        setMax("");
                        setStatus("");
                        setVisibility("");
                        setPriority("");
                      }}
                    >
                      Effacer les filtres
                    </button>
                  )}
                  {(Array.isArray(prefs.filters) ? prefs.filters : []).map(
                    (f: Record<string, string>, i: number) => (
                      <button
                        key={i}
                        className="chip"
                        onClick={() => {
                          setQuery(f.query);
                          setMin(f.min);
                          setMax(f.max);
                          setStatus(f.status);
                          setVisibility(f.visibility);
                          setPriority(f.priority);
                          setPerson(f.person);
                        }}
                      >
                        ↪ {f.name}
                      </button>
                    ),
                  )}
                </div>
              </section>
              <div className="row">
                <p>
                  {proposals.length} proposition
                  {proposals.length > 1 ? "s" : ""}
                </p>
                {selected.length > 0 && (
                  <button
                    onClick={() => {
                      setBulkAction("archive");
                      setModal("bulk");
                    }}
                  >
                    {selected.length} sélectionnée
                    {selected.length > 1 ? "s" : ""} · Actions
                  </button>
                )}
              </div>
              {!proposals.length && (
                <div className="empty">
                  <span>✳</span>
                  <h2>Une place pour la prochaine bonne idée</h2>
                  <p>
                    {query || activeFilters.length
                      ? "Aucun résultat avec ces filtres."
                      : "Ajoutez un titre, un lien ou une photo pour commencer."}
                  </p>
                  <button onClick={add}>+ Idée</button>
                </div>
              )}
              {[false, true].map((reserved) => {
                const rows = proposals.filter((p) => p.reserved === reserved);
                if (!rows.length) return null;
                return (
                  <section key={String(reserved)}>
                    {reserved && (
                      <h2 className="reserved-heading">
                        Déjà réservés · {rows.length}
                      </h2>
                    )}
                    <div className="grid">
                      {rows.map((p) => {
                        const i = data.ideas.find((i) => i.id === p.idea_id)!;
                        return (
                          <article
                            key={p.id}
                            className={
                              "gift-card " +
                              (reserved ? "reserved " : "") +
                              (i.visibility === "private" ? "private" : "")
                            }
                          >
                            <div className="gift-image">
                              {previews[i.id] ? (
                                <img src={previews[i.id]} alt="" />
                              ) : (
                                <span>✳</span>
                              )}
                              <label className="selection">
                                <input
                                  type="checkbox"
                                  checked={selected.includes(p.id)}
                                  aria-label={"Sélectionner " + i.title}
                                  onChange={(e) =>
                                    setSelected(
                                      e.target.checked
                                        ? [...selected, p.id]
                                        : selected.filter((id) => id !== p.id),
                                    )
                                  }
                                />
                              </label>
                              <span className="badge">
                                {i.visibility === "private"
                                  ? "🔒 Moi uniquement"
                                  : priorities[p.priority]}
                              </span>
                            </div>
                            <div className="gift-body">
                              <button
                                className="text-button card-open"
                                onClick={() => {
                                  setReuse(false);
                                  setForm(p);
                                }}
                              >
                                <h2>{i.title}</h2>
                              </button>
                              <p className="recipient">
                                Pour qui ?{" "}
                                <b>
                                  {data.recipients.find(
                                    (r) => r.id === p.recipient_id,
                                  )?.name ||
                                    i.candidates
                                      .map(
                                        (id) =>
                                          data.recipients.find(
                                            (r) => r.id === id,
                                          )?.name,
                                      )
                                      .filter(Boolean)
                                      .join(", ") ||
                                    "À décider"}
                                </b>
                              </p>
                              <p>{formatPrice(i.price_min, i.price_max)}</p>
                              <div className="list-tags">
                                {data.lists
                                  .filter(
                                    (l) =>
                                      inList(p, l.id, data.proposals) &&
                                      !l.archived_at,
                                  )
                                  .map((l) => (
                                    <span className="list-tag" key={l.id}>
                                      ▤ {l.name}
                                    </span>
                                  ))}
                              </div>
                              {p.collective && (
                                <p>
                                  {Number(p.contributed).toLocaleString(
                                    "fr-FR",
                                  )}{" "}
                                  /{" "}
                                  {Number(p.target_amount).toLocaleString(
                                    "fr-FR",
                                  )}{" "}
                                  € de participations
                                </p>
                              )}
                              {i.specifications && (
                                <p className="specs">{i.specifications}</p>
                              )}
                              {p.archived_at && (
                                <p>
                                  {reasons[p.archive_reason ?? ""] ||
                                    "Archivée"}{" "}
                                  ·{" "}
                                  {new Date(p.archived_at).toLocaleDateString(
                                    "fr-FR",
                                  )}{" "}
                                  {p.archive_note}
                                </p>
                              )}
                              {i.image_credit && (
                                <small>
                                  <a
                                    href={i.image_credit.url}
                                    rel="noopener noreferrer"
                                    target="_blank"
                                  >
                                    Photo : {i.image_credit.name} / Unsplash
                                  </a>
                                </small>
                              )}
                              {i.url && (
                                <a
                                  className="product-link"
                                  href={i.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Voir le produit ↗
                                </a>
                              )}
                              <div className="row">
                                <button
                                  className="secondary"
                                  onClick={() => {
                                    setReuse(false);
                                    setForm(p);
                                  }}
                                >
                                  Modifier
                                </button>
                                {p.archived_at ? (
                                  <button
                                    className="secondary"
                                    disabled={busy}
                                    onClick={() =>
                                      run(
                                        () => actions.resetGift(p.id, true),
                                        "Idée restaurée sans ancienne réservation",
                                      )
                                    }
                                  >
                                    Restaurer
                                  </button>
                                ) : (
                                  <button
                                    className="secondary"
                                    onClick={() => {
                                      setSelected([p.id]);
                                      setModal("archive");
                                    }}
                                  >
                                    Archiver
                                  </button>
                                )}
                                <button
                                  className="secondary"
                                  onClick={() => {
                                    setReuse(true);
                                    setForm(p);
                                  }}
                                >
                                  Réutiliser
                                </button>
                              </div>
                              {(reserved ||
                                (p.collective &&
                                  Number(p.contributed) > 0)) && (
                                <div
                                  className={
                                    "reservation-flip " +
                                    (names[p.id] ? "revealed" : "")
                                  }
                                >
                                  <p>
                                    {names[p.id] ||
                                      (p.reserved
                                        ? "✓ Réservé · surprise préservée"
                                        : "Participations en cours · identités masquées")}
                                  </p>
                                  <button
                                    className="secondary"
                                    onClick={async () => {
                                      if (names[p.id]) {
                                        setNames({ ...names, [p.id]: "" });
                                        return;
                                      }
                                      const r = await actions.revealGift(p.id);
                                      if (r.ok)
                                        setNames({
                                          ...names,
                                          [p.id]:
                                            r.data
                                              ?.map((n) => n.name)
                                              .join(", ") || "Aucun réservant",
                                        });
                                      else setNotice(r.error);
                                    }}
                                  >
                                    {names[p.id]
                                      ? "Masquer"
                                      : "Retourner pour découvrir qui"}
                                  </button>
                                  <button
                                    className="secondary"
                                    onClick={() => {
                                      if (
                                        confirm(
                                          "Remettre ce cadeau à disposition ? Les réservants seront prévenus par email si le service est configuré.",
                                        )
                                      )
                                        run(
                                          () => actions.resetGift(p.id),
                                          "Réservation annulée, cadeau disponible",
                                        );
                                    }}
                                  >
                                    Remettre à disposition
                                  </button>
                                </div>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              {view === "archives" && (
                <section>
                  <h2>Listes archivées</h2>
                  {data.lists
                    .filter((l) => l.archived_at)
                    .map((l) => (
                      <div className="row" key={l.id}>
                        <b>{l.name}</b>
                        <button
                          className="secondary"
                          onClick={() =>
                            run(
                              () => actions.archiveList(l.id, true),
                              "Liste restaurée",
                            )
                          }
                        >
                          Restaurer
                        </button>
                        <button
                          className="secondary"
                          onClick={() => {
                            setList(l.id);
                            setModal("duplicate");
                          }}
                        >
                          Dupliquer pour une nouvelle édition
                        </button>
                      </div>
                    ))}
                </section>
              )}
            </>
          )}
        </main>
      </div>
      <button className="add-sticky" onClick={add}>
        + Idée
      </button>
      {form && (
        <Modal
          message={notice}
          title={
            form === "new"
              ? "Une nouvelle idée"
              : reuse
                ? "Réutiliser cette idée"
                : "Modifier cette idée"
          }
          close={() => {
            setForm(null);
            checkDraft();
          }}
        >
          <GiftForm
            data={data}
            idea={
              form === "new"
                ? undefined
                : data.ideas.find((i) => i.id === form.idea_id)
            }
            proposal={form === "new" || reuse ? undefined : form}
            preview={form === "new" ? undefined : previews[form.idea_id]}
            draft={form === "new" ? draft : undefined}
            done={done}
            onDraft={checkDraft}
            defaultRecipientId={
              form === "new" ? person || undefined : undefined
            }
            defaultListId={form === "new" ? listId || undefined : undefined}
          />
          {form !== "new" && (
            <details>
              <summary>Historique de cette idée</summary>
              {data.activity
                .filter((a) => a.idea_id === form.idea_id)
                .map((a) => (
                  <p key={a.id}>
                    {data.profiles.find((p) => p.id === a.actor_id)
                      ?.display_name || "Gestionnaire"}{" "}
                    · {new Date(a.created_at).toLocaleString("fr-FR")}
                    <br />
                    {Object.keys(a.changes).length
                      ? Object.entries(a.changes)
                          .map(
                            ([key, v]) =>
                              `${key} : ${JSON.stringify(v.before)} → ${JSON.stringify(v.after)}`,
                          )
                          .join(" · ")
                      : a.message}
                  </p>
                ))}
            </details>
          )}
        </Modal>
      )}
      {modal === "draft" && (
        <Modal title="Votre brouillon vous attend" close={() => setModal("")}>
          <p>Reprenez-le ou écartez-le avant de commencer une autre idée.</p>
          <button onClick={resume}>Reprendre</button>
          <button
            className="secondary"
            onClick={() => {
              localStorage.removeItem(draftKey);
              checkDraft();
              setDraft(undefined);
              setModal("");
              setForm("new");
            }}
          >
            Écarter et créer une idée
          </button>
        </Modal>
      )}
      {modal === "person" && (
        <Modal title="Nouveau destinataire" close={() => setModal("")}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const r = await actions.createRecipient(String(f.get("name")));
              if (r.ok) done();
              else setNotice(r.error);
            }}
          >
            <label>
              Nom
              <input name="name" required maxLength={100} />
            </label>
            <button>Créer le destinataire</button>
          </form>
        </Modal>
      )}
      {modal === "list" && (
        <Modal
          message={notice}
          title={editingList ? "Modifier la liste" : "Nouvelle liste"}
          close={() => setModal("")}
        >
          <ListForm
            list={editingList}
            preview={editingList && previews[editingList.id]}
            done={done}
          />
        </Modal>
      )}
      {modal === "share" && currentList && (
        <Modal title="Partager cette liste" close={() => setModal("")}>
          <p>Les invités ouvrent uniquement cette liste, sans compte.</p>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(shareLink(currentList));
              setNotice("Lien copié");
            }}
          >
            Copier le lien
          </button>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                name = String(f.get("name")),
                channel = String(f.get("channel")),
                destination = String(f.get("destination"));
              const r = await actions.recordShare(
                currentList.id,
                name,
                channel,
              );
              if (!r.ok) {
                setNotice(r.error);
                return;
              }
              const message = `Bonjour ${name}, je t’invite à voir la liste « ${currentList.name} » sur Kad’Humbert ✨ ${shareLink(currentList)}`;
              const url =
                channel === "whatsapp"
                  ? "https://wa.me/?text=" + encodeURIComponent(message)
                  : channel === "gmail"
                    ? "https://mail.google.com/mail/?view=cm&to=" +
                      encodeURIComponent(destination) +
                      "&su=" +
                      encodeURIComponent(currentList.name) +
                      "&body=" +
                      encodeURIComponent(message)
                    : "sms:" +
                      encodeURIComponent(destination) +
                      "?body=" +
                      encodeURIComponent(message);
              window.location.assign(url);
              refresh();
            }}
          >
            <label>
              À qui ?<input name="name" required maxLength={100} />
            </label>
            <label>
              Mode de partage
              <select name="channel">
                <option value="whatsapp">WhatsApp</option>
                <option value="gmail">Gmail</option>
                <option value="sms">SMS</option>
              </select>
            </label>
            <label>
              Email ou téléphone, facultatif
              <input name="destination" />
            </label>
            <button>Envoyer le lien ↗</button>
          </form>
          <small>
            Le canal s’ouvre avec le texte préparé. Vous confirmez l’envoi dans
            ce canal.
          </small>
        </Modal>
      )}
      {(modal === "archive" || modal === "bulk") && (
        <Modal
          message={notice}
          title={`${selected.length} idée(s) sélectionnée(s)`}
          close={() => setModal("")}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                action =
                  modal === "archive"
                    ? "archive"
                    : String(f.get("action") || "archive");
              setBusy(true);
              const results = await Promise.all(
                selectedProposals.map((p) =>
                  action === "list"
                    ? actions.changeProposalLists(p.id, [
                        ...new Set([...p.list_ids, String(f.get("list"))]),
                      ])
                    : action === "removeList"
                      ? actions.changeProposalLists(
                          p.id,
                          p.list_ids.filter(
                            (id) => id !== String(f.get("list")),
                          ),
                        )
                      : action === "person"
                        ? actions.addCandidate(
                            p.idea_id,
                            String(f.get("recipient")),
                          )
                        : actions.archiveGift(
                            p.id,
                            String(f.get("reason")),
                            String(f.get("note")),
                          ),
                ),
              );
              setBusy(false);
              const errors = results.filter((r) => !r.ok);
              if (errors.length) {
                setNotice(`${errors.length} action(s) non effectuée(s).`);
                refresh();
              } else {
                if (action === "archive") setUndo([...selected]);
                setSelected([]);
                done();
                setNotice("Actions enregistrées");
              }
            }}
          >
            {modal === "bulk" && (
              <label>
                Action
                <select
                  name="action"
                  value={bulkAction}
                  onChange={(e) => setBulkAction(e.target.value)}
                >
                  <option value="archive">Archiver</option>
                  <option value="list">Ajouter à une liste</option>
                  <option value="removeList">Retirer d’une liste</option>
                  <option value="person">
                    Ajouter un destinataire possible
                  </option>
                </select>
              </label>
            )}
            <div
              hidden={
                modal === "archive" ||
                !["list", "removeList"].includes(bulkAction)
              }
            >
              <label>
                Liste
                <select name="list">
                  {data.lists
                    .filter((l) => !l.archived_at)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div hidden={modal !== "archive" && bulkAction !== "archive"}>
              <label>
                Pourquoi archiver ?
                <select name="reason">
                  {Object.entries(reasons).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Note / motif
                <textarea name="note" />
              </label>
            </div>
            <div hidden={modal === "archive" || bulkAction !== "person"}>
              <label>
                Destinataire possible
                <select name="recipient">
                  {data.recipients.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <small>
                Commun remplace les autres personnes possibles. Les attributions
                existantes sont préservées ; une modification incompatible est
                refusée.
              </small>
            </div>
            <button disabled={busy}>Appliquer</button>
          </form>
        </Modal>
      )}
      {modal === "duplicate" && currentList && (
        <Modal title="Une nouvelle édition" close={() => setModal("")}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const r = await actions.duplicateProposals(
                currentList.id,
                f.getAll("gift").map(String),
                String(f.get("name")),
              );
              if (r.ok) done();
              else setNotice(r.error);
            }}
          >
            <label>
              Nom de la nouvelle liste
              <input
                name="name"
                required
                defaultValue={currentList.name + " · nouvelle édition"}
              />
            </label>
            <p>
              Choisissez les idées à reprendre. Les réservations restent dans
              l’ancienne édition.
            </p>
            {data.proposals
              .filter((p) => inList(p, currentList.id, data.proposals))
              .map((p) => (
                <label className="check" key={p.id}>
                  <input
                    type="checkbox"
                    name="gift"
                    value={p.id}
                    defaultChecked
                  />
                  {data.ideas.find((i) => i.id === p.idea_id)?.title}
                </label>
              ))}
            <button>Créer la nouvelle liste</button>
          </form>
        </Modal>
      )}
      {modal === "account" && (
        <Modal
          message={notice}
          title={"Le compte de " + data.profile.display_name}
          close={() => setModal("")}
        >
          <p>{data.profile.email}</p>
          <label className="check">
            <input
              type="checkbox"
              checked={prefs.email !== false}
              onChange={(e) =>
                run(
                  () =>
                    actions.updatePreferences({
                      ...prefs,
                      email: e.target.checked,
                    }),
                  "Préférences mises à jour",
                )
              }
            />{" "}
            Notifications par email à chaque réservation
          </label>
          <p>Le nom des réservants est masqué dans les notifications.</p>
          <button className="secondary" onClick={exportData}>
            Exporter mon carnet (JSON)
          </button>
          <details>
            <summary>Historique du carnet</summary>
            {data.activity
              .slice()
              .sort((a, b) => b.id - a.id)
              .slice(0, 50)
              .map((a) => (
                <p key={a.id}>
                  {a.message} · {new Date(a.created_at).toLocaleString("fr-FR")}
                  <br />
                  {Object.entries(a.changes)
                    .map(
                      ([k, v]) =>
                        `${k} : ${JSON.stringify(v.before)} → ${JSON.stringify(v.after)}`,
                    )
                    .join(", ")}
                </p>
              ))}
          </details>
          <button className="secondary" onClick={() => actions.logout()}>
            Se déconnecter
          </button>
        </Modal>
      )}
    </>
  );
}
function ListForm({
  list,
  preview,
  done,
}: {
  list?: GiftList;
  preview?: string;
  done: () => void;
}) {
  const [image, setImage] = useState(list?.image_url ?? null),
    [url, setUrl] = useState(preview ?? ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const f = new FormData(e.currentTarget);
        const r = await actions.saveList({
          id: list?.id,
          name: String(f.get("name")),
          slogan: String(f.get("slogan")),
          imageUrl: image,
        });
        setBusy(false);
        if (r.ok) done();
        else setError(r.error);
      }}
    >
      <label>
        Nom de la liste
        <input required name="name" defaultValue={list?.name} maxLength={150} />
      </label>
      <label>
        Message d’accueil / slogan
        <textarea name="slogan" defaultValue={list?.slogan} />
      </label>
      {url && (
        <img className="cover-preview" src={url} alt="Couverture choisie" />
      )}
      <label>
        Photo de couverture
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            const f = new FormData();
            f.set("file", file);
            const r = await actions.uploadImage(f);
            setBusy(false);
            if (r.ok && r.data) {
              setImage(r.data.path);
              setUrl(r.data.url);
            } else if (!r.ok) setError(r.error);
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy}>Enregistrer la liste</button>
    </form>
  );
}
