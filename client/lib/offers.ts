"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useSession } from "@/lib/auth";
import { api } from "@/lib/api";

export type OfferStatus = "pending" | "accepted" | "declined" | "closed";
/** invite = employer asked a developer. interest = developer raised their hand. */
export type Offer = {
  id: string;
  taskId: string;
  devId: string;
  devName: string;
  origin: "invite" | "interest";
  status: OfferStatus;
  createdAt: string;
  respondedAt?: string;
};

const EVENT = "nuvora:market";

// ========== Shared store ==========

type StoreState = {
  uid: string | null;
  offers: Offer[];
  loading: boolean;
  error: string | null;
};

const INITIAL: StoreState = { uid: null, offers: [], loading: false, error: null };
const NO_OFFERS: Offer[] = [];
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

let store: StoreState = INITIAL;
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function setStore(next: StoreState | ((s: StoreState) => StoreState)) {
  store = typeof next === "function" ? next(store) : next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => store;
const getServerSnapshot = () => INITIAL;

async function loadOffersInternal(uid: string): Promise<void> {
  const pending = inflight.get(uid);
  if (pending) return pending;
  setStore((s) => ({ ...s, loading: true, error: null }));
  const request = (async () => {
    try {
      const offers = await api.get<Offer[]>("/api/marketplace/offers");
      if (store.uid !== uid) return;
      setStore((s) => ({ ...s, offers, loading: false, error: null }));
    } catch (error) {
      if (store.uid !== uid) return;
      console.error("Failed to load offers:", error);
      setStore((s) => ({ ...s, loading: false, error: "Failed to load offers" }));
    }
  })().finally(() => {
    inflight.delete(uid);
  });
  inflight.set(uid, request);
  return request;
}

function syncUser(uid: string | null) {
  if (store.uid !== uid) {
    setStore({ ...INITIAL, uid });
  }
  if (uid) void loadOffersInternal(uid);
}

// ========== API functions ==========

export async function loadOffers(): Promise<Offer[]> {
  return api.get<Offer[]>("/api/marketplace/offers");
}

export async function loadOffersForTask(taskId: string): Promise<Offer[]> {
  return api.get<Offer[]>(`/api/marketplace/offers?task_id=${encodeURIComponent(taskId)}`);
}

export async function loadOffersForDeveloper(developerId: string): Promise<Offer[]> {
  return api.get<Offer[]>(`/api/marketplace/offers?developer_id=${encodeURIComponent(developerId)}`);
}

// ========== Hook for reactivity ==========

export function useOffers(): Offer[] | undefined {
  const user = useSession();
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const sessionLoading = user === undefined;
  const uid = user?.id ?? null;

  useEffect(() => {
    if (sessionLoading) return;
    syncUser(uid);
  }, [sessionLoading, uid]);

  useEffect(() => {
    if (sessionLoading) return;
    const sync = () => {
      if (uid) void loadOffersInternal(uid);
    };
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [sessionLoading, uid]);

  const mine = !sessionLoading && snap.uid === uid;
  return mine && !snap.error ? snap.offers : uid ? undefined : NO_OFFERS;
}

// ========== Helper functions ==========

/** The newest offer between one task and one developer, ignoring closed ones. */
export function latestOffer(offers: Offer[], taskId: string, devId: string): Offer | undefined {
  return offers
    .filter((o) => o.taskId === taskId && o.devId === devId && o.status !== "closed")
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
}

// ========== Employer actions ==========

export async function inviteDeveloper(
  taskId: string,
  dev: { id: string; name: string }
): Promise<string | null> {
  try {
    await api.post("/api/marketplace/offers/invite", {
      taskId,
      developerId: dev.id,
      developerName: dev.name,
    });
    window.dispatchEvent(new Event(EVENT));
    return null;
  } catch (error: unknown) {
    return errorText(error, "Failed to invite developer.");
  }
}

export async function assignFromInterest(offerId: string): Promise<string | null> {
  try {
    await api.post(`/api/marketplace/offers/${offerId}/assign`);
    window.dispatchEvent(new Event(EVENT));
    return null;
  } catch (error: unknown) {
    return errorText(error, "Failed to assign task.");
  }
}

export async function cancelInvite(offerId: string): Promise<string | null> {
  try {
    await api.delete(`/api/marketplace/offers/${offerId}/cancel`);
    window.dispatchEvent(new Event(EVENT));
    return null;
  } catch (error: unknown) {
    return errorText(error, "Failed to cancel invitation.");
  }
}

// ========== Developer actions ==========

export async function expressInterest(
  taskId: string,
): Promise<string | null> {
  try {
    await api.post("/api/marketplace/offers/interest", { taskId });
    window.dispatchEvent(new Event(EVENT));
    return null;
  } catch (error: unknown) {
    return errorText(error, "Failed to express interest.");
  }
}

/** "Not for me" on an open task. Hides it from your matches. */
export async function passOnTask(
  taskId: string,
  dev: { id: string; name: string }
): Promise<string | null> {
  try {
    // Create a declined offer to hide the task
    const offers = await loadOffersForTask(taskId);
    const existingOffer = offers.find((o) => o.devId === dev.id);
    
    if (existingOffer) {
      await api.post(`/api/marketplace/offers/${existingOffer.id}/pass`);
    } else {
      // If no offer exists, we need to create a declined interest record
      // This endpoint expects an existing offer, so we create interest first then decline
      await expressInterest(taskId);
      const newOffers = await loadOffersForTask(taskId);
      const newOffer = newOffers.find((o) => o.devId === dev.id);
      if (newOffer) {
        await api.post(`/api/marketplace/offers/${newOffer.id}/pass`);
      }
    }
    
    window.dispatchEvent(new Event(EVENT));
    return null;
  } catch (error: unknown) {
    return errorText(error, "Failed to pass on task.");
  }
}

export async function withdrawInterest(offerId: string): Promise<string | null> {
  try {
    await api.post(`/api/marketplace/offers/${offerId}/withdraw`);
    window.dispatchEvent(new Event(EVENT));
    return null;
  } catch (error: unknown) {
    return errorText(error, "Failed to withdraw interest.");
  }
}

export async function reconsider(offerId: string): Promise<string | null> {
  try {
    await api.delete(`/api/marketplace/offers/${offerId}/reconsider`);
    window.dispatchEvent(new Event(EVENT));
    return null;
  } catch (error: unknown) {
    return errorText(error, "Failed to reconsider task.");
  }
}

export async function respondToInvite(offerId: string, accept: boolean): Promise<string | null> {
  try {
    await api.post(`/api/marketplace/offers/${offerId}/respond`, { accept });
    window.dispatchEvent(new Event(EVENT));
    return null;
  } catch (error: unknown) {
    return errorText(error, "Failed to respond to invitation.");
  }
}
