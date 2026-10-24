import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  upsert: vi.fn(),
  configured: vi.fn(),
  seal: vi.fn(),
  drain: vi.fn(),
}));
vi.mock("../src/lib/supabase/server", () => ({
  requireAdmin: mocks.requireAdmin,
  serviceClient: () => ({ from: () => ({ upsert: mocks.upsert }) }),
}));
vi.mock("../src/lib/gmail", () => ({
  gmailConfigured: mocks.configured,
  sealToken: mocks.seal,
}));
vi.mock("../src/lib/mail", () => ({ drainEmails: mocks.drain }));
import { GET } from "../src/app/api/gmail/callback/route";
beforeEach(() => {
  vi.stubEnv("APP_URL", "https://app.example.test");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  mocks.requireAdmin.mockResolvedValue({
    user: { id: "test-admin" },
    profile: { email: "admin@example.test" },
  });
  mocks.configured.mockReturnValue(true);
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.seal.mockReturnValue("encrypted-refresh");
  mocks.drain.mockResolvedValue({ sent: 0 });
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function request(state = "nonce") {
  return new NextRequest(
    "https://app.example.test/api/gmail/callback?state=" +
      state +
      "&code=test-code",
    { headers: { Cookie: "kad-gmail-state=test-admin.nonce" } },
  );
}
it("refuse un état OAuth invalide avant tout échange de code", async () => {
  const r = await GET(request("wrong"));
  expect(r.headers.get("location")).toContain("mail=invalid_state");
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it("refuse la connexion du compte Gmail d’un autre utilisateur", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      Response.json({
        access_token: "test-access",
        refresh_token: "test-refresh",
        scope: "https://www.googleapis.com/auth/gmail.send",
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ email: "other@example.test", email_verified: true }),
    );
  const r = await GET(request());
  expect(r.headers.get("location")).toContain("mail=wrong_account");
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it("stocke uniquement le jeton chiffré du compte administrateur vérifié", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      Response.json({
        access_token: "test-access",
        refresh_token: "test-refresh",
        scope: "https://www.googleapis.com/auth/gmail.send",
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ email: "admin@example.test", email_verified: true }),
    );
  const r = await GET(request());
  expect(r.headers.get("location")).toContain("mail=connected");
  expect(mocks.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      profile_id: "test-admin",
      email: "admin@example.test",
      refresh_token: "encrypted-refresh",
    }),
  );
});

it("préserve le domaine public derrière le proxy lors de la connexion Google", async () => {
  const { GET: connect } = await import("../src/app/api/gmail/connect/route");
  const r = await connect(
    new Request("http://0.0.0.0:3000/api/gmail/connect", {
      headers: { host: "app.example.test" },
    }),
  );
  const location = new URL(r.headers.get("location")!);
  expect(location.origin).toBe("https://accounts.google.com");
  expect(location.searchParams.get("redirect_uri")).toBe(
    "https://app.example.test/api/gmail/callback",
  );
  expect(r.headers.get("set-cookie")).toContain("HttpOnly");
  expect(location.href).not.toContain("test-secret");
});
it("retourne vers le site courant si Google n’est pas configuré", async () => {
  mocks.configured.mockReturnValue(false);
  const { GET: connect } = await import("../src/app/api/gmail/connect/route");
  const r = await connect(
    new Request("http://0.0.0.0:3000/api/gmail/connect", {
      headers: { host: "app.example.test" },
    }),
  );
  expect(r.headers.get("location")).toBe("/?mail=not_configured");
});
it("exige une session administrateur avant de lancer OAuth", async () => {
  mocks.requireAdmin.mockRejectedValueOnce(Error("not authorized"));
  const { GET: connect } = await import("../src/app/api/gmail/connect/route");
  const r = await connect(
    new Request("https://app.example.test/api/gmail/connect"),
  );
  expect(r.headers.get("location")).toBe("/login");
  expect(r.headers.get("set-cookie")).toBe(null);
});
