// The same stable order is used by the overview and the gift recipient picker.
export function personalOrder<T extends { id: string }>(
  rows: T[],
  preferences: Record<string, unknown>,
  manualOrder?: string[] | null,
  useFavorites = false,
): T[] {
  const favorites =
    useFavorites && Array.isArray(preferences.favorites)
      ? preferences.favorites
      : [];
  const order =
    manualOrder ?? (Array.isArray(preferences.order) ? preferences.order : []);
  const rank = (id: string) => {
    const at = order.indexOf(id);
    return at < 0 ? Number.MAX_SAFE_INTEGER : at;
  };
  return [...rows].sort(
    (a, b) =>
      Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)) ||
      rank(a.id) - rank(b.id),
  );
}
