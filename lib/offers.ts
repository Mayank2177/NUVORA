"use client";

import { useEffect, useState } from "react";
import { loadTasks, upsertTask } from "@/lib/market";

export type OfferStatus = "pending" | "accepted" | "declined" | "closed";
/** invite = employer asked a developer. interest = developer raised their hand. */
export type Offer = {
  id: string; taskId: string; devId: string; devName: string;
  origin: "invite" | "interest"; status: OfferStatus; createdAt: string; respondedAt?: string;
};

const KEY = "nuvora:market:offers";
const EVENT = "nuvora:market";
const FULL = "Couldn't save. Your browser storage is full.";
const now = () => new Date().toISOString();
const isActive = (o: Offer) => o.status === "pending" || o.status === "accepted";
const withStatus = (o: Offer, status: OfferStatus): Offer => ({ ...o, status, respondedAt: now() });

export function loadOffers(): Offer[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Offer[]) : [];
  } catch {
    return [];
  }
}

export function saveOffers(offers: Offer[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(offers));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

export function useOffers(): Offer[] | undefined {
  const [v, setV] = useState<Offer[] | undefined>(undefined);
  useEffect(() => {
    const sync = () => setV(loadOffers());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return v;
}

/** The newest offer between one task and one developer, ignoring closed ones. */
export function latestOffer(offers: Offer[], taskId: string, devId: string): Offer | undefined {
  return offers
    .filter((o) => o.taskId === taskId && o.devId === devId && o.status !== "closed")
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
}

/** Assigns the task and closes every other pending offer for it. Returns an error message, or null. */
function assign(taskId: string, devId: string, winning: string): string | null {
  const task = loadTasks().find((t) => t.id === taskId);
  if (!task || task.status !== "open") return "This task is no longer open.";
  if (!upsertTask({ ...task, status: "assigned", assigneeId: devId })) return FULL;
  saveOffers(
    loadOffers().map((o) =>
      o.id === winning ? withStatus(o, "accepted") : o.taskId === taskId && o.status === "pending" ? withStatus(o, "closed") : o,
    ),
  );
  return null;
}

/* ---------- employer ---------- */

export function inviteDeveloper(taskId: string, dev: { id: string; name: string }): string | null {
  const task = loadTasks().find((t) => t.id === taskId);
  if (!task || task.status !== "open") return "Publish the task first. Only open tasks can take invitations.";
  const offers = loadOffers();
  const existing = offers.find((o) => o.taskId === taskId && o.devId === dev.id && isActive(o));
  if (existing) {
    if (existing.origin === "interest" && existing.status === "pending") return assign(taskId, dev.id, existing.id);
    return existing.status === "accepted" ? "This developer already has the task." : "You've already invited this developer.";
  }
  const rest = offers.filter((o) => !(o.taskId === taskId && o.devId === dev.id)); // drops an old declined record
  const offer: Offer = { id: crypto.randomUUID(), taskId, devId: dev.id, devName: dev.name, origin: "invite", status: "pending", createdAt: now() };
  return saveOffers([offer, ...rest]) ? null : FULL;
}

export function assignFromInterest(offerId: string): string | null {
  const o = loadOffers().find((x) => x.id === offerId);
  if (!o || o.origin !== "interest" || o.status !== "pending") return "That request is no longer active.";
  return assign(o.taskId, o.devId, o.id);
}

export function cancelInvite(offerId: string): string | null {
  const offers = loadOffers();
  if (!offers.some((o) => o.id === offerId && o.status === "pending")) return "That invitation is no longer pending.";
  return saveOffers(offers.map((o) => (o.id === offerId ? withStatus(o, "closed") : o))) ? null : FULL;
}

/* ---------- developer ---------- */

export function expressInterest(taskId: string, dev: { id: string; name: string }): string | null {
  const task = loadTasks().find((t) => t.id === taskId);
  if (!task || task.status !== "open") return "This task is no longer open.";
  const offers = loadOffers();
  const existing = offers.find((o) => o.taskId === taskId && o.devId === dev.id && isActive(o));
  if (existing) return existing.origin === "invite" ? "You have an invitation for this task. Accept it instead." : "You've already shown interest.";
  const rest = offers.filter((o) => !(o.taskId === taskId && o.devId === dev.id));
  const offer: Offer = { id: crypto.randomUUID(), taskId, devId: dev.id, devName: dev.name, origin: "interest", status: "pending", createdAt: now() };
  return saveOffers([offer, ...rest]) ? null : FULL;
}

/** "Not for me" on an open task. Hides it from your matches. */
export function passOnTask(taskId: string, dev: { id: string; name: string }): string | null {
  const rest = loadOffers().filter((o) => !(o.taskId === taskId && o.devId === dev.id && !isActive(o)));
  const offer: Offer = { id: crypto.randomUUID(), taskId, devId: dev.id, devName: dev.name, origin: "interest", status: "declined", createdAt: now(), respondedAt: now() };
  return saveOffers([offer, ...rest]) ? null : FULL;
}

export function withdrawInterest(offerId: string): string | null {
  const offers = loadOffers();
  if (!offers.some((o) => o.id === offerId && o.status === "pending")) return "That request is no longer active.";
  return saveOffers(offers.map((o) => (o.id === offerId ? withStatus(o, "declined") : o))) ? null : FULL;
}

export function reconsider(offerId: string): string | null {
  return saveOffers(loadOffers().filter((o) => !(o.id === offerId && o.origin === "interest" && o.status === "declined"))) ? null : FULL;
}

export function respondToInvite(offerId: string, accept: boolean): string | null {
  const o = loadOffers().find((x) => x.id === offerId);
  if (!o || o.origin !== "invite" || o.status !== "pending") return "This invitation is no longer active.";
  if (accept) return assign(o.taskId, o.devId, o.id);
  return saveOffers(loadOffers().map((x) => (x.id === offerId ? withStatus(x, "declined") : x))) ? null : FULL;
}