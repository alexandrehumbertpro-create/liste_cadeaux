import React from "react";
import { renderToString } from "react-dom/server";
import { load } from "cheerio";
import { expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  listHistory,
  activityDetails,
  activityActor,
} from "../src/lib/list-history";
import ActivityLog from "../src/components/ActivityLog";
import ListShares from "../src/components/ListShares";
import type { Activity, Dataset, GiftList } from "../src/lib/types";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
const list = { id: "list", name: "Noël" } as GiftList;
const data = {
  ideas: [{ id: "lamp", title: "Lampe" }],
  proposals: [],
  lists: [list],
  recipients: [{ id: "alex-person", name: "Alex" }],
  profiles: [
    { id: "alex", display_name: "Alex" },
    { id: "elise", display_name: "Elise" },
  ],
  shares: [],
  activity: [],
} as unknown as Dataset;
const event = (overrides: Partial<Activity> = {}): Activity => ({
  id: 1,
  idea_id: "lamp",
  actor_id: "alex",
  list_ids: ["list"],
  message: "Idée modifiée",
  created_at: "2026-10-24T12:00:00Z",
  changes: { price_min: { before: 40, after: 60 } },
  ...overrides,
});
it("garde les retraits historiques, trie les dates et écarte les événements privés ou d’une autre liste", () => {
  const rows = [
    event(),
    event({ id: 2, created_at: "2026-10-24T13:00:00Z" }),
    event({ id: 3, idea_id: "hidden" }),
    event({ id: 4, list_ids: ["other"] }),
  ];
  expect(
    listHistory({ ...data, activity: rows }, "list").map((a) => a.id),
  ).toEqual([2, 1]);
});
it("présente un détail lisible, l’auteur et la date sans afficher les champs techniques ou la note privée", () => {
  const a = event({
    actor_id: "elise",
    changes: {
      price_min: { before: 40, after: 60 },
      recipient_id: { before: null, after: "alex-person" },
      priority: { before: 2, after: 0 },
      private_note: { before: "SECRET", after: "AUTRE SECRET" },
    },
  });
  const $ = load(
    renderToString(React.createElement(ActivityLog, { entries: [a], data })),
  );
  const text = $.text().replace(/\s+/g, " ");
  expect(text).toContain("Elise");
  expect(text).toContain("Lampe");
  expect(text).toContain("40,00 € → 60,00 €");
  expect(text).toContain("Pour qui : Non renseigné → Alex");
  expect(text).not.toContain("price_min");
  expect(text).not.toContain("SECRET");
  expect(activityDetails(a, data).join(" ")).toContain("Coup de cœur");
  expect(
    activityActor(
      event({
        actor_id: null,
        changes: { reserved: { before: false, after: true } },
      }),
      data,
    ),
  ).toBe("Invité (identité masquée)");
});
it("limite les contacts à la liste concernée et affiche le canal, l’auteur et l’absence de preuve d’envoi", () => {
  const withShares = {
    ...data,
    shares: [
      {
        list_id: "other",
        contact_name: "AUTRE LISTE",
        channel: "sms",
        created_at: "2026-10-24T14:00:00Z",
      },
      {
        list_id: "list",
        created_by: "elise",
        contact_name: "Sophie et Marc",
        channel: "whatsapp",
        created_at: "2026-10-24T13:00:00Z",
      },
    ],
  };
  const $ = load(
    renderToString(React.createElement(ListShares, { list, data: withShares })),
  );
  expect($.text()).toContain("Sophie et Marc");
  expect($.text()).toContain("WhatsApp");
  expect($.text()).toContain("Elise");
  expect($.text()).toContain("Partage préparé");
  expect($.text()).not.toContain("AUTRE LISTE");
});
it("explique clairement une liste sans partage ni événement", () => {
  expect(
    renderToString(React.createElement(ListShares, { list, data })),
  ).toContain("Aucun partage enregistré");
  expect(
    renderToString(React.createElement(ActivityLog, { entries: [], data })),
  ).toContain("Aucun changement enregistré");
});
