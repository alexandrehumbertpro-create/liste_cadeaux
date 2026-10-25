import React from "react";
import { renderToString } from "react-dom/server";
import { load } from "cheerio";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("../src/lib/client-actions", () => ({ reserveForGuest: vi.fn() }));
import AdminReservation from "../src/components/AdminReservation";
import { adminReservationInput, reservationInput } from "../src/lib/validation";
import type { Idea, Proposal } from "../src/lib/types";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
const idea = {
  id: crypto.randomUUID(),
  title: "Atelier de céramique",
  specifications: "Deux places",
  price_min: 40,
  price_max: 60,
} as Idea;
const proposal = {
  id: crypto.randomUUID(),
  idea_id: idea.id,
  collective: false,
  contributed: 0,
  target_amount: null,
} as Proposal;
it("autorise l’email vide seulement pour le parcours administrateur et conserve le nom obligatoire", () => {
  const input = {
    listId: crypto.randomUUID(),
    gift: proposal.id,
    name: "Sophie et Marc",
    amount: null,
  };
  expect(adminReservationInput.safeParse(input).success).toBe(true);
  expect(adminReservationInput.safeParse({ ...input, email: "" }).success).toBe(
    true,
  );
  expect(
    adminReservationInput.safeParse({ ...input, name: "   " }).success,
  ).toBe(false);
  expect(
    adminReservationInput.safeParse({ ...input, email: "incorrect" }).success,
  ).toBe(false);
  expect(
    reservationInput.safeParse({
      ...input,
      token: crypto.randomUUID(),
      email: "",
    }).success,
  ).toBe(false);
});
it("affiche le récapitulatif, le nom requis, l’email facultatif et aucune saisie de montant pour un cadeau individuel", () => {
  const $ = load(
    renderToString(
      React.createElement(AdminReservation, {
        idea,
        proposal,
        listId: "list",
        recipient: "Elise",
        done() {},
      }),
    ),
  );
  expect($('input[name="name"]').attr("required")).toBeDefined();
  expect($('input[name="email"]').attr("required")).toBeUndefined();
  expect($('input[name="amount"]').length).toBe(0);
  expect($.text()).toContain("Atelier de céramique");
  expect($.text()).toContain("Elise");
  expect($.text()).toContain("ne recevra ni confirmation ni notification");
});
it("limite le montant au reste à participer pour les cadeaux collectifs", () => {
  const $ = load(
    renderToString(
      React.createElement(AdminReservation, {
        idea,
        proposal: {
          ...proposal,
          collective: true,
          target_amount: 100,
          contributed: 60,
        },
        listId: "list",
        recipient: "Elise",
        done() {},
      }),
    ),
  );
  expect($('input[name="amount"]').attr("max")).toBe("40");
  expect($('input[name="amount"]').attr("required")).toBeDefined();
});
