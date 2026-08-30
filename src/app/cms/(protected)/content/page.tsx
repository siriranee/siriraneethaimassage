import { ArrowRight, BriefcaseBusiness, CalendarClock, Clock3, FileImage, Gift, Megaphone, Search, Users } from "lucide-react";
import Link from "next/link";

import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { canCmsRole } from "@/domain/cms/permissions";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";

import styles from "@/components/cms/CmsViews.module.css";

const cards = [
  { href: "/cms/settings/business", icon: BriefcaseBusiness, title: "Business information", text: "Name, address, contact channels, nearby areas and arrival guidance." },
  { href: "/cms/pages", icon: FileImage, title: "Page headings & SEO", text: "Hero copy and search previews for the main public pages." },
  { href: "/cms/settings/hours", icon: Clock3, title: "Opening hours", text: "Weekly hours and an explicit owner-confirmed status." },
  { href: "/cms/services", icon: CalendarClock, title: "Treatments & prices", text: "Service descriptions, durations, prices and publication status." },
  { href: "/cms/team", icon: Users, title: "Team profiles", text: "Public team information and separate internal operational status." },
  { href: "/cms/promotions", icon: Megaphone, title: "Promotions", text: "Owner-approved offers, optional date windows and archive controls." },
  { href: "/cms/vouchers", icon: Gift, title: "Gift vouchers", text: "Voucher values, customer information, display order and archive controls." },
  { href: "/cms/media", icon: FileImage, title: "Gallery & media", text: "Image records, captions, alt text and publishing controls." },
  { href: "/cms/settings/business#seo", icon: Search, title: "Search appearance", text: "Dublin and Howth focused titles and descriptions for local discovery." },
] as const;

export default async function CmsContentPage() {
  const user = await requireCmsPageUser("content:view");
  const content = await getCmsContent();

  return (
    <>
      <CmsPageHeader
        actions={canCmsRole(user.role, "content:publish") ? <CmsPrimaryLink href="/cms/content/preview">Review & publish</CmsPrimaryLink> : undefined}
        description="Manage public-facing information in focused editors, then publish one consistent website snapshot."
        eyebrow="Public website"
        title="Website content"
      />

      <CmsNotice title={`Draft revision ${content.revision}`}>
        Public pages read the last complete publication, so partially edited
        services or settings never leak into the live website.
      </CmsNotice>

      <div className={styles.cardGrid}>
        {cards.map(({ href, icon: Icon, text, title }) => (
          <article className={styles.card} key={href}>
            <span className={styles.cardIcon}><Icon aria-hidden="true" /></span>
            <h2>{title}</h2>
            <p>{text}</p>
            <Link href={href}>Open editor <ArrowRight aria-hidden="true" /></Link>
          </article>
        ))}
      </div>
    </>
  );
}
