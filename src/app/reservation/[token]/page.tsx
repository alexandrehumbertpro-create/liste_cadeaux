import { notFound } from "next/navigation";
import { z } from "zod";
import { serviceClient, configured } from "@/lib/supabase/server";
import Reservation from "@/components/Reservation";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!configured() || !z.uuid().safeParse(token).success) notFound();
  const { data, error } = await serviceClient().rpc("reservation_info", {
    token,
  });
  if (error || !data) notFound();
  return <Reservation token={token} info={data} />;
}
