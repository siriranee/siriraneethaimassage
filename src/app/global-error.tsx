"use client";

import Image from "next/image";

import { googleMapsDirectionsUrl } from "@/content/site";

import "./globals.css";
import styles from "./global-error.module.css";

export default function GlobalError({
  retry,
}: Readonly<{
  error: Error & { digest?: string };
  retry: () => void;
}>) {
  return (
    <html lang="en">
      <body className={styles.body}>
        <title>Siriranee is temporarily unavailable</title>
        <main className={styles.main}>
          <section className={styles.card} aria-labelledby="global-error-title">
            <Image
              alt="Siriranee Thai Massage"
              className={styles.logo}
              height={180}
              priority
              src="/brand/siriranee-logo-gold-exact.webp"
              width={182}
            />
            <p className={styles.eyebrow}>Siriranee Thai Massage · Howth</p>
            <h1 id="global-error-title">We could not load this page</h1>
            <p>
              The website is temporarily unavailable. No unverified business
              details have been shown. Please try again in a moment.
            </p>
            <div className={styles.actions}>
              <button onClick={() => retry()} type="button">
                Try again
              </button>
              <a
                href={googleMapsDirectionsUrl}
                rel="noreferrer"
                target="_blank"
              >
                View confirmed location
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
