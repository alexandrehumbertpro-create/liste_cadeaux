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
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error &&
          /^(Ce lien|Le site marchand|Les détails|La page|Page trop|Trop de redirections)/.test(
            error.message,
          )
            ? error.message
            : "Impossible de récupérer les détails de ce lien. Le site peut bloquer la récupération automatique.",
      },
      { status: 400 },
    );
  }
}
