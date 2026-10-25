"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { saveVoiceGift } from "@/lib/client-actions";
import { giftInput, formatPrice } from "@/lib/validation";
import {
  parseVoiceIdea,
  voiceGiftInput,
  type VoiceIdea as Draft,
} from "@/lib/voice-idea";
import type { Recipient, GiftList } from "@/lib/types";
import { createDictation, type Recognition } from "@/lib/dictation";
import { recipientStyle } from "@/lib/recipient-colors";
import Modal from "./Modal";

type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
type Phase =
  | "listening"
  | "review"
  | "saving"
  | "saved"
  | "error"
  | "unavailable"
  | "uncertain";
const priorityNames = ["Coup de cœur", "Idée prioritaire", "Idée"];

export default function VoiceIdea({
  recipients,
  lists,
  close,
  saved,
}: {
  recipients: Recipient[];
  lists: GiftList[];
  close: () => void;
  saved: (notice: string) => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("listening");
  const [transcript, setTranscript] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [session, setSession] = useState(0);
  const dictation = useRef<ReturnType<typeof createDictation> | null>(null);
  const alive = useRef(false);
  const saving = useRef(false);
  const phaseRef = useRef<Phase>("listening");
  phaseRef.current = phase;
  const people = recipients.filter((r) => !r.deleted_at);

  async function store(idea: Draft) {
    if (saving.current || !alive.current) return;
    const payload = voiceGiftInput(idea);
    const checked = giftInput.safeParse(payload);
    const invalidCommon =
      idea.candidates.length > 1 &&
      people.some((p) => p.is_common && idea.candidates.includes(p.id));
    if (!checked.success || invalidCommon) {
      setError(
        invalidCommon
          ? "Choisissez Commun E&A seul, ou les personnes séparément."
          : checked.error!.issues[0].message,
      );
      setPhase("review");
      return;
    }
    saving.current = true;
    setDraft(idea);
    setPhase("saving");
    try {
      const result = await saveVoiceGift(payload);
      if (!alive.current) {
        if (result.ok) router.refresh();
        return;
      }
      if (result.ok) {
        setPhase("saved");
        saved(`« ${idea.title} » a été ajoutée.`);
        router.refresh();
      } else {
        setError(
          result.uncertain
            ? "La connexion a été interrompue : vérifiez dans Mes idées si l’ajout a eu lieu avant de recommencer."
            : result.error,
        );
        setPhase(result.uncertain ? "uncertain" : "review");
        if (!result.uncertain) saving.current = false;
      }
    } catch {
      if (alive.current) {
        setPhase("uncertain");
        setError(
          "La connexion a été interrompue : vérifiez dans Mes idées si l’ajout a eu lieu avant de recommencer.",
        );
      }
    }
  }

  useEffect(() => {
    alive.current = true;
    const Speech =
      (window as SpeechWindow).SpeechRecognition ??
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!Speech) {
      setPhase("unavailable");
      return () => {
        alive.current = false;
      };
    }
    setPhase("listening");
    setError("");
    setTranscript("");
    const capture = createDictation({
      create: () => new Speech(),
      onText: setTranscript,
      onError: (code) => {
        const messages: Record<string, string> = {
          "not-allowed":
            "Autorisez le microphone dans les paramètres de votre navigateur, puis reprenez la dictée.",
          "service-not-allowed":
            "La dictée est bloquée par ce navigateur. Essayez Safari sur iPhone ou Chrome sur Android.",
          "audio-capture":
            "Aucun microphone disponible. Vérifiez qu’il n’est pas utilisé par une autre application.",
          network:
            "Le service de dictée est indisponible. Votre texte est conservé ; vérifiez votre connexion puis reprenez.",
          aborted:
            "L’écoute a été interrompue. Votre texte est conservé ; vous pouvez reprendre.",
        };
        setError(
          messages[code] ??
            "L’écoute s’est interrompue. Votre texte est conservé ; touchez Reprendre la dictée.",
        );
        setPhase("error");
      },
      onFinish: (text, doubtful) => {
        if (!text) {
          setPhase("error");
          setError("Je n’ai rien entendu. Aucune idée n’a été ajoutée.");
          return;
        }
        const parsed = parseVoiceIdea(text, recipients, lists);
        if (doubtful)
          parsed.questions.unshift(
            "Ai-je bien entendu ? Vérifiez l’idée ou dictez-la à nouveau.",
          );
        setDraft(parsed.idea);
        setQuestions(parsed.questions);
        if (parsed.questions.length) setPhase("review");
        else void store(parsed.idea);
      },
    });
    dictation.current = capture;
    capture.start();
    return () => {
      alive.current = false;
      capture.cancel();
      dictation.current = null;
    };
    // Background refreshes must not restart a live dictation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  function retry() {
    setDraft(null);
    setQuestions([]);
    saving.current = false;
    setSession((s) => s + 1);
  }
  function dismiss() {
    if (phaseRef.current === "saving") return;
    close();
  }
  const review = phase === "review" && draft;
  return (
    <Modal title="Dicter une idée" close={dismiss}>
      <div className="voice-idea">
        <p className="muted voice-hint">
          Une idée à la fois. Exemple : « Un atelier de céramique pour Élise à
          60 euros ».
        </p>
        <p className="muted voice-hint">
          Seuls les détails dictés sont repris. Sans personne ni liste : À
          classer. Sans visibilité précisée : Public, le réglage habituel du
          carnet.
        </p>
        {phase === "listening" && (
          <>
            <p role="status">
              <Mic size={22} aria-hidden="true" /> Je vous écoute…
            </p>
            <p className="voice-transcript" aria-live="polite">
              {transcript ||
                "Prenez votre temps. Rien ne sera ajouté avant « Terminer la dictée »."}
            </p>
            <button type="button" onClick={() => dictation.current?.finish()}>
              <Square size={16} aria-hidden="true" /> Terminer la dictée
            </button>
          </>
        )}
        {phase === "saving" && <p role="status">Enregistrement de l’idée…</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {phase === "unavailable" && (
          <p role="status">
            Ce navigateur ne propose pas la dictée intégrée. Utilisez Safari sur
            iPhone ou Chrome sur Android, ou le micro du clavier dans le
            formulaire « + Idée ».
          </p>
        )}
        {review && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              void store(draft);
            }}
          >
            <div role="status">
              {questions.map((q) => (
                <p key={q}>{q}</p>
              ))}
            </div>
            <details>
              <summary>Ce que j’ai entendu</summary>
              <p>{transcript}</p>
            </details>
            <label>
              Votre idée
              <input
                required
                maxLength={200}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <fieldset>
              <legend>Pour qui ?</legend>
              <div className="voice-people">
                <button
                  type="button"
                  className="secondary"
                  aria-pressed={!draft.candidates.length}
                  onClick={() => setDraft({ ...draft, candidates: [] })}
                >
                  À classer
                </button>
                {people.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className="secondary"
                    style={recipientStyle(p.color ?? "#e9eeff")}
                    aria-pressed={draft.candidates.includes(p.id)}
                    onClick={() => {
                      const selected = draft.candidates.includes(p.id);
                      setDraft({
                        ...draft,
                        candidates: selected
                          ? draft.candidates.filter((id) => id !== p.id)
                          : p.is_common
                            ? [p.id]
                            : [
                                ...draft.candidates.filter(
                                  (id) =>
                                    !people.find((r) => r.id === id)?.is_common,
                                ),
                                p.id,
                              ],
                      });
                    }}
                  >
                    {draft.candidates.includes(p.id) ? "✓ " : ""}
                    {p.name}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Listes</legend>
              <div className="voice-people">
                <button
                  type="button"
                  className="secondary"
                  aria-pressed={!draft.listIds.length}
                  onClick={() => setDraft({ ...draft, listIds: [] })}
                >
                  Aucune liste
                </button>
                {lists
                  .filter((l) => !l.archived_at)
                  .map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className="secondary"
                      aria-pressed={draft.listIds.includes(l.id)}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          listIds: draft.listIds.includes(l.id)
                            ? draft.listIds.filter((id) => id !== l.id)
                            : [...draft.listIds, l.id],
                        })
                      }
                    >
                      {draft.listIds.includes(l.id) ? "✓ " : ""}
                      {l.name}
                    </button>
                  ))}
              </div>
            </fieldset>
            {(
              [
                ["description", "Description"],
                ["specifications", "Précisions publiques"],
                ["privateNote", "Note privée"],
              ] as const
            )
              .filter(([key]) => draft[key])
              .map(([key, label]) => (
                <label key={key}>
                  {label}
                  <textarea
                    value={draft[key]}
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
            <div className="voice-fields">
              <label>
                Prix / budget (€)
                <input
                  type="number"
                  min="0"
                  max="999999999"
                  step="0.01"
                  value={draft.priceMin ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      priceMin:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
              {draft.priceMax !== null && (
                <label>
                  Maximum (€)
                  <input
                    type="number"
                    min={draft.priceMin ?? 0}
                    max="999999999"
                    step="0.01"
                    value={draft.priceMax}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        priceMax:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
              )}
              <label>
                Priorité
                <select
                  aria-label="Priorité"
                  value={draft.priority ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      priority:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                >
                  <option value="">Non précisée</option>
                  {priorityNames.map((p, i) => (
                    <option value={i} key={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Visibilité
                <select
                  aria-label="Visibilité"
                  value={draft.visibility ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      visibility: (e.target.value ||
                        null) as Draft["visibility"],
                    })
                  }
                >
                  <option value="">Non précisée (Public par défaut)</option>
                  <option value="public">Public</option>
                  <option value="household">Nous deux</option>
                  <option value="private">Moi uniquement</option>
                </select>
              </label>
            </div>
            <div className="row">
              <button type="submit">Ajouter cette idée</button>
              <button className="secondary" type="button" onClick={retry}>
                🎤 Redicter
              </button>
            </div>
          </form>
        )}
        {phase === "saved" && draft && (
          <div role="status">
            <h3>✓ Idée ajoutée</h3>
            <p>
              <strong>{draft.title}</strong>
            </p>
            <p>
              {draft.candidates.length > 0 && (
                <>
                  Pour :{" "}
                  {draft.candidates
                    .map((id) => people.find((p) => p.id === id)?.name)
                    .join(", ")}
                  <br />
                </>
              )}
              {draft.listIds.length > 0 && (
                <>
                  Listes :{" "}
                  {draft.listIds
                    .map((id) => lists.find((l) => l.id === id)?.name)
                    .join(", ")}
                  <br />
                </>
              )}
              {!draft.candidates.length && (
                <>
                  À classer
                  <br />
                </>
              )}
              {draft.priceMin !== null && (
                <>
                  {formatPrice(draft.priceMin, draft.priceMax)}
                  <br />
                </>
              )}
              {draft.priority !== null && (
                <>
                  {priorityNames[draft.priority]}
                  <br />
                </>
              )}
              {draft.visibility !== null && (
                <>
                  Visibilité :{" "}
                  {
                    {
                      public: "Public",
                      household: "Nous deux",
                      private: "Moi uniquement",
                    }[draft.visibility]
                  }
                  <br />
                </>
              )}
              {draft.description && (
                <>
                  Description : {draft.description}
                  <br />
                </>
              )}
              {draft.specifications && (
                <>
                  Précisions : {draft.specifications}
                  <br />
                </>
              )}
              {draft.privateNote && (
                <>
                  Note privée : {draft.privateNote}
                  <br />
                </>
              )}
              {draft.url && (
                <a href={draft.url} target="_blank" rel="noreferrer">
                  Lien produit
                </a>
              )}
            </p>
            <button type="button" onClick={close}>
              Terminé
            </button>
          </div>
        )}
        {phase === "error" && (
          <>
            <p className="voice-transcript">{transcript}</p>
            <button
              type="button"
              onClick={() => {
                if (!transcript) {
                  retry();
                  return;
                }
                setError("");
                setPhase("listening");
                dictation.current?.start();
              }}
            >
              🎤 Reprendre la dictée
            </button>
            {transcript && (
              <button
                type="button"
                className="secondary"
                onClick={() => dictation.current?.finish()}
              >
                Terminer avec ce texte
              </button>
            )}
            <button type="button" className="secondary" onClick={retry}>
              Recommencer
            </button>
          </>
        )}
        {phase === "uncertain" && (
          <>
            <p>{draft?.title}</p>
            <button
              type="button"
              onClick={() => {
                router.refresh();
                close();
              }}
            >
              Fermer et vérifier mes idées
            </button>
          </>
        )}
        <p className="muted voice-hint">
          La transcription est assurée par votre navigateur et peut utiliser son
          service en ligne. L’application ne conserve pas votre enregistrement
          audio.
        </p>
      </div>
    </Modal>
  );
}
