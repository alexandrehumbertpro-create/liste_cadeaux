import type { SharedGift } from "./types";
import { budgetOverlap } from "./validation";
export type GuestSort = "priority" | "price_asc" | "price_desc" | "newest";
export function guestGifts(
  gifts: SharedGift[],
  filters: {
    people: string[];
    max: string;
    priority: string;
    status: string;
    sort: GuestSort;
  },
) {
  return gifts
    .filter(
      (g) =>
        (!filters.people.length || filters.people.includes(g.recipientId)) &&
        (filters.priority === "" || g.priority === Number(filters.priority)) &&
        budgetOverlap(
          g.priceMin,
          g.priceMax,
          null,
          filters.max ? Number(filters.max) : null,
        ) &&
        (!filters.status ||
          (filters.status === "reserved" ? g.reserved : !g.reserved)),
    )
    .sort((a, b) => {
      const reserved = Number(a.reserved) - Number(b.reserved);
      if (reserved) return reserved;
      if (filters.sort === "newest")
        return (
          (Date.parse(b.createdAt || "") || 0) -
          (Date.parse(a.createdAt || "") || 0)
        );
      if (filters.sort === "price_asc" || filters.sort === "price_desc") {
        if (a.priceMin === null || b.priceMin === null)
          return Number(a.priceMin === null) - Number(b.priceMin === null);
        return (
          (a.priceMin - b.priceMin) * (filters.sort === "price_desc" ? -1 : 1)
        );
      }
      return a.priority - b.priority;
    });
}
