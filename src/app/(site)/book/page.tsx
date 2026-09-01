import type { Metadata } from "next";

import { BookingPlanner } from "@/components/booking/BookingPlanner";
import { PageHero } from "@/components/marketing/PageHero";
import { pageHeroImages } from "@/content/page-heroes";
import { createMetadata } from "@/lib/metadata";
import { getPublicBookingPlannerServices } from "@/server/booking/public-config";
import { getPublicPageCopy } from "@/server/cms/public-adapter";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublicPageCopy("book");
  return createMetadata({
    title: page.seoTitle,
    description: page.seoDescription,
    path: "/book",
  });
}

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
  const [query, plannerServices, pageCopy] = await Promise.all([
    searchParams,
    getPublicBookingPlannerServices(),
    getPublicPageCopy("book"),
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
        {...pageHeroImages.book}
        eyebrow={pageCopy.eyebrow}
        title={pageCopy.title}
        description={pageCopy.description}
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
