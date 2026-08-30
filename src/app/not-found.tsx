import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { PublicShell } from "@/components/layout/PublicShell";
import { LotusIcon } from "@/components/ui/LotusIcon";

import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <PublicShell>
      <section className={styles.wrap}>
        <LotusIcon className={styles.lotus} />
        <p>404 · Page not found</p>
        <h1>This moment has moved on</h1>
        <span>
          The page you requested is no longer here. Return home or explore our current
          massage treatments.
        </span>
        <div className={styles.actions}>
          <Link href="/"><ArrowLeft aria-hidden="true" /> Back home</Link>
          <Link href="/services">View treatments</Link>
        </div>
      </section>
    </PublicShell>
  );
}
