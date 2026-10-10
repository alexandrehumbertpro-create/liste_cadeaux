import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
export async function loadRows(db: SupabaseClient, table: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .order("id")
      .range(from, from + 499);
    if (error) throw new Error("Impossible de charger le carnet.");
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
