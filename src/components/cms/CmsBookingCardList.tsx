"use client";

import { Children, type ReactNode, useState } from "react";

import styles from "@/components/cms/CmsViews.module.css";

const BOOKING_BATCH_SIZE = 10;

type CmsBookingCardListProps = {
  readonly children: ReactNode;
};

export function CmsBookingCardList({ children }: CmsBookingCardListProps) {
  const cards = Children.toArray(children);
  const [visibleCount, setVisibleCount] = useState(BOOKING_BATCH_SIZE);
  const shownCount = Math.min(visibleCount, cards.length);
  const remainingCount = cards.length - shownCount;

  return (
    <div className={styles.bookingList}>
      <div
        aria-label="Siriranee bookings"
        className={styles.bookingGrid}
        id="cms-booking-grid"
      >
        {cards.slice(0, shownCount)}
      </div>

      <div className={styles.bookingListControls}>
        <p aria-live="polite" className={styles.bookingListCount}>
          Showing <strong>{shownCount}</strong> of <strong>{cards.length}</strong> bookings
        </p>
        {remainingCount > 0 ? (
          <button
            aria-controls="cms-booking-grid"
            className={styles.showMoreBookings}
            onClick={() => {
              setVisibleCount((current) =>
                Math.min(current + BOOKING_BATCH_SIZE, cards.length),
              );
            }}
            type="button"
          >
            Show more ({Math.min(BOOKING_BATCH_SIZE, remainingCount)})
          </button>
        ) : null}
      </div>
    </div>
  );
}
