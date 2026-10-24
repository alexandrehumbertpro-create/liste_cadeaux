"use client";
import ActivityLog from "./ActivityLog";
import ListShares from "./ListShares";
import { listHistory } from "@/lib/list-history";
import Brand from "@/components/Brand";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Dataset, Proposal, GiftList } from "@/lib/types";
import type { GiftInput } from "@/lib/validation";
import { budgetOverlap, formatPrice, inList } from "@/lib/validation";
import * as actions from "@/lib/client-actions";
import Modal from "./Modal";
import GiftForm from "./GiftForm";
import ImageInput from "./ImageInput";
import QuickShare from "./QuickShare";
import ColorPicker from "./ColorPicker";
import { personalOrder } from "@/lib/personal-order";
import { browserClient } from "@/lib/supabase/browser";
import { recipientColors, recipientStyle } from "@/lib/recipient-colors";
const priorities = ["♥ Coup de cœur", "★ Idée prioritaire", "Idée"];
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
  const urlParams = useSearchParams().toString();
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
    [draftInfo, setDraftInfo] = useState<{
      title: string;
      url: string;
      image: string;
    } | null>(null),
    [modal, setModal] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [names, setNames] = useState<Record<string, string>>({}),
    [bulkAction, setBulkAction] = useState("archive"),
    [reuse, setReuse] = useState(false),
    [undo, setUndo] = useState<string[]>([]),
    [editingList, setEditingList] = useState<GiftList | undefined>(),
    [organize, setOrganize] = useState(false),
    [manualOrder, setManualOrder] = useState<string[] | null>(null),
    [editingPerson, setEditingPerson] = useState(""),
    [personName, setPersonName] = useState(""),
    [archivePersonIdeas, setArchivePersonIdeas] = useState(false),
    [shareProposal, setShareProposal] = useState<Proposal | null>(null),
    [colorPerson, setColorPerson] = useState(""),
    [personColor, setPersonColor] = useState("#e9eeff");
  const draftKey = "kad-draft-" + data.profile.id;
  const checkDraft = useCallback(() => {
    try {
      const v = JSON.parse(localStorage.getItem(draftKey) || "null");
      setHasDraft(Boolean(v && (v.title || v.url || v.imageUrl)));
      setDraftInfo(
        v
          ? {
              title: v.title || "Idée à compléter",
              url: v.url || "",
              image: /^https?:/.test(v.draftPreview || v.imageUrl || "")
                ? v.draftPreview || v.imageUrl
                : "",
            }
          : null,
      );
    } catch {
      setHasDraft(false);
      setDraftInfo(null);
    }
  }, [draftKey]);
  useEffect(() => {
    checkDraft();
    const params = new URLSearchParams(location.search);
    const mail = params.get("mail");
    if (mail) {
      const statuses: Record<string, string> = {
        connected: "Votre Gmail est connecté.",
        not_configured:
          "La connexion Gmail n’est pas encore configurée dans l’application.",
        wrong_account:
          "Connectez le compte Google correspondant à votre email administrateur.",
        invalid_state: "La connexion a expiré. Réessayez depuis Mon compte.",
        missing_permission: "L’autorisation d’envoi Gmail est nécessaire.",
        cancelled: "Connexion Gmail annulée.",
        failed: "Impossible de connecter Gmail. Réessayez depuis Mon compte.",
      };
      setNotice(statuses[mail] || "Connexion Gmail à vérifier.");
      setModal("account");
      history.replaceState(null, "", "/");
    }
    const requested = params.get("idea");
    if (requested) {
      const proposal = data.proposals.find((p) => p.id === requested);
      if (proposal) {
        setView("ideas");
        setForm(proposal);
      } else setNotice("Cette idée n’est plus accessible.");
      history.replaceState(null, "", "/");
      return;
    }

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
  }, [checkDraft, urlParams]);
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 60000);
    return () => clearInterval(interval);
  }, [router]);
  useEffect(() => {
    const db = browserClient();
    const channel = db
      .channel("shared-recipients")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recipients" },
        () => router.refresh(),
      )
      .subscribe();
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      void db.removeChannel(channel);
    };
  }, [router]);
  function refresh() {
    router.refresh();
  }
  function done(message?: string) {
    if (message) setNotice(message);
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
  const colors = recipientColors(data.recipients);
  const favorites = Array.isArray(prefs.favorites)
    ? (prefs.favorites as string[])
    : [];
  const order =
    manualOrder ??
    (Array.isArray(prefs.order) ? (prefs.order as string[]) : []);
  useEffect(() => setManualOrder(null), [prefs.order]);
  const sorted = <T extends { id: string }>(rows: T[]) =>
    personalOrder(rows, prefs, manualOrder, view === "lists");
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
  function canMove(id: string, ids: string[], delta: number) {
    const at = ids.indexOf(id) + delta;
    return (
      !busy &&
      at >= 0 &&
      at < ids.length &&
      (view !== "lists" ||
        favorites.includes(id) === favorites.includes(ids[at]))
    );
  }
  function saveOrder(arr: string[], ids: string[]) {
    const next = [...arr, ...order.filter((id) => !ids.includes(id))];
    setManualOrder(next);
    void run(async () => {
      const r = await actions.updatePreferences({ ...prefs, order: next });
      if (!r.ok) setManualOrder(null);
      return r;
    }, "Ordre enregistré");
  }
  function move(id: string, ids: string[], delta: number) {
    if (!canMove(id, ids, delta)) return;
    const at = ids.indexOf(id),
      arr = [...ids];
    [arr[at], arr[at + delta]] = [arr[at + delta], arr[at]];
    saveOrder(arr, ids);
  }
  function dropPerson(id: string, target: string, ids: string[]) {
    if (
      !organize ||
      busy ||
      id === target ||
      !ids.includes(id) ||
      !ids.includes(target)
    )
      return;
    const arr = ids.filter((x) => x !== id);
    arr.splice(arr.indexOf(target), 0, id);
    saveOrder(arr, ids);
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
      if (person && p.recipient_id !== person) return false;
      if (
        view === "unfiled" &&
        p.recipient_id &&
        data.recipients.some((r) => r.id === p.recipient_id && !r.deleted_at)
      )
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
    a.download = "la-hotte-humbert-carnet.json";
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
          <Brand />
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
                              (!p.recipient_id ||
                                !data.recipients.some(
                                  (r) =>
                                    r.id === p.recipient_id && !r.deleted_at,
                                )),
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
              <button
                onClick={() => {
                  setPersonColor("#e9eeff");
                  setNotice("");
                  setModal("person");
                }}
              >
                + Personne
              </button>
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
              ✎ Brouillon : {draftInfo?.title || "Idée à compléter"}{" "}
              <span>Reprendre →</span>
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
                  onClick={() => setModal("sharedWith")}
                >
                  Partagé avec ?
                </button>
                <button
                  className="secondary"
                  onClick={() => setModal("listHistory")}
                >
                  Historique
                </button>
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
                  {organize ? "Terminer" : "Modifier l’ordre"}
                </button>
              </div>
              {organize && (
                <p className="notice">
                  {view === "lists"
                    ? "Utilisez les flèches pour déplacer les listes. Les listes favorites restent en tête."
                    : "Utilisez les flèches pour déplacer les fiches, ou glissez-les sur ordinateur. Cet ordre est repris dans le formulaire d’ajout d’idée."}
                </p>
              )}
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
                      <article
                        className="list-card"
                        key={l.id}
                        onClick={(event) => {
                          if (
                            (event.target as HTMLElement).closest(
                              "button,a,input,label,select,textarea,summary",
                            )
                          )
                            return;
                          setList(l.id);
                          setQuery("");
                        }}
                      >
                        {previews[l.id] ? (
                          <img src={previews[l.id]} alt="" />
                        ) : (
                          <div className="cover-placeholder">
                            <img
                              className="placeholder-mark"
                              src="/brand-mark.svg?v=3"
                              alt=""
                            />
                          </div>
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
                      data.recipients.filter(
                        (r) =>
                          !r.deleted_at &&
                          normalize(r.name).includes(normalize(query)),
                      ),
                    ).map((r, _, arr) => (
                      <article
                        className="person-card"
                        key={r.id}
                        style={recipientStyle(colors[r.id])}
                        draggable={organize}
                        onDragStart={(event) =>
                          event.dataTransfer.setData("text/plain", r.id)
                        }
                        onDragOver={(event) => {
                          if (organize) event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          dropPerson(
                            event.dataTransfer.getData("text/plain"),
                            r.id,
                            arr.map((p) => p.id),
                          );
                        }}
                      >
                        <button
                          className="text-button card-open"
                          onClick={() => {
                            if (organize) return;
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
                                  !p.archived_at && p.recipient_id === r.id,
                              ).length
                            }{" "}
                            idées
                          </p>
                        </button>
                        <button
                          className="secondary color-edit"
                          aria-label={"Changer la couleur de " + r.name}
                          onClick={() => {
                            setNotice("");
                            setColorPerson(r.id);
                            setPersonColor(colors[r.id] || "#e9eeff");
                            setModal("personColor");
                          }}
                        >
                          Couleur
                        </button>
                        {!r.is_common && (
                          <button
                            className="secondary"
                            aria-label={"Modifier " + r.name}
                            onClick={() => {
                              setEditingPerson(r.id);
                              setPersonName(r.name);
                              setNotice("");
                              setModal("editPerson");
                            }}
                          >
                            Modifier
                          </button>
                        )}
                        {organize && (
                          <>
                            <button
                              className="secondary"
                              aria-label={"Monter " + r.name}
                              disabled={
                                !canMove(
                                  r.id,
                                  arr.map((x) => x.id),
                                  -1,
                                )
                              }
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
                              aria-label={"Descendre " + r.name}
                              disabled={
                                !canMove(
                                  r.id,
                                  arr.map((x) => x.id),
                                  1,
                                )
                              }
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
                  <summary>Affiner · pour qui, budget, priorité</summary>
                  <div className="filter-grid">
                    <label>
                      Pour qui
                      <select
                        value={person}
                        onChange={(e) => setPerson(e.target.value)}
                      >
                        <option value="">Tout le monde</option>
                        {data.recipients
                          .filter((r) => !r.deleted_at || view === "archives")
                          .map((r) => (
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
                  <img
                    className="placeholder-mark"
                    src="/brand-mark.svg?v=3"
                    alt=""
                  />
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
                            onClick={(event) => {
                              if (
                                (event.target as HTMLElement).closest(
                                  "button,a,input,label,select,textarea,summary",
                                )
                              )
                                return;
                              setReuse(false);
                              setForm(p);
                            }}
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
                                <img
                                  className="placeholder-mark"
                                  src="/brand-mark.svg?v=3"
                                  alt=""
                                />
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
                                    (r) =>
                                      r.id === p.recipient_id &&
                                      (!r.deleted_at || !!p.archived_at),
                                  )?.name || "À classer"}
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
                                  onClick={() => setShareProposal(p)}
                                >
                                  Partage rapide
                                </button>
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
                                        void (async () => {
                                          setBusy(true);
                                          try {
                                            const result =
                                              await actions.resetGift(p.id);
                                            if (!result.ok) {
                                              setNotice(result.error);
                                              return;
                                            }
                                            refresh();
                                            setNotice(
                                              result.data?.emailConfigured
                                                ? "Réservation annulée, cadeau disponible. Notification par email préparée."
                                                : "Réservation annulée, cadeau disponible. Notification conservée en attente : le service d’emails doit être configuré.",
                                            );
                                          } finally {
                                            setBusy(false);
                                          }
                                        })();
                                    }}
                                  >
                                    Déréserver cette idée
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
            data={{
              ...data,
              profile: { ...data.profile, preferences: { ...prefs, order } },
            }}
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
          <div className="draft-summary">
            {draftInfo?.image && (
              <img src={draftInfo.image} alt="Illustration du brouillon" />
            )}
            <div>
              <strong>{draftInfo?.title}</strong>
              {draftInfo?.url && <p className="draft-url">{draftInfo.url}</p>}
            </div>
          </div>
          <p>
            Reprenez cette idée ou écartez-la avant d’en commencer une autre.
          </p>
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
      {shareProposal && (
        <Modal title="Partage rapide" close={() => setShareProposal(null)}>
          <QuickShare
            data={data}
            proposal={shareProposal}
            idea={data.ideas.find((i) => i.id === shareProposal.idea_id)}
          />
        </Modal>
      )}
      {modal === "editPerson" && (
        <Modal
          title="Modifier la personne"
          message={notice}
          close={() => setModal("")}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const r = await actions.renameRecipient(
                  editingPerson,
                  personName,
                );
                if (!r.ok) {
                  setNotice(r.error);
                  return;
                }
                done("Nom modifié");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Nom de la personne
              <input
                required
                maxLength={100}
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
              />
            </label>
            <button disabled={busy}>Enregistrer le nom</button>
          </form>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setArchivePersonIdeas(false);
              setModal("deletePerson");
            }}
          >
            Supprimer cette personne
          </button>
        </Modal>
      )}
      {modal === "deletePerson" && (
        <Modal
          title={"Supprimer " + personName + " ?"}
          message={notice}
          close={() => setModal("")}
        >
          <p>
            Les idées confidentielles de l’autre gestionnaire ne seront jamais
            modifiées. Elles resteront dans son carnet.
          </p>
          <label className="check">
            <input
              type="radio"
              name="personRemoval"
              checked={!archivePersonIdeas}
              onChange={() => setArchivePersonIdeas(false)}
            />
            Conserver les idées dans À classer
          </label>
          <label className="check">
            <input
              type="radio"
              name="personRemoval"
              checked={archivePersonIdeas}
              onChange={() => setArchivePersonIdeas(true)}
            />
            Retirer les idées du carnet et les conserver aux archives
          </label>
          <p>
            Les réservations concernées seront annulées et les invités prévenus
            par email si l’envoi est configuré.
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await actions.removeRecipient(
                  editingPerson,
                  archivePersonIdeas,
                );
                if (!r.ok) {
                  setNotice(r.error);
                  return;
                }
                navigate("people");
                done("Personne supprimée, idées conservées");
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmer la suppression
          </button>
        </Modal>
      )}
      {modal === "personColor" && (
        <Modal
          message={notice}
          title={
            "Couleur de " +
            (data.recipients.find((r) => r.id === colorPerson)?.name ||
              "la personne")
          }
          close={() => setModal("")}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const result = await actions.updateRecipientColor(
                  colorPerson,
                  personColor,
                );
                if (!result.ok) {
                  setNotice(result.error);
                  return;
                }
                setModal("");
                refresh();
                setNotice("Couleur enregistrée pour vous deux");
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>Cette couleur est commune à Alexandre et Elise.</p>
            <ColorPicker value={personColor} change={setPersonColor} />
            <button disabled={busy}>Enregistrer la couleur</button>
          </form>
        </Modal>
      )}
      {modal === "person" && (
        <Modal
          message={notice}
          title="Ajouter une personne"
          close={() => setModal("")}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const r = await actions.createRecipient(
                String(f.get("name")),
                personColor,
              );
              if (!r.ok) {
                setNotice(r.error);
                return;
              }
              done();
            }}
          >
            <label>
              Nom
              <input name="name" required maxLength={100} />
            </label>
            <ColorPicker value={personColor} change={setPersonColor} />
            <button>Créer la personne</button>
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
      {modal === "sharedWith" && currentList && (
        <Modal title="Partagé avec ?" close={() => setModal("")}>
          <ListShares list={currentList} data={data} />
        </Modal>
      )}
      {modal === "listHistory" && currentList && (
        <Modal
          title={"Historique · " + currentList.name}
          close={() => setModal("")}
        >
          <p>
            Les changements de cette liste et de ses idées, du plus récent au
            plus ancien.
          </p>
          <ActivityLog
            entries={listHistory(data, currentList.id)}
            data={data}
          />
          <small>
            Le suivi détaillé des listes commence avec cette mise à jour. Les
            événements plus anciens déjà enregistrés sont conservés ; leur
            rattachement utilise les listes connues à cette date.
          </small>
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
              const message = `Bonjour ${name}, je t’invite à voir la liste « ${currentList.name} » sur La Hotte Humbert ✨ ${shareLink(currentList)}`;
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
                  <option value="person">Ajouter une personne</option>
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
                Pour qui ?
                <select name="recipient">
                  {data.recipients
                    .filter((r) => !r.deleted_at)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </label>
              <small>
                Commun E&A remplace les autres personnes possibles. Les
                attributions existantes sont préservées ; une modification
                incompatible est refusée.
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
          <section className="gmail-settings">
            <h3>Envoi depuis mon compte Gmail</h3>
            <p>
              Les partages et alertes d’ajout partent de votre Gmail. Les
              confirmations de réservation, annulations et notifications
              automatiques partent du Gmail d’Alex. Les emails en attente seront
              réessayés après la connexion.
            </p>
            <p>
              {data.mailbox
                ? "Compte connecté : " + data.mailbox.email
                : "Aucun compte Gmail connecté."}
            </p>
            <a
              className="secondary guest-preview-link"
              href="/api/gmail/connect"
            >
              {data.mailbox ? "Reconnecter Gmail" : "Connecter mon Gmail"}
            </a>
            {!data.gmailConfigured && (
              <p className="notice">
                La configuration Google de l’application doit être terminée
                avant la première connexion.
              </p>
            )}
            {data.mailbox && (
              <button
                className="secondary"
                onClick={async () => {
                  const r = await actions.disconnectGmail();
                  if (r.ok) {
                    refresh();
                    setNotice("Gmail déconnecté");
                  } else setNotice(r.error);
                }}
              >
                Déconnecter Gmail
              </button>
            )}
            <button
              className="secondary"
              onClick={async () => {
                const r = await actions.retryMyEmails();
                setNotice(r.ok ? r.notice || "Réessai terminé" : r.error);
              }}
            >
              Réessayer les emails en attente
            </button>
          </section>

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
        <img
          className="cover-preview"
          src={url}
          alt="Couverture choisie"
          onError={() =>
            setError(
              "Cette image ne peut pas être affichée. Vérifiez son URL ou importez une photo.",
            )
          }
        />
      )}
      <ImageInput
        value={image ?? ""}
        change={(path, preview) => {
          setImage(path || null);
          setUrl(preview);
        }}
        busy={busy}
        setBusy={setBusy}
        error={setError}
      />
      {error && <p role="alert">{error}</p>}
      <button disabled={busy}>Enregistrer la liste</button>
    </form>
  );
}
