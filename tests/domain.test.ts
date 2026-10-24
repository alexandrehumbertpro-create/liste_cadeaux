import { recipientColors, recipientStyle } from "../src/lib/recipient-colors";
import { describe, it, expect } from "vitest";
import {
  budgetOverlap,
  imageReference,
  giftInput,
  reservationInput,
} from "../src/lib/validation";
import { publicAddress, parseMetadata, productUrl } from "../src/lib/metadata";
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

describe("Fiche produit plutôt que site général", () => {
  it("préfère le produit aux métadonnées générales du site", () => {
    const html = `<meta property="og:title" content="La boutique"><meta property="og:image" content="/logo.png"><meta property="og:description" content="Bienvenue"><meta property="product:price:amount" content="999"><script type="application/ld+json">{"@type":"Product","name":"Lampe bleue","description":"Lampe de bureau","image":"/lampe.jpg","offers":{"price":"45"}}</script>`;
    expect(parseMetadata(html, "https://shop.example/lampe")).toEqual({
      title: "Lampe bleue",
      description: "Lampe de bureau",
      image: "https://shop.example/lampe.jpg",
      price: 45,
    });
  });
  it("sélectionne le produit de cette URL plutôt que la première recommandation", () => {
    const html = `<script type="application/ld+json">[{"@type":"Product","name":"Autre cadeau","url":"/autre","image":"/autre.jpg"},{"@type":"Product","name":"Lampe bleue","url":"/lampe","image":"/lampe.jpg","offers":{"price":45}}]</script>`;
    expect(parseMetadata(html, "https://shop.example/lampe").title).toBe(
      "Lampe bleue",
    );
  });
  it("lit les informations dans le bloc microdata du produit", () => {
    const html = `<meta property="og:title" content="La boutique"><meta property="og:image" content="/logo.png"><div itemscope itemtype="https://schema.org/Product"><h1 itemprop="name">Lampe bleue</h1><img itemprop="image" src="/lampe.jpg"><meta itemprop="price" content="45"></div>`;
    expect(parseMetadata(html, "https://shop.example/lampe")).toMatchObject({
      title: "Lampe bleue",
      image: "https://shop.example/lampe.jpg",
      price: 45,
    });
  });
});

describe("Liens marchands", () => {
  it("retire la publicité mais conserve la fiche et l’offre Cdiscount", () => {
    const url = productUrl(
      "https://www.cdiscount.com/le-sport/produit/f-1214805-urb3700092645444.html?o=4330165634&p=179.99&cid=search_pla&cm_mmc=PLA&gclid=tracking&gbraid=tracking",
    );
    expect(url.pathname).toBe(
      "/le-sport/produit/f-1214805-urb3700092645444.html",
    );
    expect(url.search).toBe("?o=4330165634&p=179.99");
  });
  it("signale une page générique à la place de remplir avec le logo du site", () => {
    expect(() =>
      parseMetadata(
        '<link rel="canonical" href="https://www.cdiscount.com/"><meta property="og:title" content="Cdiscount"><meta property="og:image" content="/logo.png">',
        "https://www.cdiscount.com/fiche-produit.html",
      ),
    ).toThrow(/fiche produit/);
  });
});

it("préfère le titre de la fiche HTML et n’importe pas un logo comme photo produit", () => {
  const html =
    '<meta property="og:title" content="La boutique"><meta property="og:image" content="/images/site-logo.png"><h1>Trottinette électrique</h1>';
  expect(parseMetadata(html, "https://shop.example/produit")).toMatchObject({
    title: "Trottinette électrique",
    image: "",
  });
});

describe("Pages de blocage marchand", () => {
  it("ne prend pas la page Accès bloqué Cdiscount pour un produit", () => {
    const html =
      "<title>Accès bloquéCdiscount.fr</title><body>Cdiscount.fr Accès bloqué</body>";
    expect(() =>
      parseMetadata(
        html,
        "https://www.cdiscount.com/electromenager/petit-dejeuner-cafe/machine-expresso-manuelle-de-longhi-dedica-sty/f-1101727-del8004399331198.html",
      ),
    ).toThrow(/site marchand bloque/);
  });
  it("détecte aussi une page de vérification renvoyée avec un titre de boutique", () => {
    expect(() =>
      parseMetadata(
        '<title>La boutique</title><form id="challenge-form"></form>',
        "https://shop.example/produit",
      ),
    ).toThrow(/site marchand bloque/);
  });
});

describe("Liens d’illustration", () => {
  it("accepte une image web ou stockée et rejette les protocoles et identifiants inappropriés", () => {
    expect(
      imageReference.safeParse("https://shop.example/photo.jpg").success,
    ).toBe(true);
    expect(
      imageReference.safeParse("storage:abc-def/123-456.jpeg").success,
    ).toBe(true);
    for (const url of [
      "javascript:alert(1)",
      "data:image/svg+xml,test",
      "https://login:password@shop.example/image.jpg",
    ])
      expect(imageReference.safeParse(url).success).toBe(false);
  });
});

describe("Couleurs des personnes", () => {
  it("ne réutilise que les couleurs hexadécimales valides et garde un texte contrasté", () => {
    expect(
      recipientColors({
        recipientColors: { a: "#ffeecc", b: "url(https://example.test)" },
      }),
    ).toEqual({ a: "#ffeecc" });
    expect(recipientStyle("#000000").color).toBe("#ffffff");
    expect(recipientStyle("#ffffff").color).toBe("#000000");
    expect(recipientStyle("invalid").backgroundColor).toBe("#eee5fc");
  });
});
