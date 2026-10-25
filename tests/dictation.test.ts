import { afterEach, expect, it, vi } from "vitest";
import {
  createDictation,
  type Recognition,
  type SpeechResult,
} from "../src/lib/dictation";
class Fake implements Recognition {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: Recognition["onresult"] = null;
  onerror: Recognition["onerror"] = null;
  onend: Recognition["onend"] = null;
  start = vi.fn();
  abort = vi.fn();
  stop = vi.fn(() => this.onend?.());
  emit(text: string, final = true, confidence = 0.95) {
    this.onresult?.({
      results: [{ isFinal: final, 0: { transcript: text, confidence } }],
    });
  }
}
function setup() {
  vi.useFakeTimers();
  const sessions: Fake[] = [],
    onFinish = vi.fn(),
    onText = vi.fn(),
    onError = vi.fn();
  const c = createDictation({
    create: () => {
      const r = new Fake();
      sessions.push(r);
      return r;
    },
    onFinish,
    onText,
    onError,
  });
  c.start();
  return { c, sessions, onFinish, onText, onError };
}
afterEach(() => vi.useRealTimers());
it("ne termine jamais sur une pause et conserve plusieurs cycles de dictée", () => {
  const { c, sessions, onFinish, onText } = setup();
  expect(sessions[0].continuous).toBe(true);
  sessions[0].emit("Un atelier de céramique");
  sessions[0].onend?.();
  expect(onFinish).not.toHaveBeenCalled();
  vi.advanceTimersByTime(10000);
  sessions[1].emit("pour Élise");
  sessions[1].onend?.();
  vi.advanceTimersByTime(10000);
  sessions[2].emit("dans la liste Noël à 60 euros");
  expect(onFinish).not.toHaveBeenCalled();
  expect(onText).toHaveBeenLastCalledWith(
    "Un atelier de céramique pour Élise dans la liste Noël à 60 euros",
  );
  c.finish();
  c.finish();
  expect(onFinish).toHaveBeenCalledExactlyOnceWith(
    "Un atelier de céramique pour Élise dans la liste Noël à 60 euros",
    false,
  );
  vi.advanceTimersByTime(10000);
  expect(sessions).toHaveLength(3);
});
it("gère les mises à jour cumulatives sans dupliquer les fragments", () => {
  const { c, sessions, onFinish } = setup();
  const a: SpeechResult = {
    isFinal: true,
    0: { transcript: "Un livre", confidence: 0.95 },
  };
  sessions[0].onresult?.({ results: [a] });
  sessions[0].onresult?.({
    results: [
      a,
      { isFinal: true, 0: { transcript: "pour Alex", confidence: 0.95 } },
    ],
  });
  c.finish();
  expect(onFinish).toHaveBeenCalledExactlyOnceWith("Un livre pour Alex", false);
});
it("n’interrompt pas la dictée sur no-speech et sait terminer entre deux cycles", () => {
  const { c, sessions, onFinish, onError } = setup();
  sessions[0].emit("Un livre");
  sessions[0].onerror?.({ error: "no-speech" });
  sessions[0].onend?.();
  expect(onError).not.toHaveBeenCalled();
  expect(onFinish).not.toHaveBeenCalled();
  c.finish();
  expect(onFinish).toHaveBeenCalledExactlyOnceWith("Un livre", false);
  vi.advanceTimersByTime(1000);
  expect(sessions).toHaveLength(1);
});
it("attend les résultats finaux après Terminer et préserve un texte provisoire si le navigateur ne répond plus", () => {
  const { c, sessions, onFinish } = setup();
  sessions[0].stop.mockImplementation(() => {});
  sessions[0].emit("Un liv", false);
  c.finish();
  expect(onFinish).not.toHaveBeenCalled();
  sessions[0].emit("Un livre", true);
  sessions[0].onend?.();
  expect(onFinish).toHaveBeenCalledExactlyOnceWith("Un livre", false);
  const s = setup();
  s.sessions[0].stop.mockImplementation(() => {});
  s.sessions[0].emit("Une lampe", false);
  s.c.finish();
  vi.advanceTimersByTime(1800);
  expect(s.onFinish).toHaveBeenCalledExactlyOnceWith("Une lampe", true);
});
it("préserve le texte après une erreur et ne valide rien avant une fin explicite", () => {
  const { c, sessions, onFinish, onError } = setup();
  sessions[0].emit("Un livre");
  sessions[0].onerror?.({ error: "network" });
  expect(onError).toHaveBeenCalledWith("network");
  expect(onFinish).not.toHaveBeenCalled();
  c.start();
  sessions[1].emit("pour Alex");
  c.finish();
  expect(onFinish).toHaveBeenCalledExactlyOnceWith("Un livre pour Alex", false);
});
it("annuler arrête le micro et ignore tous les événements tardifs", () => {
  const { c, sessions, onFinish } = setup();
  sessions[0].emit("Un livre");
  const late = sessions[0].onend;
  c.cancel();
  late?.();
  c.finish();
  vi.advanceTimersByTime(5000);
  expect(onFinish).not.toHaveBeenCalled();
  expect(sessions[0].abort).toHaveBeenCalledTimes(1);
  expect(sessions).toHaveLength(1);
});
