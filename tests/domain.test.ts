import { describe, it, expect } from "vitest";
import {
  budgetOverlap,
  giftInput,
  reservationInput,
} from "../src/lib/validation";
import { publicAddress } from "../src/lib/metadata";
describe("Filtres de budget", () => {
  it("inclut les fourchettes qui se recoupent", () => {
    expect(budgetOverlap(40, 80, null, 50)).toBe(true);
    expect(budgetOverlap(40, 80, 90, null)).toBe(false);
    expect(budgetOverlap(40, null, 40, 40)).toBe(true);
  });
  it("exclut les prix inconnus avec un budget actif", () => {
    expect(budgetOverlap(null, null, null, 50)).toBe(false);
    expect(budgetOverlap(null, null, null, null)).toBe(true);
  });
});
describe("Réservation", () => {
  it("demande nom et email valides", () => {
    const v = {
      token: crypto.randomUUID(),
      gift: crypto.randomUUID(),
      name: "Sophie et Marc",
      email: "sophie@example.com",
      amount: null,
    };
    expect(reservationInput.safeParse(v).success).toBe(true);
    expect(reservationInput.safeParse({ ...v, email: "" }).success).toBe(false);
    expect(reservationInput.safeParse({ ...v, name: " " }).success).toBe(false);
  });
});
describe("Protection de l’import des liens", () => {
  it("refuse les réseaux locaux et les adresses IPv6 mappées", () => {
    for (const ip of [
      "127.0.0.1",
      "10.2.0.1",
      "169.254.169.254",
      "172.16.1.2",
      "192.168.1.1",
      "100.64.0.1",
      "::1",
      "::ffff:127.0.0.1",
      "fe80::1",
      "fc00::1",
    ])
      expect(publicAddress(ip), ip).toBe(false);
    expect(publicAddress("8.8.8.8")).toBe(true);
    expect(publicAddress("2606:4700:4700::1111")).toBe(true);
  });
});
describe("Publication", () => {
  const idea = {
    title: "Lampe",
    description: "",
    specifications: "",
    privateNote: "",
    url: "",
    imageUrl: "",
    imageCredit: null,
    priceMin: null,
    priceMax: null,
    visibility: "household",
    candidates: [],
    recipientId: null,
    listIds: [],
    global: false,
    priority: 2,
    collective: false,
    targetAmount: null,
  };
  it("autorise la capture sans classement mais pas la publication sans destinataire", () => {
    expect(giftInput.safeParse(idea).success).toBe(true);
    expect(giftInput.safeParse({ ...idea, visibility: "public" }).success).toBe(
      false,
    );
  });
  it("refuse une fourchette inversée et un collectif sans objectif", () => {
    expect(
      giftInput.safeParse({ ...idea, priceMin: 60, priceMax: 30 }).success,
    ).toBe(false);
    expect(giftInput.safeParse({ ...idea, collective: true }).success).toBe(
      false,
    );
  });
});
