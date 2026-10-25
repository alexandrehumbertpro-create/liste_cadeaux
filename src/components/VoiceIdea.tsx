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
import type { Recipient } from "@/lib/types";
import { recipientStyle } from "@/lib/recipient-colors";
import Modal from "./Modal";

type SpeechResult = {
  isFinal: boolean;
  0: { transcript: string; confidence: number };
};
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
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
  defaultRecipientId,
  defaultList,
  close,
  saved,
}: {
  recipients: Recipient[];
  defaultRecipientId?: string;
  defaultList?: { id: string; name: string };
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
  const recognition = useRef<Recognition | null>(null);
  const alive = useRef(false);
  const saving = useRef(false);
  const phaseRef = useRef<Phase>("listening");
  phaseRef.current = phase;
  const people = recipients.filter((r) => !r.deleted_at);

  async function store(idea: Draft) {
    if (saving.current || !alive.current) return;
    const payload = voiceGiftInput(idea, defaultList?.id);
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
    let disposed = false;
    let failed = false;
    let handled = false;
    let finalText = "";
    let heard = "";
    let doubtful = false;
    const Speech =
      (window as SpeechWindow).SpeechRecognition ??
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!Speech) {
      setPhase("unavailable");
      return () => {
        alive.current = false;
      };
    }
    const rec = new Speech();
    recognition.current = rec;
    rec.lang = "fr-FR";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    setPhase("listening");
    setError("");
    setTranscript("");
    rec.onresult = ({ results }) => {
      if (disposed || handled || failed) return;
      const all = Array.from(results);
      finalText = all
        .filter((r) => r.isFinal)
        .map((r) => r[0].transcript)
        .join(" ")
        .trim();
      heard = all
        .map((r) => r[0].transcript)
        .join(" ")
        .trim();
      doubtful = all.some(
        (r) => r.isFinal && r[0].confidence > 0 && r[0].confidence < 0.65,
      );
      setTranscript(heard);
    };
    rec.onerror = ({ error: code }) => {
      if (disposed || handled) return;
      failed = true;
      const messages: Record<string, string> = {
        "not-allowed":
          "Autorisez le microphone dans les paramètres de votre navigateur, puis réessayez.",
        "service-not-allowed":
          "La dictée est bloquée par ce navigateur. Essayez Safari sur iPhone ou Chrome sur Android.",
        "audio-capture":
          "Aucun microphone disponible. Vérifiez qu’il n’est pas utilisé par une autre application.",
        "no-speech":
          "Je n’ai rien entendu. Réessayez en parlant près du microphone.",
        network:
          "Le service de dictée est indisponible. Vérifiez votre connexion et réessayez.",
        aborted: "Dictée interrompue. Aucune idée n’a été ajoutée.",
      };
      setError(
        messages[code] ??
          "La dictée n’a pas abouti. Aucune idée n’a été ajoutée.",
      );
      setPhase("error");
    };
    rec.onend = () => {
      if (disposed || handled || failed) return;
      handled = true;
      const text = finalText || heard;
      if (!text) {
        setPhase("error");
        setError("Je n’ai rien entendu. Aucune idée n’a été ajoutée.");
        return;
      }
      setTranscript(text);
      const parsed = parseVoiceIdea(text, recipients, defaultRecipientId);
      if (doubtful || !finalText)
        parsed.questions.unshift(
          "Ai-je bien entendu ? Vérifiez l’idée ou dictez-la à nouveau.",
        );
      setDraft(parsed.idea);
      setQuestions(parsed.questions);
      if (parsed.questions.length) setPhase("review");
      else void store(parsed.idea);
    };
    try {
      rec.start();
    } catch {
      setPhase("error");
      setError(
        "Impossible de démarrer la dictée. Vérifiez l’autorisation du microphone et réessayez.",
      );
    }
    return () => {
      disposed = true;
      alive.current = false;
      rec.onresult = rec.onerror = rec.onend = null;
      rec.abort();
      recognition.current = null;
    };
    // A recognition session must not restart when a background refresh updates people.
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
          Public par défaut · Sans personne indiquée :{" "}
          {people.find((p) => p.id === defaultRecipientId)?.name ?? "À classer"}
          .
        </p>
        {phase === "listening" && (
          <>
            <p role="status">
              <Mic size={22} aria-hidden="true" /> Je vous écoute…
            </p>
            <p className="voice-transcript" aria-live="polite">
              {transcript ||
                "Parlez, puis marquez une pause pour ajouter l’idée."}
            </p>
            <button type="button" onClick={() => recognition.current?.stop()}>
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
                  value={draft.priority}
                  onChange={(e) =>
                    setDraft({ ...draft, priority: Number(e.target.value) })
                  }
                >
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
                  value={draft.visibility}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      visibility: e.target.value as Draft["visibility"],
                    })
                  }
                >
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
              Pour :{" "}
              {draft.candidates.length
                ? draft.candidates
                    .map((id) => people.find((p) => p.id === id)?.name)
                    .join(", ")
                : "À classer"}
              <br />
              {draft.priceMin !== null && (
                <>{formatPrice(draft.priceMin, draft.priceMax)} · </>
              )}
              {priorityNames[draft.priority]}
              <br />
              Visibilité :{" "}
              {
                {
                  public: "Public",
                  household: "Nous deux",
                  private: "Moi uniquement",
                }[draft.visibility]
              }
              {defaultList && (
                <>
                  <br />
                  Liste : {defaultList.name}
                </>
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
            <button type="button" onClick={retry}>
              🎤 Réessayer
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
