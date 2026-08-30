import Image from "next/image";

import styles from "./BrandMark.module.css";

type BrandMarkProps = {
  compact?: boolean;
};

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <span className={`${styles.brand} ${compact ? styles.compact : ""}`}>
      <Image
        alt=""
        aria-hidden="true"
        className={styles.logoImage}
        height={1394}
        src="/brand/siriranee-logo-gold-exact.svg"
        unoptimized
        width={1411}
      />
      <span className="sr-only">Siriranee Thai Massage</span>
    </span>
  );
}
