import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase/server", () => ({ serviceClient: vi.fn() }));
import { gmailMessage, sealToken, openToken } from "../src/lib/gmail";
import { ideaShareText } from "../src/lib/idea-share";
import type { Idea, Proposal } from "../src/lib/types";
beforeEach(() =>
  vi.stubEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "test-only-root-key-not-a-real-credential",
  ),
);
afterEach(() => vi.unstubAllEnvs());
describe("Protection des connexions Gmail", () => {
  it("chiffre chaque jeton avec un aléa et refuse toute altération", () => {
    const a = sealToken("test-refresh"),
      b = sealToken("test-refresh");
    expect(a).not.toBe(b);
    expect(a).not.toContain("test-refresh");
    expect(openToken(a)).toBe("test-refresh");
    const parts = a.split(".");
    const bytes = Buffer.from(parts[3], "base64url");
    bytes[0] ^= 1;
    parts[3] = bytes.toString("base64url");
    expect(() => openToken(parts.join("."))).toThrow();
  });
  it("conserve l’expéditeur et encode les caractères français et les pièces jointes", () => {
    const message = gmailMessage(
      "sender@example.test",
      "guest@example.test",
      "Une idée 🎁",
      "<p>Un cadeau</p>",
      { content: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" },
    );
    expect(message).toContain("From: sender@example.test\r\n");
    expect(message).toContain("To: guest@example.test\r\n");
    expect(message).toContain("Content-ID: <gift-image>");
    expect(message).toContain("multipart/related");
    expect(message).not.toContain("Subject: Une idée");
    expect(() =>
      gmailMessage(
        "sender@example.test",
        "guest@example.test\r\nBcc: other@example.test",
        "Idée",
        "html",
      ),
    ).toThrow();
  });
});
it("le partage rapide ne contient jamais la note de gestion ni le nom du réservant", () => {
  const idea = {
    title: "Lampe",
    description: "Une belle lumière",
    specifications: "Bleu",
    price_min: 40,
    price_max: 60,
    url: "https://shop.example/lampe",
    private_note: "SECRET",
  } as Idea;
  const proposal = {
    recipient_id: "alex",
    priority: 1,
    reserved: true,
  } as Proposal;
  const text = ideaShareText(idea, proposal, [
    { id: "alex", name: "Alex", is_common: false },
  ]);
  expect(text).toContain("Pour : Alex");
  expect(text).toContain("Idée prioritaire");
  expect(text).toContain("40–60 €");
  expect(text).not.toContain("SECRET");
});

it("adresse un seul message aux deux administrateurs et sécurise le Reply-To", () => {
  const message = gmailMessage(
    "alex@example.test",
    ["alex@example.test", "elise@example.test"],
    "Question",
    "html",
    undefined,
    "guest@example.test",
  );
  expect(message).toContain("To: alex@example.test, elise@example.test\r\n");
  expect(message).toContain("Reply-To: guest@example.test\r\n");
  expect(() =>
    gmailMessage(
      "alex@example.test",
      ["elise@example.test"],
      "Question",
      "html",
      undefined,
      "guest@example.test\r\nBcc: intrus@example.test",
    ),
  ).toThrow();
});
