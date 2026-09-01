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
        sizes={
          compact
            ? "(max-width: 380px) 2.75rem, 3.2rem"
            : "(max-width: 380px) 4.25rem, 4.8rem"
        }
        src="/brand/siriranee-logo-gold-exact.webp"
        width={1411}
      />
      <span className="sr-only">Siriranee Thai Massage</span>
    </span>
  );
}
