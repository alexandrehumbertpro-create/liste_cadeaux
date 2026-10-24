import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import https from "node:https";
import http from "node:http";
import { load } from "cheerio";
export function publicAddress(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIP(ip) === 6)
    return (
      /^2[0-9a-f]{3}:/i.test(ip) && !ip.toLowerCase().startsWith("2001:db8:")
    );
  return false;
}
async function get(
  url: URL,
  redirects = 0,
): Promise<{ html: string; url: URL }> {
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error("Ce lien n’est pas pris en charge.");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error("Ce lien n’est pas accessible.");
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? https : http).get(
      url,
      {
        family: address.family,
        headers: {
          "User-Agent": "LaHotteHumbert/1.0 (gift-list metadata)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Encoding": "identity",
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        },
        lookup: ((
          _host: unknown,
          _opts: unknown,
          callback: (error: null, ip: string, family: number) => void,
        ) => callback(null, address.address, address.family)) as never,
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          if (redirects >= 3) {
            reject(new Error("Trop de redirections."));
            return;
          }
          get(new URL(res.headers.location, url), redirects + 1).then(
            resolve,
            reject,
          );
          return;
        }
        if (
          res.statusCode === 401 ||
          res.statusCode === 403 ||
          res.statusCode === 429
        ) {
          res.resume();
          reject(
            new Error(
              "Le site marchand bloque l’accès automatique à cette fiche produit.",
            ),
          );
          return;
        }
        if (
          res.statusCode !== 200 ||
          !res.headers["content-type"]?.includes("text/html")
        ) {
          res.resume();
          reject(
            new Error("Les détails de cette page ne sont pas disponibles."),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1024 * 1024) {
            request.destroy(new Error("Page trop volumineuse."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({ html: Buffer.concat(chunks).toString("utf8"), url }),
        );
        res.on("error", reject);
      },
    );
    request.setTimeout(7000, () =>
      request.destroy(new Error("La page met trop de temps à répondre.")),
    );
    request.on("error", reject);
  });
}
export function productUrl(value: string) {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) {
    if (
      /^utm_/i.test(key) ||
      [
        "gclid",
        "gbraid",
        "wbraid",
        "gad_source",
        "gad_campaignid",
        "cid",
        "cm_mmc",
        "fbclid",
        "msclkid",
      ].includes(key.toLowerCase())
    )
      url.searchParams.delete(key);
  }
  url.hash = "";
  return url;
}
function homepage(url: URL) {
  return (
    /^\/(?:[a-z]{2}(?:[-_][a-z]{2})?)?\/?$/i.test(url.pathname) && !url.search
  );
}
export function parseMetadata(html: string, baseUrl: string) {
  const $ = load(html);
  const pageTitle = $("title").first().text().trim();
  if (
    /^(?:acc[eè]s\s+(?:bloqu[eé]|refus[eé])|access\s+(?:denied|blocked)|just a moment|attention required|security check)/i.test(
      pageTitle,
    ) ||
    $("#challenge-form,#cf-challenge-running,.cf-error-details").length
  ) {
    throw new Error(
      "Le site marchand bloque l’accès automatique à cette fiche produit.",
    );
  }
  const meta = (name: string) =>
    $(`meta[property="${name}"],meta[name="${name}"]`)
      .first()
      .attr("content")
      ?.trim() || "";
  const objects: Record<string, any>[] = [];
  function visit(value: unknown) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      const object = value as Record<string, any>;
      objects.push(object);
      if (object["@graph"]) visit(object["@graph"]);
      if (object.mainEntity) visit(object.mainEntity);
      if (object.itemListElement) visit(object.itemListElement);
      if (object.item) visit(object.item);
    }
  }
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      visit(JSON.parse($(el).text()));
    } catch {}
  });
  const text = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
  const pageUrl = new URL(baseUrl);
  const samePage = (value: unknown) => {
    try {
      const candidate = new URL(text(value), pageUrl);
      return (
        Boolean(text(value)) &&
        candidate.origin === pageUrl.origin &&
        candidate.pathname.replace(/\/$/, "") ===
          pageUrl.pathname.replace(/\/$/, "") &&
        (candidate.pathname !== "/" ||
          productUrl(candidate.href).search === productUrl(pageUrl.href).search)
      );
    } catch {
      return false;
    }
  };
  const heading = $("h1").first().text().trim();
  const products = objects.filter((o) =>
    [o["@type"]]
      .flat()
      .some((t) => typeof t === "string" && /(?:^|[/#])Product$/.test(t)),
  );
  const score = (o: Record<string, any>) => {
    const matchesUrl = [
      o.url,
      o["@id"],
      ...[o.offers].flat().map((offer) => offer?.url),
    ].some(samePage);
    const matchesHeading =
      heading &&
      text(o.name).toLocaleLowerCase() === heading.toLocaleLowerCase();
    return (matchesUrl ? 100 : 0) + (matchesHeading ? 50 : 0);
  };
  const product = [...products]
    .sort((a, b) => score(b) - score(a))
    .find((o) => products.length === 1 || score(o) > 0);
  const scope = $('[itemscope][itemtype*="schema.org/Product"]').first();
  const declaredUrl =
    $('link[rel="canonical"]').first().attr("href") || meta("og:url");
  if (!product && !scope.length && declaredUrl && !homepage(pageUrl)) {
    try {
      if (homepage(new URL(declaredUrl, pageUrl)))
        throw new Error(
          "Les détails de cette fiche produit ne sont pas disponibles : le site renvoie les informations de sa page d’accueil.",
        );
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Les détails"))
        throw error;
    }
  }

  const property = (name: string) => {
    const element = scope.find(`[itemprop="${name}"]`).first();
    return (
      element.attr("content") ||
      element.attr("src") ||
      element.attr("href") ||
      element.text().trim()
    );
  };
  const offer = product
    ? [product.offers]
        .flat()
        .find(
          (o) =>
            o &&
            typeof o === "object" &&
            (o.price != null ||
              o.lowPrice != null ||
              o.priceSpecification?.price != null),
        )
    : undefined;
  const productImage = [product?.image].flat().find(Boolean);
  const rawImage =
    (typeof productImage === "string"
      ? productImage
      : productImage?.url || productImage?.contentUrl) ||
    property("image") ||
    $('[itemprop="image"]').first().attr("src") ||
    $('[itemprop="image"]').first().attr("content") ||
    meta("og:image:secure_url") ||
    meta("og:image") ||
    meta("twitter:image") ||
    $('link[rel="image_src"]').attr("href") ||
    "";
  let image = "";
  try {
    const resolved = new URL(rawImage, baseUrl);
    if (
      rawImage &&
      ["http:", "https:"].includes(resolved.protocol) &&
      !resolved.username &&
      !resolved.password &&
      !/(?:^|[\/_.-])(?:logo|favicon)(?:[\/_.-]|$)/i.test(resolved.pathname)
    )
      image = resolved.href;
  } catch {}
  const rawPrice =
    offer?.price ??
    offer?.lowPrice ??
    offer?.priceSpecification?.price ??
    (property("price") ||
      meta("product:price:amount") ||
      meta("og:price:amount") ||
      $('[itemprop="price"]').first().attr("content") ||
      $('[itemprop="price"]').first().text());
  const normalized = String(rawPrice ?? "").replace(/[\s\u00a0€$£]/g, "");
  const numberPrice = Number(
    normalized.includes(",") && normalized.includes(".")
      ? normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "")
      : normalized.replace(",", "."),
  );
  return {
    title: (
      text(product?.name) ||
      property("name") ||
      heading ||
      meta("og:title") ||
      meta("twitter:title") ||
      $("title").first().text()
    )
      .trim()
      .slice(0, 200),
    description: (
      text(product?.description) ||
      property("description") ||
      meta("og:description") ||
      meta("description") ||
      meta("twitter:description") ||
      ""
    )
      .trim()
      .slice(0, 10000),
    image,
    price:
      normalized && Number.isFinite(numberPrice) && numberPrice >= 0
        ? numberPrice
        : null,
  };
}
export async function extractMetadata(value: string) {
  const requested = productUrl(value);
  const result = await get(requested);
  if (!homepage(requested) && homepage(result.url))
    throw new Error(
      "Ce lien redirige vers la page d’accueil du site. Les informations du produit ne sont pas disponibles.",
    );
  return parseMetadata(result.html, result.url.href);
}
