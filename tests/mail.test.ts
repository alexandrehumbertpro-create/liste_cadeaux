import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase/server", () => ({ serviceClient: vi.fn() }));
vi.mock("../src/lib/gmail", () => ({
  gmailConfigured: vi.fn(),
  sendGmail: vi.fn(),
}));
import { serviceClient } from "../src/lib/supabase/server";
import { gmailConfigured, sendGmail } from "../src/lib/gmail";
import { drainEmails } from "../src/lib/mail";

const alex = "alex-profile";
let connected: boolean;
let profile: { id: string; email: string } | null;
let claims: Record<string, any[]>;
let updates: { id: string; patch: any }[];
let rpc: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "https://gifts.example.test");
  connected = true;
  profile = { id: alex, email: "alex@example.test" };
  claims = { gmail: [], resend: [] };
  updates = [];
  vi.mocked(gmailConfigured).mockReturnValue(true);
  vi.mocked(sendGmail).mockResolvedValue(undefined);
  rpc = vi.fn(async (_name: string, { provider }: { provider: string }) => ({
    data: claims[provider],
  }));
  vi.mocked(serviceClient).mockReturnValue({
    rpc,
    from(table: string) {
      const query: any = {
        select: () => query,
        single: async () => ({
          data: {
            id: "idea",
            title: "Lampe",
            visibility: "public",
            owner_id: "elise-profile",
            price_min: null,
          },
        }),
        then: (resolve: (result: any) => void) => resolve({ data: [] }),
        ilike: (_column: string, name: string) => {
          expect(name).toBe("Alex");
          return query;
        },
        eq: (_column: string, value: string) => {
          if (table === "admin_mailboxes") expect(value).toBe(alex);
          return query;
        },
        maybeSingle: async () => ({
          data:
            table === "profiles"
              ? profile
              : connected
                ? { email: "alex@example.test" }
                : null,
        }),
        update: (patch: any) => ({
          eq: async (_column: string, id: string) => {
            updates.push({ id, patch });
          },
        }),
      };
      return query;
    },
  } as any);
});
afterEach(() => vi.unstubAllEnvs());

describe("Notifications automatiques par Gmail", () => {
  it("envoie confirmation, notification admin, modification et annulation depuis Alex sans Resend", async () => {
    claims.resend = [
      {
        id: "confirmation",
        kind: "reserved",
        email: "guest@example.test",
        payload: {
          title: "Lampe",
          accessToken: "guest-secret",
          recipient: "Elise",
          specifications: "Bleu",
          priceMin: 40,
          priceMax: 60,
        },
      },
      {
        id: "admin",
        kind: "admin_reserved",
        email: "elise@example.test",
        payload: { title: "Lampe" },
      },
      {
        id: "change",
        kind: "changed",
        email: "guest@example.test",
        payload: { title: "Lampe", accessToken: "guest-secret" },
      },
      {
        id: "cancel",
        kind: "cancelled",
        email: "guest@example.test",
        payload: { accessToken: "guest-secret" },
      },
    ];
    const result = await drainEmails();
    expect(result.sent).toBe(4);
    expect(result.transactionalConfigured).toBe(true);
    expect(sendGmail).toHaveBeenCalledTimes(4);
    for (const args of vi.mocked(sendGmail).mock.calls)
      expect(args[0]).toBe(alex);
    const confirmation = vi.mocked(sendGmail).mock.calls[0];
    expect(confirmation[3]).toContain(
      "https://gifts.example.test/reservation/guest-secret",
    );
    expect(confirmation[3]).toContain("Bleu");
    const admin = vi.mocked(sendGmail).mock.calls[1];
    expect(admin[3]).toContain("Le nom du réservant reste masqué");
    expect(admin[3]).not.toContain("guest-secret");
    expect(admin[3]).not.toContain("/reservation/");
    expect(updates.every((u) => u.patch.status === "sent")).toBe(true);
  });
  it("conserve le Gmail personnel d’Elise pour son partage rapide", async () => {
    claims.gmail = [
      {
        id: "share",
        kind: "quick_share",
        email: "guest@example.test",
        payload: { ideaId: "idea", senderProfileId: "elise-profile" },
      },
    ];
    await drainEmails();
    expect(sendGmail).toHaveBeenCalledWith(
      "elise-profile",
      "guest@example.test",
      expect.any(String),
      expect.any(String),
      undefined,
    );
  });
  it("ne prélève aucune notification automatique si Alex n’a pas connecté Gmail", async () => {
    connected = false;
    const result = await drainEmails();
    expect(result.transactionalConfigured).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("claim_email_jobs_for_provider", {
      provider: "gmail",
    });
    expect(sendGmail).not.toHaveBeenCalled();
  });
  it("ne choisit pas le Gmail d’un autre administrateur si le profil Alex est absent", async () => {
    profile = null;
    const result = await drainEmails();
    expect(result.transactionalConfigured).toBe(false);
    expect(rpc).not.toHaveBeenCalledWith(expect.anything(), {
      provider: "resend",
    });
  });
  it("conserve les messages en attente après un refus Gmail sans révéler la réponse du fournisseur", async () => {
    claims.resend = [
      {
        id: "failed",
        kind: "cancelled",
        email: "guest@example.test",
        payload: { accessToken: "secret" },
      },
    ];
    vi.mocked(sendGmail).mockRejectedValue(Error("private provider response"));
    const result = await drainEmails();
    expect(result.sent).toBe(0);
    expect(updates[0].patch.status).toBe("pending");
    expect(updates[0].patch.last_error).toContain("Gmail d’Alex");
    expect(updates[0].patch.last_error).not.toContain(
      "private provider response",
    );
  });
  it("ne traite aucun email quand Google n’est pas configuré", async () => {
    vi.mocked(gmailConfigured).mockReturnValue(false);
    expect((await drainEmails()).configured).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(sendGmail).not.toHaveBeenCalled();
  });
});
