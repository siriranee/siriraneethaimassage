import type { Metadata } from "next";

import { PageHero } from "@/components/marketing/PageHero";
import { bookingPrivacyNotice } from "@/domain/privacy";
import { createMetadata } from "@/lib/metadata";
import { getPublicPageCopy, getPublicSiteData } from "@/server/cms/public-adapter";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublicPageCopy("privacy");
  return createMetadata({ title: page.seoTitle, description: page.seoDescription, path: "/privacy" });
}

export default async function PrivacyPage() {
  const [site, pageCopy] = await Promise.all([getPublicSiteData(), getPublicPageCopy("privacy")]);
  const email = site.contact.email;

  return (
    <div>
      <PageHero
        compact
        eyebrow={pageCopy.eyebrow}
        title={pageCopy.title}
        description={pageCopy.description}
      />
      <article className={`container ${styles.article}`}>
        <p className={styles.updated}>
          Last updated: {bookingPrivacyNotice.updatedLabel}
        </p>

        <section>
          <h2>Who this notice is about</h2>
          <p>
            This notice describes how {site.name} uses personal information
            connected with this website and appointment requests. Siriranee Thai
            Massage is responsible for deciding why and how that information is
            used.
          </p>
          <p>
            Direct website booking remains disabled until the owner has approved
            the final retention period, lawful basis, service-provider list and
            operational process. While it is disabled, the booking page stores no
            personal information and directs you to contact the spa.
          </p>
        </section>

        <section>
          <h2>Appointment information</h2>
          <p>
            When direct website booking is enabled, the form asks for your name,
            phone number, optional email address, optional notes, selected
            treatment, duration, date and time. It also records when you accepted
            this version of the privacy notice and limited technical information
            used to prevent abuse.
          </p>
          <p>
            This information is used to review, confirm, change and administer your
            appointment, contact you about the request, protect booking
            availability and maintain an operational record. Staff assignment is
            handled internally and is not chosen by customers.
          </p>
        </section>

        <section>
          <h2>Storage, access and retention</h2>
          <p>
            Booking contact details are encrypted before they are stored. Access is
            limited to authorised Siriranee administrators and staff who need the
            information to manage appointments. Hosting, database, notification and
            support providers may process limited information only when configured
            for this service.
          </p>
          <p>
            The owner must set and publish the final retention period before direct
            booking is enabled. Records will then be kept only for the confirmed
            operational, legal and accounting period, after which they will be
            securely deleted or anonymised. Provider names and any international
            transfer safeguards must also be added once the production services are
            selected.
          </p>
        </section>

        <section>
          <h2>Your choices and rights</h2>
          <p>
            Depending on the circumstances, you may ask for access to your personal
            information, correction, deletion, restriction, portability or an
            objection to certain processing. You may also raise a concern with
            Ireland&apos;s Data Protection Commission.
          </p>
          <p>
            The final production notice must state the owner-confirmed legal basis
            for each use of appointment information. Accepting this notice confirms
            that you have read it; it is not used as a substitute for a legal basis
            where another basis applies.
          </p>
        </section>

        <section>
          <h2>External links, maps and cookies</h2>
          <p>
            The site links to Google Maps and may display owner-confirmed booking,
            social, review or messaging links. Those services have their own
            privacy practices. The interactive map and any external scheduler load
            only after you choose to open them.
          </p>
          <p>
            No advertising or analytics cookies are intentionally set by this
            version of the website. Essential hosting and security infrastructure
            may process request information such as IP address, browser details and
            server logs.
          </p>
        </section>

        <section>
          <h2>Questions or requests</h2>
          <p>
            {email ? (
              <>
                For a privacy question or request, email{" "}
                <a href={email.href}>{email.address}</a> or call{" "}
              </>
            ) : (
              <>For a privacy question or request, call </>
            )}
            <a href={site.contact.phone.href}>
              {site.contact.phone.internationalDisplay}
            </a>
            .
          </p>
          <p>
            This implementation-ready draft still requires owner and, where
            appropriate, legal review before direct online booking is switched on.
          </p>
        </section>
      </article>
    </div>
  );
}
