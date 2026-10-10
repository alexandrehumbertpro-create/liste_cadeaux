import { requireAdmin } from "@/lib/supabase/server";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    if (!process.env.UNSPLASH_ACCESS_KEY)
      return Response.json(
        {
          error:
            "La recherche Unsplash sera disponible après la configuration de la clé API.",
        },
        { status: 503 },
      );
    const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100);
    if (!q) return Response.json({ photos: [] });
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", q);
    url.searchParams.set("per_page", "12");
    const response = await fetch(url, {
      headers: {
        Authorization: "Client-ID " + process.env.UNSPLASH_ACCESS_KEY,
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error();
    const json = await response.json();
    return Response.json({
      photos: json.results.map(
        (p: {
          id: string;
          urls: { regular: string };
          user: { name: string; links: { html: string } };
          links: { download_location: string };
        }) => ({
          id: p.id,
          url: p.urls.regular,
          name: p.user.name,
          credit:
            p.user.links.html + "?utm_source=kad_humbert&utm_medium=referral",
          download: p.links.download_location,
        }),
      ),
    });
  } catch {
    return Response.json(
      { error: "La recherche d’images est indisponible pour le moment." },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const { download } = await request.json();
    const url = new URL(download);
    if (
      url.origin !== "https://api.unsplash.com" ||
      !/^\/photos\/[a-zA-Z0-9_-]+\/download$/.test(url.pathname) ||
      !process.env.UNSPLASH_ACCESS_KEY
    )
      throw new Error();
    await fetch(url, {
      headers: {
        Authorization: "Client-ID " + process.env.UNSPLASH_ACCESS_KEY,
      },
      signal: AbortSignal.timeout(7000),
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Sélection indisponible." }, { status: 400 });
  }
}
