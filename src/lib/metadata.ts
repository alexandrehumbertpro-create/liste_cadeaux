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
async function get(url: URL, redirects = 0): Promise<string> {
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
          "User-Agent": "KadHumbert/1.0 (gift-list metadata)",
          Accept: "text/html",
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
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      },
    );
    request.setTimeout(7000, () =>
      request.destroy(new Error("La page met trop de temps à répondre.")),
    );
    request.on("error", reject);
  });
}
export async function extractMetadata(value: string) {
  const url = new URL(value),
    $ = load(await get(url));
  const meta = (name: string) =>
    $(`meta[property="${name}"],meta[name="${name}"]`)
      .first()
      .attr("content")
      ?.trim() || "";
  const rawImage = meta("og:image");
  let image = "";
  try {
    const resolved = new URL(rawImage, url);
    if (rawImage && ["http:", "https:"].includes(resolved.protocol))
      image = resolved.href;
  } catch {}
  const valuePrice = Number(
    meta("product:price:amount") || meta("og:price:amount"),
  );
  return {
    title: (meta("og:title") || $("title").text()).slice(0, 200),
    description: (meta("og:description") || meta("description")).slice(
      0,
      10000,
    ),
    image,
    price: Number.isFinite(valuePrice) && valuePrice > 0 ? valuePrice : null,
  };
}
