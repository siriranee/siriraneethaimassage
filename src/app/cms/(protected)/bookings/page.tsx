import { Plus } from "lucide-react";
import Link from "next/link";

import { CmsBookingStatus } from "@/components/cms/CmsBookingStatus";
import { CmsEmptyState, CmsPageHeader, CmsPanel, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { isPendingCapacityExpired } from "@/domain/booking/status";
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
  await requireCmsPageUser("bookings:view");
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

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/bookings/new"><Plus aria-hidden="true" /> Add booking</CmsPrimaryLink>}
        description="Search appointments, review their status and open any booking that needs attention."
        eyebrow="Booking operations"
        title="Bookings"
      />

      <CmsPanel>
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

        <p className={styles.resultSummary}>{bookings.length} booking{bookings.length === 1 ? "" : "s"} in this view. Filters stay in the URL so this view can be bookmarked.</p>

        {bookings.length ? (
          <>
            <div className={`${styles.tableScroll} ${styles.desktopTable}`}>
              <table className={styles.table}>
                <caption className="sr-only">Siriranee bookings</caption>
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col">Guest</th>
                    <th scope="col">Appointment</th>
                    <th scope="col">Treatment</th>
                    <th scope="col">Status</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td><code>{booking.reference}</code>{booking.demo ? <small>Fictional mock</small> : null}</td>
                      <td><strong>{booking.customer.name}</strong><small>{booking.customer.phone}</small></td>
                      <td><strong>{formatDate(booking.localDate)}</strong><small>{booking.localTime} · {booking.durationMinutes} min</small></td>
                      <td>{booking.serviceName}</td>
                      <td><BookingStatusCell booking={booking} /></td>
                      <td><Link href={`/cms/bookings/${booking.id}`}>View</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.mobileRecords}>
              {bookings.map((booking) => (
                <article className={styles.recordCard} key={booking.id}>
                  <div className={styles.recordCardHeader}>
                    <strong>{booking.reference}</strong>
                    <BookingStatusCell booking={booking} />
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
          <CmsEmptyState title="No bookings found">
            Try a different search or status filter, or add a booking received by phone or WhatsApp.
          </CmsEmptyState>
        )}
      </CmsPanel>
    </>
  );
}
