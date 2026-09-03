"use client";

import { Bell, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import type {
  CmsNotificationBellItem,
  CmsNotificationKind,
} from "@/domain/cms/types";

import styles from "./CmsNotificationBell.module.css";

const notificationLabels: Readonly<Record<CmsNotificationKind, string>> = {
  "booking-requested": "New booking request",
  "booking-confirmed": "Booking confirmed",
  "booking-rescheduled": "Booking rescheduled",
  "booking-cancelled": "Booking cancelled",
  "booking-completed": "Booking completed",
  "booking-no-show": "Booking marked as no-show",
};

function formatDublinTimestamp(value: string) {
  try {
    return new Intl.DateTimeFormat("en-IE", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Dublin",
    }).format(new Date(value));
  } catch {
    return "Recent activity";
  }
}

type CmsNotificationBellProps = {
  readonly items: readonly CmsNotificationBellItem[];
  readonly offsetForBanner?: boolean;
  readonly placement: "desktop" | "mobile";
};

export function CmsNotificationBell({
  items,
  offsetForBanner = false,
  placement,
}: CmsNotificationBellProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeFromOutside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function closeFromKeyboard(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [open]);

  const recentLabel = `${items.length} recent booking update${items.length === 1 ? "" : "s"}`;
  const rootClassName = [
    styles.root,
    placement === "desktop" ? styles.desktop : styles.mobile,
    offsetForBanner ? styles.offsetForBanner : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClassName} ref={rootRef}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Notifications, ${recentLabel}`}
        className={styles.trigger}
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <Bell aria-hidden="true" />
        {items.length ? (
          <span className={styles.activityDot}>
            <span className="sr-only">{recentLabel}</span>
          </span>
        ) : null}
      </button>

      <section
        aria-label="Recent booking activity"
        className={styles.panel}
        hidden={!open}
        id={panelId}
        role="dialog"
      >
        <header className={styles.panelHeader}>
          <div>
            <span>Notifications</span>
            <h2>Recent booking activity</h2>
          </div>
          <button
            aria-label="Close notifications"
            className={styles.closeButton}
            onClick={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        {items.length ? (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/cms/bookings/${item.bookingId}`}
                  onClick={() => setOpen(false)}
                >
                  <span className={styles.itemIcon} aria-hidden="true">
                    <Bell />
                  </span>
                  <span className={styles.itemCopy}>
                    <strong>{notificationLabels[item.kind]}</strong>
                    <span>{item.bookingReference}</span>
                    <time dateTime={item.createdAt}>
                      {formatDublinTimestamp(item.createdAt)}
                    </time>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.emptyState}>
            <Bell aria-hidden="true" />
            <strong>No recent booking activity</strong>
            <span>New booking updates will appear after the page is refreshed.</span>
          </div>
        )}

        <p className={styles.refreshNote}>Loaded when this page opened · Dublin time</p>
      </section>
    </div>
  );
}
