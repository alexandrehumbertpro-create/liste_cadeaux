import { beforeEach, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../src/lib/supabase/server", () => ({
  requireAdmin: vi.fn(),
  serverClient: vi.fn(),
  serviceClient: vi.fn(),
}));
vi.mock("../src/lib/mail", () => ({
  drainEmails: vi.fn(),
  transactionalSenderId: vi.fn(),
}));
vi.mock("../src/lib/gmail", () => ({
  gmailConfigured: vi.fn(),
  mailbox: vi.fn(),
}));
vi.mock("../src/lib/images", () => ({ signImage: vi.fn() }));
import { requireAdmin } from "../src/lib/supabase/server";
import { drainEmails } from "../src/lib/mail";
import { saveVoiceGift } from "../src/app/actions";
import { parseVoiceIdea, voiceGiftInput } from "../src/lib/voice-idea";
const rpc = vi.fn();
const input = () =>
  voiceGiftInput(parseVoiceIdea("Un atelier de céramique", []).idea);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    db: { rpc },
    user: { id: crypto.randomUUID() },
  } as never);
  rpc.mockResolvedValue({ data: crypto.randomUUID(), error: null });
});
it("exige une session administrateur avant tout ajout vocal", async () => {
  vi.mocked(requireAdmin).mockRejectedValue(
    new Error("Connectez-vous pour continuer."),
  );
  expect(await saveVoiceGift(input())).toMatchObject({
    ok: false,
    uncertain: false,
  });
  expect(rpc).not.toHaveBeenCalled();
});
it("refuse les identifiants de modification et les notifications dans le parcours vocal", async () => {
  for (const extra of [
    { ideaId: crypto.randomUUID() },
    { proposalId: crypto.randomUUID() },
    { notifyIds: [crypto.randomUUID()] },
  ])
    expect(await saveVoiceGift({ ...input(), ...extra })).toMatchObject({
      ok: false,
    });
  expect(rpc).not.toHaveBeenCalled();
});
it("crée une idée sans personne et sans liste, sans déclencher d’email", async () => {
  expect(await saveVoiceGift(input())).toMatchObject({ ok: true });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("save_gift_for_recipients", {
    data: input(),
  });
  expect(drainEmails).not.toHaveBeenCalled();
});
it("signale une issue incertaine après une interruption au lieu de répéter l’ajout", async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { code: "PGRST000", message: "Network error" },
  });
  expect(await saveVoiceGift(input())).toMatchObject({
    ok: false,
    uncertain: true,
  });
  expect(rpc).toHaveBeenCalledTimes(1);
});
