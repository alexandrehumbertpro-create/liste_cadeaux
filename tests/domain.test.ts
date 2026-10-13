import { describe, it, expect } from "vitest";
import {
  budgetOverlap,
  giftInput,
  reservationInput,
} from "../src/lib/validation";
import { publicAddress, parseMetadata } from "../src/lib/metadata";
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
  it("autorise la capture publique sans classement", () => {
    expect(giftInput.safeParse(idea).success).toBe(true);
    expect(giftInput.safeParse({ ...idea, visibility: "public" }).success).toBe(
      true,
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

describe("Informations produit", () => {
  it("lit les produits JSON-LD, les offres et les images relatives", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Atelier céramique","description":"Deux heures de création","image":{"url":"/images/atelier.jpg"},"offers":{"@type":"Offer","price":"49,90"}}]}</script>`;
    expect(parseMetadata(html, "https://shop.example/produit")).toEqual({
      title: "Atelier céramique",
      description: "Deux heures de création",
      image: "https://shop.example/images/atelier.jpg",
      price: 49.9,
    });
  });
  it("préfère Open Graph, ignore les scripts invalides et les images non HTTP", () => {
    const html = `<meta property="og:title" content="Lampe"><meta property="og:image" content="javascript:alert(1)"><meta property="product:price:amount" content="1 249,90"><script type="application/ld+json">invalid</script>`;
    expect(parseMetadata(html, "https://shop.example")).toEqual({
      title: "Lampe",
      description: "",
      image: "",
      price: 1249.9,
    });
  });
  it("ne transforme pas un prix absent en prix gratuit", () => {
    expect(
      parseMetadata("<title>Un cadeau</title>", "https://shop.example").price,
    ).toBe(null);
  });
});
