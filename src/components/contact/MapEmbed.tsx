"use client";

import { ExternalLink, MapPin } from "lucide-react";
import { useState } from "react";

import styles from "./MapEmbed.module.css";

type MapEmbedProps = {
  readonly address: string;
  readonly businessName: string;
  readonly directionsUrl: string;
  readonly embedUrl: string;
};

export function MapEmbed({
  address,
  businessName,
  directionsUrl,
  embedUrl,
}: MapEmbedProps) {
  const [mapLoaded, setMapLoaded] = useState(false);

  if (mapLoaded) {
    return (
      <div className={styles.frameWrap}>
        <p className="sr-only" role="status">
          Interactive Google Map loaded.
        </p>
        <iframe
          allowFullScreen
          className={styles.frame}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={embedUrl}
          title={`Google Maps location for ${businessName} at ${address}`}
        />
        <a
          className={styles.openMap}
          href={directionsUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open full map <ExternalLink aria-hidden="true" size={15} />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    );
  }

  return (
    <div className={styles.placeholder}>
      <span className={styles.ring} aria-hidden="true" />
      <span className={styles.pin} aria-hidden="true">
        <MapPin size={30} />
      </span>
      <div className={styles.consentCard}>
        <strong>View the interactive map</strong>
        <p>Google Maps loads only after you choose to view it.</p>
        <button type="button" onClick={() => setMapLoaded(true)}>
          Load Google Maps
        </button>
      </div>
    </div>
  );
}
