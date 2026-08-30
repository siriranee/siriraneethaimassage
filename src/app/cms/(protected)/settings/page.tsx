import { ArrowRight, BookOpenCheck, Clock3, DatabaseBackup, PlugZap, ScrollText, ShieldCheck, Store, Users } from "lucide-react";
import Link from "next/link";

import { CmsPageHeader } from "@/components/cms/CmsUi";
import { canCmsRole } from "@/domain/cms/permissions";
import { requireCmsPageUser } from "@/server/cms/auth/guards";

import styles from "@/components/cms/CmsViews.module.css";

const settingCards = [
  { href: "/cms/settings/business", icon: Store, permission: "settings:view", title: "Business information", text: "Address, contact channels, service areas, directions and local SEO." },
  { href: "/cms/settings/hours", icon: Clock3, permission: "settings:view", title: "Opening hours", text: "Weekly hours and owner confirmation status." },
  { href: "/cms/settings/booking", icon: BookOpenCheck, permission: "settings:view", title: "Booking rules", text: "Dublin timezone, capacity, notice, buffers, horizon and cancellation cutoff." },
  { href: "/cms/settings/integrations", icon: PlugZap, permission: "settings:view", title: "Integrations", text: "Booking provider, maps, WhatsApp, Instagram and review links." },
  { href: "/cms/settings/recovery", icon: DatabaseBackup, permission: "settings:view", title: "Recovery & monitoring", text: "Backup, encryption-key, restore-drill and alert readiness without exposing secrets." },
  { href: "/cms/settings/users", icon: Users, permission: "users:manage", title: "CMS users", text: "Administrator and staff accounts with revocable server-side sessions." },
  { href: "/cms/audit-log", icon: ScrollText, permission: "audit:view", title: "Audit log", text: "Review security and content changes without exposing secrets." },
] as const;

export default async function CmsSettingsPage() {
  const user = await requireCmsPageUser("settings:view");
  const cards = settingCards.filter((card) => canCmsRole(user.role, card.permission));

  return (
    <>
      <CmsPageHeader
        description="Configure reusable business facts, booking policy and secure access in one place."
        eyebrow="Configuration"
        title="Settings"
      />

      <div className={styles.cardGrid}>
        {cards.map(({ href, icon: Icon, text, title }) => (
          <article className={styles.card} key={href}>
            <span className={styles.cardIcon}><Icon aria-hidden="true" /></span>
            <h2>{title}</h2>
            <p>{text}</p>
            <Link href={href}>Open settings <ArrowRight aria-hidden="true" /></Link>
          </article>
        ))}
        <article className={styles.card}>
          <span className={styles.cardIcon}><ShieldCheck aria-hidden="true" /></span>
          <h2>Security status</h2>
          <p>Passwords use salted scrypt hashes. Sessions are opaque, revocable and stored server-side.</p>
          <span className={styles.setupLabel}>Secure foundation active</span>
        </article>
      </div>
    </>
  );
}
