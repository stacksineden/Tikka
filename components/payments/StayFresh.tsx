"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps a money screen current without reloading: fetches the latest the moment the screen is shown
 * again (back from Paystack or WhatsApp, or the home-screen app reopened), and checks on a timer
 * while it's on screen: every `fast` ms while something is waiting to be paid, else every `slow`.
 */
export function StayFresh({ waiting, fast = 5_000, slow = 30_000 }: { waiting: boolean; fast?: number; slow?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) router.refresh();
    };
    const onShow = () => refresh();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    window.addEventListener("pageshow", onShow);
    const id = setInterval(refresh, waiting ? fast : slow);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
      window.removeEventListener("pageshow", onShow);
      clearInterval(id);
    };
  }, [router, waiting, fast, slow]);
  return null;
}
