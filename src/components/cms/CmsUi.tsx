import { AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./CmsUi.module.css";

export function CmsPageHeader({
  actions,
  description,
  eyebrow,
  title,
}: Readonly<{
  actions?: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}>) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}

export function CmsPanel({
  children,
  className = "",
  title,
  description,
}: Readonly<{
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
}>) {
  return (
    <section className={`${styles.panel} ${className}`}>
      {title || description ? (
        <header className={styles.panelHeader}>
          {title ? <h2>{title}</h2> : null}
          {description ? <p>{description}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function CmsNotice({
  children,
  tone = "info",
  title,
}: Readonly<{
  children: ReactNode;
  tone?: "info" | "warning" | "success";
  title: string;
}>) {
  const Icon = tone === "warning" ? AlertTriangle : tone === "success" ? CheckCircle2 : Info;

  return (
    <div className={`${styles.notice} ${styles[tone]}`} role={tone === "warning" ? "alert" : "note"}>
      <Icon aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <div>{children}</div>
      </div>
    </div>
  );
}

export function CmsStatusBadge({
  label,
  tone = "neutral",
}: Readonly<{
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "purple";
}>) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{label}</span>;
}

export function CmsStatCard({
  detail,
  icon: Icon,
  label,
  tone = "purple",
  value,
}: Readonly<{
  detail: string;
  icon: LucideIcon;
  label: string;
  tone?: "purple" | "gold" | "green";
  value: string | number;
}>) {
  return (
    <article className={styles.statCard}>
      <span className={`${styles.statIcon} ${styles[tone]}`}>
        <Icon aria-hidden="true" />
      </span>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export function CmsPrimaryLink({
  children,
  href,
  secondary = false,
}: Readonly<{
  children: ReactNode;
  href: string;
  secondary?: boolean;
}>) {
  return (
    <Link className={secondary ? styles.secondaryLink : styles.primaryLink} href={href}>
      {children}
    </Link>
  );
}

export function CmsEmptyState({
  children,
  title,
}: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <div className={styles.empty}>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
