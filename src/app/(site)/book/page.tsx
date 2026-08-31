import type { Metadata } from "next";

import { BookingPlanner } from "@/components/booking/BookingPlanner";
import { PageHero } from "@/components/marketing/PageHero";
import { createMetadata } from "@/lib/metadata";
import { getPublicBookingPlannerServices } from "@/server/booking/public-config";

import styles from "./page.module.css";

const metadataDescription =
  "Book a massage at Siriranee Thai Massage in Howth, Dublin. Choose a treatment, duration and preferred date and time, then contact the team to confirm.";

export const metadata: Metadata = createMetadata({
  title: "Book a Massage in Howth, Dublin",
  description: metadataDescription,
  path: "/book",
});

type BookPageProps = {
  readonly searchParams: Promise<{
    readonly service?: string | string[];
    readonly duration?: string | string[];
    readonly date?: string | string[];
    readonly time?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BookPage({ searchParams }: BookPageProps) {
  const [query, plannerServices] = await Promise.all([
    searchParams,
    getPublicBookingPlannerServices(),
  ]);
  const initialServiceSlug = firstValue(query.service);
  const durationValue = firstValue(query.duration);
  const dateValue = firstValue(query.date);
  const timeValue = firstValue(query.time);
  const initialDuration =
    typeof durationValue === "string" && /^\d{1,3}$/.test(durationValue)
      ? Number(durationValue)
      : undefined;

  return (
    <div className={styles.main}>
      <PageHero
        eyebrow="Massage appointments in Howth"
        title="Book your massage"
        description="Choose a treatment, date and time."
        image="/images/spa/spa-still-life.webp"
        imageAlt="Illustrative rolled towels, massage oils, orchids and candles in a calm spa setting"
      />

      <div className={styles.plannerSection}>
        <BookingPlanner
          services={plannerServices}
          initialDate={typeof dateValue === "string" ? dateValue : undefined}
          initialDuration={initialDuration}
          initialServiceSlug={initialServiceSlug}
          initialTime={typeof timeValue === "string" ? timeValue : undefined}
        />
      </div>
    </div>
  );
}
