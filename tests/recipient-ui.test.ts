import React from "react";
import { renderToString } from "react-dom/server";
import { load } from "cheerio";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh() {}, push() {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../src/lib/client-actions", () => ({}));
import Admin from "../src/components/Admin";
import GiftForm from "../src/components/GiftForm";
import type { Dataset } from "../src/lib/types";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
it("affiche le même ordre sans favoris et les mêmes couleurs partagées sur les cartes et dans le formulaire", () => {
  const data: Dataset = {
    profile: {
      id: "admin",
      display_name: "Alex",
      email: "alex@example.test",
      preferences: {
        order: ["b", "a"],
        favorites: ["a"],
        recipientColors: { a: "#ff0000" },
      },
    },
    recipients: [
      { id: "a", name: "Alex", is_common: false, color: "#3155ff" },
      { id: "b", name: "Elise", is_common: false, color: "#d8f36a" },
      {
        id: "deleted",
        name: "Archive",
        is_common: false,
        deleted_at: "2026-10-24",
      },
    ],
    profiles: [],
    ideas: [],
    proposals: [],
    lists: [],
    activity: [],
    shares: [],
  };
  const admin = load(
    renderToString(React.createElement(Admin, { data, previews: {} })),
  );
  const form = load(
    renderToString(
      React.createElement(GiftForm, { data, done() {}, onDraft() {} }),
    ),
  );
  expect(
    admin(".person-card h2")
      .map((_, e) => admin(e).text())
      .get(),
  ).toEqual(["Elise", "Alex"]);
  expect(
    form("button[data-recipient]")
      .map((_, e) => form(e).attr("data-recipient"))
      .get(),
  ).toEqual(["b", "a"]);
  expect(admin('button[aria-label^="Favori "]').length).toBe(0);
  expect(form('button[data-recipient="a"]').attr("style")).toContain("#3155ff");
  expect(admin(".person-card").eq(1).attr("style")).toContain("#3155ff");
});
