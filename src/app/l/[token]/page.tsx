import { notFound } from "next/navigation";
import { z } from "zod";
import { serviceClient, configured } from "@/lib/supabase/server";
import { signImage } from "@/lib/images";
import Guest from "@/components/Guest";
import type { SharedList } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!z.uuid().safeParse(token).success || !configured()) notFound();
  const { data, error } = await serviceClient().rpc("shared_list", { token });
  if (error) throw new Error("La liste ne peut pas être chargée.");
  if (!data) notFound();
  const list = data as SharedList;
  list.imageUrl = await signImage(list.imageUrl);
  list.gifts = await Promise.all(
    list.gifts.map(async (g) => ({
      ...g,
      imageUrl: await signImage(g.imageUrl),
    })),
  );
  return <Guest list={list} token={token} />;
}
