import { CalendarDays, FileText, Gift, Search, Sparkles, Users } from "lucide-react";
import Link from "next/link";

import { CmsEmptyState, CmsPageHeader, CmsPanel } from "@/components/cms/CmsUi";
import { canCmsRole } from "@/domain/cms/permissions";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";
import { listCmsBookings } from "@/server/cms/read-service";
import styles from "@/components/cms/CmsViews.module.css";

type PageProps = { readonly searchParams: Promise<Record<string, string | string[] | undefined>> };
function contains(values: readonly string[], query: string) {
  return values.join(" ").toLowerCase().includes(query.toLowerCase());
}

export default async function CmsSearchPage({ searchParams }: PageProps) {
  const user = await requireCmsPageUser("dashboard:view");
  const params = await searchParams;
  const query = (typeof params.q === "string" ? params.q : "").trim().slice(0, 100);
  const content = await getCmsContent();
  const canEditContent = canCmsRole(user.role, "content:write");
  const bookings = query && canCmsRole(user.role, "bookings:view") ? await listCmsBookings({ search: query }) : [];
  const services = query ? content.services.filter((item) => contains([item.name, item.slug, item.category, item.shortDescription], query)).slice(0, 10) : [];
  const team = query ? content.team.filter((item) => contains([item.name, item.fullName, item.publicRole], query)).slice(0, 10) : [];
  const pages = query ? (content.pages ?? []).filter((item) => contains([item.id, item.title, item.description, item.seoTitle], query)).slice(0, 10) : [];
  const vouchers = query ? (content.vouchers ?? []).filter((item) => contains([item.title, item.description, item.badge, item.terms], query)).slice(0, 10) : [];
  const resultCount = bookings.length + services.length + team.length + pages.length + vouchers.length;

  return (
    <>
      <CmsPageHeader description="Find booking references, treatments, vouchers, people and page content from one permission-aware search." eyebrow="Workspace" title="CMS search" />
      <CmsPanel>
        <form className={styles.searchForm}><label className={styles.fullSearch}>Search the CMS<input autoFocus defaultValue={query} maxLength={100} name="q" placeholder="Reference, guest, treatment, voucher, page or team member" required type="search" /></label><button type="submit"><Search aria-hidden="true" /> Search</button></form>
        {query ? <p className={styles.resultSummary}>{resultCount} result{resultCount === 1 ? "" : "s"} for “{query}”.</p> : null}
      </CmsPanel>

      {query && resultCount ? (
        <div className={styles.detailGrid}>
          {canCmsRole(user.role, "bookings:view") ? <CmsPanel title={`Bookings · ${bookings.length}`}><ul className={styles.activityList}>{bookings.slice(0, 10).map((booking) => <li key={booking.id}><CalendarDays aria-hidden="true" /><div><strong>{booking.reference} · {booking.customer.name}</strong><span>{booking.localDate} {booking.localTime} · {booking.serviceName}</span></div><Link className={styles.miniLink} href={`/cms/bookings/${booking.id}`}>Open</Link></li>)}</ul></CmsPanel> : null}
          <CmsPanel title={`Treatments · ${services.length}`}><ul className={styles.activityList}>{services.map((service) => <li key={service.id}><Sparkles aria-hidden="true" /><div><strong>{service.name}</strong><span>{service.status} · {service.slug}</span></div><Link className={styles.miniLink} href={canEditContent ? `/cms/services/${service.id}/edit` : "/cms/services"}>Open</Link></li>)}</ul></CmsPanel>
          <CmsPanel title={`Vouchers · ${vouchers.length}`}><ul className={styles.activityList}>{vouchers.map((voucher) => <li key={voucher.id}><Gift aria-hidden="true" /><div><strong>{voucher.title}</strong><span>€{voucher.amountCents / 100} · {voucher.status}</span></div><Link className={styles.miniLink} href={canEditContent ? `/cms/vouchers/${voucher.id}/edit` : "/cms/vouchers"}>Open</Link></li>)}</ul></CmsPanel>
          <CmsPanel title={`Pages · ${pages.length}`}><ul className={styles.activityList}>{pages.map((page) => <li key={page.id}><FileText aria-hidden="true" /><div><strong>{page.title}</strong><span>{page.id} page</span></div><Link className={styles.miniLink} href={canEditContent ? `/cms/pages/${page.id}/edit` : "/cms/pages"}>Open</Link></li>)}</ul></CmsPanel>
          <CmsPanel title={`Team · ${team.length}`}><ul className={styles.activityList}>{team.map((member) => <li key={member.id}><Users aria-hidden="true" /><div><strong>{member.fullName}</strong><span>{member.publicRole}</span></div><Link className={styles.miniLink} href={canEditContent ? `/cms/team/${member.id}/edit` : "/cms/team"}>Open</Link></li>)}</ul></CmsPanel>
        </div>
      ) : query ? <CmsEmptyState title="No CMS results">Try a shorter name, booking reference, voucher, page title or treatment.</CmsEmptyState> : null}
    </>
  );
}
