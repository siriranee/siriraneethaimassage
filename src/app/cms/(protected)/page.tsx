import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { CmsBookingStatus } from "@/components/cms/CmsBookingStatus";
import {
  CmsNotice,
  CmsPageHeader,
  CmsPanel,
  CmsPrimaryLink,
  CmsStatCard,
} from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsDashboardData } from "@/server/cms/read-service";

import styles from "@/components/cms/CmsViews.module.css";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export default async function CmsDashboardPage() {
  await requireCmsPageUser("dashboard:view");
  const { content, summary, upcoming } = await getCmsDashboardData();

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/bookings/new">Add booking</CmsPrimaryLink>}
        description="Review upcoming appointments, content health and the remaining setup work from one calm overview."
        eyebrow="Workspace overview"
        title="Good to see you."
      />

      {!content.bookingSettings.rulesConfirmed || !content.site.openingHoursConfirmed ? (
        <CmsNotice tone="warning" title="Public date and time booking remains safely off">
          Opening hours and booking rules are still mock values. The contact-led
          booking journey stays active until the owner confirms them.
        </CmsNotice>
      ) : null}

      {summary.expiredPendingCount ? (
        <CmsNotice tone="warning" title="Expired public booking holds need review">
          {summary.expiredPendingCount} pending request{summary.expiredPendingCount === 1 ? " has" : "s have"} released its temporary capacity. Review the booking before confirming it; confirmation rechecks the slot against current availability.
        </CmsNotice>
      ) : null}

      <div className={styles.statGrid}>
        <CmsStatCard detail="Appointments on the Dublin calendar" icon={CalendarDays} label="Today" tone="purple" value={summary.todayCount} />
        <CmsStatCard detail="Awaiting internal confirmation" icon={ClipboardList} label="Pending" tone="gold" value={summary.pendingCount} />
        <CmsStatCard detail="Future active appointments" icon={CalendarClock} label="Upcoming" tone="green" value={summary.upcomingCount} />
      </div>

      <div className={styles.twoColumn}>
        <CmsPanel title="Upcoming appointments" description="Times are shown in Europe/Dublin.">
          {upcoming.length ? (
            <>
              <div className={`${styles.tableScroll} ${styles.desktopTable}`}>
                <table className={styles.table}>
                  <caption className="sr-only">Upcoming Siriranee appointments</caption>
                  <thead>
                    <tr>
                      <th scope="col">Booking</th>
                      <th scope="col">Date and time</th>
                      <th scope="col">Treatment</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.map((booking) => (
                      <tr key={booking.id}>
                        <td><Link href={`/cms/bookings/${booking.id}`}><code>{booking.reference}</code></Link><small>{booking.customer.name}</small></td>
                        <td><strong>{formatDate(booking.localDate)}</strong><small>{booking.localTime}</small></td>
                        <td><strong>{booking.serviceName}</strong><small>{booking.durationMinutes} min · €{(booking.priceCents / 100).toFixed(0)}</small></td>
                        <td><CmsBookingStatus status={booking.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.mobileRecords}>
                {upcoming.map((booking) => (
                  <article className={styles.recordCard} key={booking.id}>
                    <div className={styles.recordCardHeader}>
                      <strong>{booking.reference}</strong>
                      <CmsBookingStatus status={booking.status} />
                    </div>
                    <dl>
                      <dt>Guest</dt><dd>{booking.customer.name}</dd>
                      <dt>When</dt><dd>{formatDate(booking.localDate)} · {booking.localTime}</dd>
                      <dt>Treatment</dt><dd>{booking.serviceName}</dd>
                    </dl>
                    <Link href={`/cms/bookings/${booking.id}`}>View booking</Link>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className={styles.recordCard}>No upcoming appointments.</div>
          )}
        </CmsPanel>

        <CmsPanel title="Production readiness" description="Owner decisions and provider setup still required.">
          <ul className={styles.checklist}>
            <li>
              <CheckCircle2 aria-hidden="true" />
              <div><strong>{summary.activeServiceCount} published treatments</strong><span>Current prices and durations are loaded.</span></div>
            </li>
            <li>
              {content.site.openingHoursConfirmed ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
              <div><strong>Opening hours</strong><span>{content.site.openingHoursConfirmed ? "Confirmed by the owner." : "Mock hours need owner confirmation."}</span></div>
            </li>
            <li>
              {content.bookingSettings.rulesConfirmed ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
              <div><strong>Booking rules</strong><span>{content.bookingSettings.rulesConfirmed ? "Capacity and notice rules confirmed." : "Capacity, notice and cancellation rules are provisional."}</span></div>
            </li>
            <li>
              <Sparkles aria-hidden="true" />
              <div><strong>Customer experience</strong><span>Customers choose a treatment, date and time.</span></div>
            </li>
          </ul>
        </CmsPanel>
      </div>
    </>
  );
}
