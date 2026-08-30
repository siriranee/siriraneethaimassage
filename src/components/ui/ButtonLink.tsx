import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./ButtonLink.module.css";

type ButtonLinkProps = {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
  variant?: "gold" | "outline" | "light";
  external?: boolean;
  className?: string;
};

export function ButtonLink({
  href,
  children,
  icon,
  variant = "gold",
  external = false,
  className = "",
}: ButtonLinkProps) {
  const classes = `${styles.button} ${styles[variant]} ${className}`;

  if (external) {
    return (
      <a className={classes} href={href} target="_blank" rel="noreferrer">
        <span>{children}</span>
        {icon}
      </a>
    );
  }

  return (
    <Link className={classes} href={href}>
      <span>{children}</span>
      {icon}
    </Link>
  );
}
