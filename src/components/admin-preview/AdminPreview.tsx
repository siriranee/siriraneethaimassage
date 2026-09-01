import {
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDashed,
  Clock3,
  Database,
  ExternalLink,
  Eye,
  FileText,
  Globe2,
  LayoutDashboard,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";

import { services } from "@/content/services";
import { siteConfig } from "@/content/site";
import { teamMembers } from "@/content/team";
import { BrandMark } from "@/components/ui/BrandMark";

import styles from "./AdminPreview.module.css";

const navigation = [
  { href: "#overview", label: "Overview", icon: LayoutDashboard },
  { href: "#bookings", label: "Bookings", icon: CalendarDays },
  { href: "#calendar", label: "Calendar", icon: Clock3 },
  { href: "#services", label: "Services", icon: Sparkles },
  { href: "#content", label: "Website content", icon: FileText },
  { href: "#settings", label: "Settings", icon: Settings },
] as const;

const demoBookings = [
  {
    reference: "DEMO-001",
    guest: "Demo guest A",
    service: services[0].name,
    time: "Example · 10:00",
    status: "Confirmed",
  },
  {
    reference: "DEMO-002",
    guest: "Demo guest B",
    service: services[2].name,
    time: "Example · 12:00",
    status: "Pending",
  },
  {
    reference: "DEMO-003",
    guest: "Demo guest C",
    service: services[4].name,
    time: "Example · 15:00",
    status: "Confirmed",
  },
] as const;

const sampleTimeRows = [
  { time: "10:00", states: ["Demo booking", "Available", "Available", "Available"] },
  { time: "11:00", states: ["Available", "Demo booking", "Available", "Available"] },
  { time: "12:00", states: ["Blocked", "Available", "Available", "Demo booking"] },
  { time: "13:00", states: ["Available", "Available", "Available", "Available"] },
  { time: "14:00", states: ["Available", "Available", "Demo booking", "Available"] },
] as const;

function formatPrice(service: (typeof services)[number]) {
  const firstPrice = service.pricing[0];
  if (!firstPrice) {
    return "Live price not stored";
  }

  return `From €${firstPrice.priceEur}`;
}

function PrototypeAction({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <button
      aria-describedby="prototype-notice"
      className={styles.disabledAction}
      disabled
      type="button"
    >
      {children}
    </button>
  );
}

export function AdminPreview() {
  return (
    <div className={styles.adminCanvas} data-admin-preview>
      <aside className={styles.sidebar}>
        <Link aria-label="Return to the Siriranee website" className={styles.brand} href="/">
          <BrandMark />
        </Link>

        <div className={styles.workspaceLabel}>
          <span>Admin workspace</span>
          <strong>Interface prototype</strong>
        </div>

        <nav aria-label="Admin prototype sections" className={styles.navigation}>
          {navigation.map(({ href, icon: Icon, label }, index) => (
            <a className={index === 0 ? styles.activeNav : undefined} href={href} key={href}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </a>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.adminIdentity}>
            <span aria-hidden="true">ST</span>
            <div>
              <strong>Siriranee</strong>
              <small>Preview role</small>
            </div>
          </div>
          <Link href="/">
            <ExternalLink aria-hidden="true" />
            View website
          </Link>
        </div>
      </aside>

      <div className={styles.workspace}>
        <div className={styles.prototypeBanner} id="prototype-notice" role="note">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>Prototype only — no customer data is stored</strong>
            <span>Controls are disabled and sample rows are fictional.</span>
          </div>
        </div>

        <header className={styles.mobileHeader}>
          <BrandMark compact />
          <span>Admin prototype</span>
        </header>

        <nav aria-label="Admin prototype mobile sections" className={styles.mobileNavigation}>
          {navigation.map(({ href, label }) => (
            <a href={href} key={href}>
              {label}
            </a>
          ))}
        </nav>

        <div className={styles.main}>
          <section className={styles.section} id="overview">
            <div className={styles.pageHeader}>
              <div>
                <span className={styles.kicker}>Workspace preview</span>
                <h1>Admin dashboard</h1>
                <p>
                  A calm, practical concept for managing the website and reviewing
                  provider-backed appointments in one place.
                </p>
              </div>
              <div className={styles.headerTools} aria-label="Prototype toolbar">
                <span className={styles.searchMockup}>
                  <Search aria-hidden="true" />
                  Search preview
                </span>
                <span className={styles.iconMockup} aria-label="Notifications unavailable">
                  <Bell aria-hidden="true" />
                </span>
                <PrototypeAction>
                  <Plus aria-hidden="true" /> New booking
                </PrototypeAction>
              </div>
            </div>

            <div className={styles.statGrid}>
              <article className={styles.statCard}>
                <div className={`${styles.statIcon} ${styles.statIconPurple}`}>
                  <CalendarDays aria-hidden="true" />
                </div>
                <span>Provider bookings</span>
                <strong>—</strong>
                <small>Provider connection required</small>
              </article>
              <article className={styles.statCard}>
                <div className={`${styles.statIcon} ${styles.statIconGold}`}>
                  <Sparkles aria-hidden="true" />
                </div>
                <span>Services in website content</span>
                <strong>{services.length}</strong>
                <small>Read from the current service catalogue</small>
              </article>
              <article className={styles.statCard}>
                <div className={`${styles.statIcon} ${styles.statIconGreen}`}>
                  <Users aria-hidden="true" />
                </div>
                <span>Therapists in website content</span>
                <strong>{teamMembers.length}</strong>
                <small>Roster requires owner confirmation</small>
              </article>
              <article className={styles.statCard}>
                <div className={`${styles.statIcon} ${styles.statIconLavender}`}>
                  <Database aria-hidden="true" />
                </div>
                <span>Customer records stored</span>
                <strong>0</strong>
                <small>This prototype has no database</small>
              </article>
            </div>
          </section>

          <section className={styles.section} id="bookings">
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.kicker}>Booking management mockup</span>
                <h2>Appointment overview</h2>
                <p>Fictional rows illustrate the intended layout without using customer data.</p>
              </div>
              <div className={styles.sectionActions}>
                <span className={styles.demoBadge}>Demo data</span>
                <PrototypeAction>
                  <Plus aria-hidden="true" /> Add appointment
                </PrototypeAction>
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelToolbar}>
                <div>
                  <strong>Sample booking list</strong>
                  <span>Contact details intentionally excluded</span>
                </div>
                <span className={styles.filterMockup}>All statuses</span>
              </div>
              <div className={styles.tableScroller}>
                <table className={styles.bookingTable}>
                  <thead>
                    <tr>
                      <th scope="col">Reference</th>
                      <th scope="col">Guest</th>
                      <th scope="col">Treatment</th>
                      <th scope="col">Time</th>
                      <th scope="col">Status</th>
                      <th scope="col"><span className="sr-only">Preview action</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {demoBookings.map((booking) => (
                      <tr key={booking.reference}>
                        <td><code>{booking.reference}</code></td>
                        <td>
                          <strong>{booking.guest}</strong>
                          <small>Fictional sample</small>
                        </td>
                        <td>{booking.service}</td>
                        <td>{booking.time}</td>
                        <td>
                          <span
                            className={
                              booking.status === "Confirmed"
                                ? styles.confirmedStatus
                                : styles.pendingStatus
                            }
                          >
                            {booking.status}
                          </span>
                        </td>
                        <td>
                          <span className={styles.rowAction} aria-label="Preview details unavailable">
                            <Eye aria-hidden="true" />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className={styles.section} id="calendar">
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.kicker}>Availability mockup</span>
                <h2>Appointment calendar</h2>
                <p>A sample schedule only. It is not connected to provider availability.</p>
              </div>
              <span className={styles.sourceBadge}>
                <CircleDashed aria-hidden="true" /> Provider not connected
              </span>
            </div>

            <div className={styles.calendarPanel}>
              <div className={styles.calendarHeader}>
                <div>
                  <span>Example day</span>
                  <strong>Illustrative schedule</strong>
                </div>
                <div className={styles.legend} aria-label="Calendar legend">
                  <span><i className={styles.legendAvailable} />Available</span>
                  <span><i className={styles.legendBooked} />Demo booking</span>
                  <span><i className={styles.legendBlocked} />Blocked</span>
                </div>
              </div>
              <div className={styles.calendarScroller}>
                <div className={styles.calendarGrid}>
                  <div className={styles.cornerCell}>Time</div>
                  {teamMembers.map((member) => (
                    <div className={styles.therapistHeading} key={member.slug}>
                      <span aria-hidden="true">{member.name.slice(0, 1)}</span>
                      <strong>{member.name}</strong>
                    </div>
                  ))}
                  {sampleTimeRows.map((row) => (
                    <div className={styles.calendarRow} key={row.time}>
                      <time>{row.time}</time>
                      {row.states.map((state, index) => (
                        <span
                          className={
                            state === "Available"
                              ? styles.availableSlot
                              : state === "Blocked"
                                ? styles.blockedSlot
                                : styles.bookedSlot
                          }
                          key={`${row.time}-${teamMembers[index]?.slug ?? index}`}
                        >
                          {state}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.calendarNote}>
                <Clock3 aria-hidden="true" />
                Production times must come from the booking provider and display in {siteConfig.timeZone}.
              </div>
            </div>
          </section>

          <section className={styles.section} id="services">
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.kicker}>Service editor mockup</span>
                <h2>Treatments and prices</h2>
                <p>These cards reflect the website catalogue; editing remains disabled.</p>
              </div>
              <PrototypeAction>
                <Plus aria-hidden="true" /> Add service
              </PrototypeAction>
            </div>

            <div className={styles.serviceGrid}>
              {services.map((service) => (
                <article className={styles.serviceCard} key={service.slug}>
                  <div className={styles.serviceCardTop}>
                    <span>{service.category.replaceAll("-", " ")}</span>
                    <span className={styles.publishedBadge}>
                      <Check aria-hidden="true" /> In website content
                    </span>
                  </div>
                  <h3>{service.name}</h3>
                  <p>{service.shortDescription}</p>
                  <dl>
                    <div>
                      <dt>Duration</dt>
                      <dd>{service.durations.join(" / ")}</dd>
                    </div>
                    <div>
                      <dt>Price</dt>
                      <dd>{formatPrice(service)}</dd>
                    </div>
                  </dl>
                  <div className={styles.cardFooter}>
                    <Link href={`/services/${service.slug}`}>
                      <Eye aria-hidden="true" /> View page
                    </Link>
                    <span aria-label="Editing unavailable">
                      <Pencil aria-hidden="true" /> Edit mockup
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.section} id="content">
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.kicker}>Content management mockup</span>
                <h2>Website information</h2>
                <p>Verified public facts are shown here as a future editing workflow.</p>
              </div>
              <PrototypeAction>
                <Pencil aria-hidden="true" /> Edit content
              </PrototypeAction>
            </div>

            <div className={styles.contentGrid}>
              <article className={styles.contentCard}>
                <div className={styles.contentIcon}><MapPin aria-hidden="true" /></div>
                <div>
                  <span>Location</span>
                  <h3>Visit information</h3>
                  <p>{siteConfig.address.formatted}</p>
                  <a href={siteConfig.address.directionsUrl} target="_blank" rel="noreferrer">
                    Open map <ExternalLink aria-hidden="true" />
                  </a>
                </div>
              </article>
              <article className={styles.contentCard}>
                <div className={styles.contentIcon}><Phone aria-hidden="true" /></div>
                <div>
                  <span>Contact</span>
                  <h3>Public details</h3>
                  <p>
                    Phone pending owner confirmation
                    <br />
                    {siteConfig.contact.email?.address ?? "Email pending owner confirmation"}
                  </p>
                  <small>Confirm with the owner before changing.</small>
                </div>
              </article>
              <article className={styles.contentCard}>
                <div className={styles.contentIcon}><Clock3 aria-hidden="true" /></div>
                <div>
                  <span>Opening hours</span>
                  <h3>Schedule pending confirmation</h3>
                  <p>Exact public hours remain hidden until the owner reviews and publishes them.</p>
                </div>
              </article>
              <article className={styles.contentCard}>
                <div className={styles.contentIcon}><Globe2 aria-hidden="true" /></div>
                <div>
                  <span>Search preview</span>
                  <h3>{siteConfig.seo.homeTitle}</h3>
                  <p>{siteConfig.seo.homeDescription}</p>
                  <small>English only · Local focus: Howth and nearby Dublin areas</small>
                </div>
              </article>
            </div>
          </section>

          <section className={styles.section} id="settings">
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.kicker}>Configuration mockup</span>
                <h2>Settings and integrations</h2>
                <p>Provider, security and recovery decisions are required before implementation.</p>
              </div>
            </div>

            <div className={styles.settingsLayout}>
              <div className={styles.settingsPanel}>
                <h3>Business settings</h3>
                <div className={styles.settingRow}>
                  <div>
                    <span>Website language</span>
                    <strong>English (Ireland)</strong>
                  </div>
                  <span className={styles.readOnlyBadge}>Read only</span>
                </div>
                <div className={styles.settingRow}>
                  <div>
                    <span>Business time zone</span>
                    <strong>{siteConfig.timeZone}</strong>
                  </div>
                  <span className={styles.readOnlyBadge}>Read only</span>
                </div>
                <div className={styles.settingRow}>
                  <div>
                    <span>Currency</span>
                    <strong>{siteConfig.currency}</strong>
                  </div>
                  <span className={styles.readOnlyBadge}>Read only</span>
                </div>
              </div>

              <div className={styles.settingsPanel}>
                <h3>Integration status</h3>
                <div className={styles.integrationRow}>
                  <div className={styles.integrationIcon}><CalendarDays aria-hidden="true" /></div>
                  <div>
                    <strong>Siriranee booking provider</strong>
                    <span>Awaiting owner configuration</span>
                  </div>
                  <span className={styles.notConnectedBadge}>Not connected</span>
                </div>
                <div className={styles.integrationRow}>
                  <div className={styles.integrationIcon}><MapPin aria-hidden="true" /></div>
                  <div>
                    <strong>Google Maps</strong>
                    <span>Public directions link</span>
                  </div>
                  <span className={styles.connectedBadge}>Available</span>
                </div>
                <div className={styles.integrationRow}>
                  <div className={styles.integrationIcon}><Database aria-hidden="true" /></div>
                  <div>
                    <strong>Admin database</strong>
                    <span>No provider selected</span>
                  </div>
                  <span className={styles.notConnectedBadge}>Not connected</span>
                </div>
              </div>
            </div>

            <div className={styles.productionGate}>
              <div className={styles.gateIcon}><ShieldCheck aria-hidden="true" /></div>
              <div>
                <span>Production gate</span>
                <h3>This interface must not be used for real bookings yet.</h3>
                <p>
                  A production admin requires reviewed authentication, permissions,
                  provider synchronisation, collision control, privacy, audit history,
                  backups and recovery before customer information can be accepted.
                </p>
              </div>
              <ChevronRight aria-hidden="true" className={styles.gateArrow} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
