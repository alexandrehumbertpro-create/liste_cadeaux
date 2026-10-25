export type SpeechResult = {
  isFinal: boolean;
  0: { transcript: string; confidence: number };
};
export type Recognition = {
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

// Browser silence/time limits end a recognition cycle, never the user's dictation.
// Only finish() is allowed to deliver the transcript for creation of an idea.
export function createDictation({
  create,
  onText,
  onError,
  onFinish,
}: {
  create: () => Recognition;
  onText: (text: string) => void;
  onError: (code: string) => void;
  onFinish: (text: string, doubtful: boolean) => void;
}) {
  let active: Recognition | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finishTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false,
    finishing = false,
    delivered = false,
    doubtful = false;
  let completed = "",
    final = "",
    heard = "";
  const text = () =>
    [completed, heard || final].filter(Boolean).join(" ").trim();
  function detach(rec: Recognition) {
    rec.onend = rec.onerror = rec.onresult = null;
  }
  function retain() {
    if (heard && heard !== final) doubtful = true;
    completed = text();
    final = heard = "";
    onText(completed);
  }
  function deliver() {
    if (closed || delivered) return;
    delivered = true;
    clearTimeout(timer);
    clearTimeout(finishTimer);
    if (active) {
      detach(active);
      active.abort();
      active = null;
    }
    onFinish(text(), doubtful || Boolean(heard && heard !== final));
  }
  function start() {
    if (closed || finishing || delivered || active) return;
    clearTimeout(timer);
    const rec = create();
    active = rec;
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = ({ results }) => {
      if (closed || delivered || active !== rec) return;
      const all = Array.from(results);
      final = all
        .filter((r) => r.isFinal)
        .map((r) => r[0].transcript)
        .join(" ")
        .trim();
      heard = all
        .map((r) => r[0].transcript)
        .join(" ")
        .trim();
      doubtful ||= all.some(
        (r) => r.isFinal && r[0].confidence > 0 && r[0].confidence < 0.65,
      );
      onText(text());
    };
    rec.onerror = ({ error }) => {
      if (closed || delivered || active !== rec) return;
      // A silent interval is normal; onend will restart listening.
      if (error === "no-speech") return;
      detach(rec);
      active = null;
      rec.abort();
      retain();
      clearTimeout(finishTimer);
      finishing = false;
      onError(error);
    };
    rec.onend = () => {
      if (closed || delivered || active !== rec) return;
      detach(rec);
      active = null;
      retain();
      if (finishing) deliver();
      else timer = setTimeout(start, 200);
    };
    try {
      rec.start();
    } catch {
      detach(rec);
      active = null;
      onError("start-failed");
    }
  }
  return {
    start,
    finish() {
      if (closed || finishing || delivered) return;
      finishing = true;
      clearTimeout(timer);
      if (!active) deliver();
      else {
        // A few browsers do not emit onend after stop. Preserve and review any
        // interim text rather than waiting forever or losing the dictated idea.
        finishTimer = setTimeout(deliver, 1800);
        try {
          active.stop();
        } catch {
          deliver();
        }
      }
    },
    cancel() {
      closed = true;
      clearTimeout(timer);
      clearTimeout(finishTimer);
      if (active) {
        detach(active);
        active.abort();
        active = null;
      }
    },
  };
}
