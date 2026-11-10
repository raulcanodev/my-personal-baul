"use client";

import { useSyncExternalStore } from "react";

// Hides the big totals (stat cards). Stored per device so it survives reloads.
const KEY = "baul:private-amounts";
const listeners = new Set<() => void>();

function read() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setPrivateAmounts(value: boolean) {
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // private browsing: the toggle still works until reload
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePrivateAmounts() {
  return useSyncExternalStore(subscribe, read, () => false);
}
