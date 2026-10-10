import { redirect } from "next/navigation";
import { configured, serverClient } from "@/lib/supabase/server";
import { signImage } from "@/lib/images";
import Admin from "@/components/Admin";
import { loadRows } from "@/lib/data";
import type { Dataset } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!configured())
    return (
      <main className="setup">
        <h1>Kad’Humbert ✨</h1>
        <p>Pour les âmes en panne d’inspiration</p>
        <h2>Votre carnet prend forme</h2>
        <p>
          Connectez votre projet Supabase pour ouvrir le carnet sécurisé. Les
          instructions se trouvent dans le fichier README du projet.
        </p>
      </main>
    );
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    const shared = await searchParams;
    const carry = new URLSearchParams();
    for (const key of ["title", "text", "url"]) {
      const value = shared[key];
      if (typeof value === "string") carry.set(key, value.slice(0, 3000));
    }
    redirect(
      carry.size
        ? "/login?next=" + encodeURIComponent("/?" + carry.toString())
        : "/login",
    );
  }
  const [ideas, proposals, lists, recipients, profiles, activity, shares] =
    await Promise.all(
      [
        "ideas",
        "proposals",
        "lists",
        "recipients",
        "profiles",
        "activity",
        "share_history",
      ].map((table) => loadRows(db, table)),
    );
  const profile = profiles.find((p) => p.id === user.id);
  if (!profile) redirect("/login");
  const previews = Object.fromEntries(
    await Promise.all(
      [...ideas, ...lists]
        .filter((i) => i.image_url)
        .map(async (i) => [i.id, await signImage(i.image_url as string)]),
    ),
  );
  return (
    <Admin
      data={
        {
          ideas,
          proposals,
          lists,
          recipients,
          profile,
          profiles,
          activity,
          shares,
        } as unknown as Dataset
      }
      previews={previews}
    />
  );
}
