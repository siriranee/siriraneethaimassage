"use client";

import { UserRound } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import styles from "./CmsCalendar.module.css";

export function CmsTherapistPortrait({ name, imageUrl, imageAlt }: Readonly<{
  name: string;
  imageUrl: string;
  imageAlt: string;
}>) {
  const [failedSource, setFailedSource] = useState("");
  return (
    <span className={styles.therapistPortrait}>
      {imageUrl && failedSource !== imageUrl ? (
        <Image alt={imageAlt || `${name} portrait`} fill sizes="48px" src={imageUrl} onError={() => setFailedSource(imageUrl)} />
      ) : <UserRound aria-hidden="true" />}
    </span>
  );
}
