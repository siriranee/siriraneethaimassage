import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BookingStatusLookup } from "@/components/booking/BookingStatusLookup";
import { parsePublicBookingIdentifier } from "@/domain/booking/public-status";
import { PageHero } from "@/components/marketing/PageHero";
import { pageHeroImages } from "@/content/page-heroes";
import { createMetadata } from "@/lib/metadata";

import styles from "./page.module.css";

export const metadata: Metadata = createMetadata({
  title: "Check booking status",
  description:
    "Check the current status of a Siriranee Thai Massage booking request.",
  path: "/book/status",
  noIndex: true,
});

export default async function BookingStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string | string[] }>;
}) {
  const referenceValue = (await searchParams).reference;
  const parsedReference = parsePublicBookingIdentifier(
    typeof referenceValue === "string" ? referenceValue : "",
  );
  const initialIdentifier =
    parsedReference?.kind === "reference" ? parsedReference.value : "";

  return (
    <div className={styles.main}>
      <PageHero
        {...pageHeroImages.book}
        eyebrow="Booking support"
        title="Check your booking status"
        description="Use the secure status check without displaying your personal or appointment details."
      />

      <section className={styles.lookupSection}>
        <div className={styles.container}>
          <Link className={styles.backLink} href="/book">
            <ArrowLeft aria-hidden="true" /> Back to booking
          </Link>
          <BookingStatusLookup initialIdentifier={initialIdentifier} />
        </div>
      </section>
    </div>
  );
}
