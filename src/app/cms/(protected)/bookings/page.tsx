import { Plus, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { CmsBookingQuickActions } from "@/components/cms/CmsBookingQuickActions";
import { CmsBookingStatus } from "@/components/cms/CmsBookingStatus";
import { CmsEmptyState, CmsPageHeader, CmsPanel, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { isPendingCapacityExpired } from "@/domain/booking/status";
import { canCmsRole } from "@/domain/cms/permissions";
import { bookingSources, bookingStatuses, type BookingSource, type BookingStatus, type CmsBooking } from "@/domain/cms/types";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";
import { listCmsBookings } from "@/server/cms/read-service";

import styles from "@/components/cms/CmsViews.module.css";

type PageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function isBookingStatus(value: string): value is BookingStatus {
  return bookingStatuses.some((status) => status === value);
}

function isBookingSource(value: string): value is BookingSource {
  return bookingSources.some((source) => source === value);
}

function safeDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function BookingStatusCell({ booking }: Readonly<{ booking: CmsBooking }>) {
  const expired = isPendingCapacityExpired(booking);

  return (
    <div className={styles.bookingStatusCell}>
      <CmsBookingStatus status={booking.status} />
      {expired ? <small className={styles.expiredHold}>Temporary hold expired</small> : null}
    </div>
  );
}

export default async function CmsBookingsPage({ searchParams }: PageProps) {
  const user = await requireCmsPageUser("bookings:view");
  const canManageBookings = canCmsRole(user.role, "bookings:write");
  const params = await searchParams;
  const search = single(params.search).trim();
  const statusValue = single(params.status);
  const status = isBookingStatus(statusValue) ? statusValue : undefined;
  const sourceValue = single(params.source);
  const source = isBookingSource(sourceValue) ? sourceValue : undefined;
  const serviceId = single(params.serviceId).trim() || undefined;
  const attentionValue = single(params.attention);
  const attention = attentionValue === "expired" ? attentionValue : undefined;
  const from = safeDate(single(params.from));
  const to = safeDate(single(params.to));
  const [bookings, content] = await Promise.all([
    listCmsBookings({ search: search || undefined, status, source, serviceId, attention, from, to }),
    getCmsContent(),
  ]);
  const hasActiveFilters = Boolean(
    search || status || source || serviceId || attention || from || to,
  );

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/bookings/new"><Plus aria-hidden="true" /> Add booking</CmsPrimaryLink>}
        description="Search appointments, review their status and open any booking that needs attention."
        eyebrow="Booking operations"
        title="Bookings"
      />

      <CmsPanel>
        <details className={styles.searchDisclosure} open={hasActiveFilters || undefined}>
          <summary>
            <span>
              <SlidersHorizontal aria-hidden="true" />
              Search &amp; filters
            </span>
            <small>{hasActiveFilters ? "Filters applied" : "Show filters"}</small>
          </summary>
          <form className={styles.searchForm}>
            <label>
              Search bookings
              <input defaultValue={search} name="search" placeholder="Reference, guest, phone or treatment" type="search" />
            </label>
            <label>
              Status
              <select defaultValue={status ?? ""} name="status">
                <option value="">All statuses</option>
                {bookingStatuses.map((item) => (
                  <option key={item} value={item}>{item === "no-show" ? "No-show" : item.charAt(0).toUpperCase() + item.slice(1)}</option>
                ))}
              </select>
            </label>
            <label>Treatment<select defaultValue={serviceId ?? ""} name="serviceId"><option value="">All treatments</option>{content.services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
            <label>Source<select defaultValue={source ?? ""} name="source"><option value="">All sources</option>{bookingSources.map((item) => <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>)}</select></label>
            <label>Needs attention<select defaultValue={attention ?? ""} name="attention"><option value="">All bookings</option><option value="expired">Expired pending holds</option></select></label>
            <label>From date<input defaultValue={from ?? ""} name="from" type="date" /></label>
            <label>To date<input defaultValue={to ?? ""} name="to" type="date" /></label>
            <div className={styles.filterActions}><button type="submit">Apply filters</button><Link href="/cms/bookings">Clear</Link></div>
          </form>
        </details>

        {bookings.length ? (
          <div aria-label="Siriranee bookings" className={styles.bookingGrid}>
            {bookings.map((booking) => (
              <article className={styles.bookingCard} key={booking.id}>
                <header className={styles.bookingCardHeader}>
                  <div>
                    <code>{booking.reference}</code>
                    <small>
                      {booking.source.charAt(0).toUpperCase() + booking.source.slice(1)}
                      {booking.demo ? " · Fictional mock" : ""}
                    </small>
                  </div>
                  <BookingStatusCell booking={booking} />
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
          <CmsEmptyState title="No bookings found">
            Try a different search or status filter, or add a booking received by phone or WhatsApp.
          </CmsEmptyState>
        )}
      </CmsPanel>
    </>
  );
}
