import type { ReactNode } from "react";

import styles from "./CalendarLegend.module.css";

export function CalendarLegend({
  children,
}: Readonly<{ children?: ReactNode }>) {
  return (
    <ul aria-label="Calendar legend" className={styles.legend}>
      <li><i aria-hidden="true" className={styles.available} />Available</li>
      <li><i aria-hidden="true" className={styles.selected} />Selected</li>
      <li><i aria-hidden="true" className={styles.fullyBooked} />Fully booked</li>
      <li><i aria-hidden="true" className={styles.dayOff} />Day off</li>
      {children}
    </ul>
  );
}
