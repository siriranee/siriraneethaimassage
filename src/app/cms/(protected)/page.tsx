import {
  CalendarClock,
  CalendarDays,
  ClipboardList,
} from "lucide-react";
import Link from "next/link";

import { CmsBookingQuickActions } from "@/components/cms/CmsBookingQuickActions";
import { CmsBookingStatus } from "@/components/cms/CmsBookingStatus";
import {
  CmsEmptyState,
  CmsPageHeader,
  CmsPanel,
  CmsPrimaryLink,
  CmsStatCard,
} from "@/components/cms/CmsUi";
import { canCmsRole } from "@/domain/cms/permissions";
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
  const user = await requireCmsPageUser("dashboard:view");
  const canManageBookings = canCmsRole(user.role, "bookings:write");
  const { summary, upcoming } = await getCmsDashboardData();

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/bookings/new">Add booking</CmsPrimaryLink>}
        description="Review upcoming appointments from one calm overview."
        eyebrow="Workspace overview"
        title="Good to see you."
      />

      <div className={styles.statGrid}>
        <CmsStatCard detail="Appointments on the Dublin calendar" icon={CalendarDays} label="Today" tone="purple" value={summary.todayCount} />
        <CmsStatCard detail="Awaiting internal confirmation" icon={ClipboardList} label="Pending" tone="gold" value={summary.pendingCount} />
        <CmsStatCard detail="Future active appointments" icon={CalendarClock} label="Upcoming" tone="green" value={summary.upcomingCount} />
      </div>

      <CmsPanel title="Upcoming appointments" description="Times are shown in Europe/Dublin.">
        {upcoming.length ? (
          <div aria-label="Upcoming Siriranee appointments" className={styles.bookingGrid}>
            {upcoming.map((booking) => (
              <article className={styles.bookingCard} key={booking.id}>
                <header className={styles.bookingCardHeader}>
                  <div>
                    <code>{booking.reference}</code>
                    <small>
                      {booking.source.charAt(0).toUpperCase() + booking.source.slice(1)}
                      {booking.demo ? " · Fictional mock" : ""}
                    </small>
                  </div>
                  <CmsBookingStatus status={booking.status} />
                </header>

                <div className={styles.bookingCardPrimary}>
                  <h2>{booking.customer.name}</h2>
                  <p>{formatDate(booking.localDate)} · {booking.localTime}</p>
                </div>

                <dl className={styles.bookingCardDetails}>
                  <div><dt>Treatment</dt><dd>{booking.serviceName}</dd></div>
                  <div><dt>Duration</dt><dd>{booking.durationMinutes} min</dd></div>
                  <div><dt>Phone</dt><dd>{booking.customer.phone}</dd></div>
                  <div className={styles.bookingCardNotes}>
                    <dt>Notes</dt>
                    <dd>{booking.customer.notes || "No notes provided"}</dd>
                  </div>
                </dl>

                <footer className={styles.bookingCardFooter}>
                  <Link href={`/cms/bookings/${booking.id}`}>View</Link>
                  {canManageBookings ? (
                    <CmsBookingQuickActions
                      booking={booking}
                      key={`${booking.id}:${booking.version}`}
                    />
                  ) : null}
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <CmsEmptyState title="No upcoming appointments">
            New confirmed and pending appointments will appear here.
          </CmsEmptyState>
        )}
      </CmsPanel>
    </>
  );
}
