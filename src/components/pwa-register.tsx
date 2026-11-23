"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Never use service worker in development to avoid caching Next.js RSC and dev chunks
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister().then(() => {
            console.log("[PWA Dev] Unregistered service worker:", registration.scope);
          });
        }
      });

      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => caches.delete(key));
        });
      }
      return;
    }

    const registerSw = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          console.log("[PWA] Service Worker registered:", registration.scope);
        })
        .catch((error) => {
          console.warn("[PWA] Service Worker registration failed:", error);
        });
    };

    if (
      document.readyState === "complete" ||
      document.readyState === "interactive"
    ) {
      registerSw();
    } else {
      window.addEventListener("load", registerSw, { once: true });
      return () => window.removeEventListener("load", registerSw);
    }
  }, []);

  return null;
}
