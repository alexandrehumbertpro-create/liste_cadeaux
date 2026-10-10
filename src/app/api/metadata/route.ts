import { requireAdmin } from "@/lib/supabase/server";
import { extractMetadata } from "@/lib/metadata";
import { z } from "zod";
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const { url } = z
      .object({ url: z.url().max(3000) })
      .parse(await request.json());
    return Response.json(await extractMetadata(url));
  } catch {
    return Response.json(
      { error: "Impossible de récupérer les détails de ce lien." },
      { status: 400 },
    );
  }
}
