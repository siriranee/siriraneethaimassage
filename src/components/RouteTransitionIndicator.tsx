"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ROUTE_TRANSITION_ATTRIBUTE,
  ROUTE_TRANSITION_START_EVENT,
  type RouteTransitionStartDetail,
} from "@/lib/route-transition";

import styles from "./RouteTransitionIndicator.module.css";

const TRANSITION_WATCHDOG_MS = 15_000;
const MINIMUM_VISIBLE_MS = 240;

export function RouteTransitionIndicator() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const completionRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const [pending, setPending] = useState(false);

  const finishTransition = useCallback(() => {
    document.documentElement.removeAttribute(ROUTE_TRANSITION_ATTRIBUTE);
    startedAtRef.current = null;
    setPending(false);
    if (completionRef.current !== null) {
      window.clearTimeout(completionRef.current);
      completionRef.current = null;
    }
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  useEffect(() => {
    function markPending(event: Event) {
      const detail = (event as CustomEvent<RouteTransitionStartDetail>).detail;
      startedAtRef.current =
        typeof detail?.startedAt === "number"
          ? detail.startedAt
          : performance.now();
      setPending(true);
      if (completionRef.current !== null) {
        window.clearTimeout(completionRef.current);
        completionRef.current = null;
      }
      if (watchdogRef.current !== null) {
        window.clearTimeout(watchdogRef.current);
      }
      watchdogRef.current = window.setTimeout(
        finishTransition,
        TRANSITION_WATCHDOG_MS,
      );
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        finishTransition();
      }
    }

    window.addEventListener(ROUTE_TRANSITION_START_EVENT, markPending);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener(ROUTE_TRANSITION_START_EVENT, markPending);
      window.removeEventListener("pageshow", handlePageShow);
      if (completionRef.current !== null) {
        window.clearTimeout(completionRef.current);
      }
      if (watchdogRef.current !== null) {
        window.clearTimeout(watchdogRef.current);
      }
    };
  }, [finishTransition]);

  useEffect(() => {
    const startedAt = startedAtRef.current;
    const elapsed = startedAt === null ? MINIMUM_VISIBLE_MS : performance.now() - startedAt;
    const delay = Math.max(0, MINIMUM_VISIBLE_MS - elapsed);
    completionRef.current = window.setTimeout(finishTransition, delay);
    return () => {
      if (completionRef.current !== null) {
        window.clearTimeout(completionRef.current);
        completionRef.current = null;
      }
    };
  }, [finishTransition, pathname, search]);

  return (
    <div className={styles.indicator} role="status" aria-live="polite">
      <span aria-hidden="true" className={styles.track} />
      <span className="sr-only">{pending ? "Loading page." : ""}</span>
    </div>
  );
}
