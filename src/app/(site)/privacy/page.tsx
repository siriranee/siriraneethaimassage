import type { Metadata } from "next";

import { PageHero } from "@/components/marketing/PageHero";
import { getPageCopy } from "@/content/page-copy";
import { pageHeroImages } from "@/content/page-heroes";
import { bookingPrivacyNotice } from "@/domain/privacy";
import { createMetadata } from "@/lib/metadata";
import { getPublicSiteData } from "@/server/cms/public-adapter";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const page = getPageCopy("privacy");
  return createMetadata({ title: page.seoTitle, description: page.seoDescription, path: "/privacy" });
}

export default async function PrivacyPage() {
  const pageCopy = getPageCopy("privacy");
  const site = await getPublicSiteData();
  const phone = site.contact.phone;
  const email = site.contact.email;

  return (
    <div>
      <PageHero
        {...pageHeroImages.about}
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
            Direct website booking is enabled only after the owner has approved
            the retention period, lawful basis, service-provider list and
            operational process. While it is disabled, the booking page stores no
            personal information and shows only the options currently available.
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
            availability and maintain an operational record.
          </p>
        </section>

        <section>
          <h2>Storage, access and retention</h2>
          <p>
            Booking contact details are encrypted before they are stored. Access is
            limited to authorised Siriranee administrators and staff who need the
            information to manage appointments. MongoDB stores the encrypted
            booking record. After a website request is stored, Resend processes the
            appointment and contact details needed to deliver an operational email
            notification to the owner, including any optional notes supplied with
            the request. Hosting and support providers may process limited
            information only when configured for this service.
          </p>
          <p>
            Booking records are retained for two years after the appointment and
            then deleted automatically. Operational notification records and CMS
            audit records are retained for one year. A new pending request reserves
            appointment capacity for 15 minutes unless it is confirmed; after that,
            it stops blocking the time slot while the booking record follows the
            two-year retention period. Provider systems may apply their own
            documented retention periods.
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
            {email && phone ? (
              <>
                For a privacy question or request, email{" "}
                <a href={email.href}>{email.address}</a> or call{" "}
                <a href={phone.href}>{phone.internationalDisplay}</a>.
              </>
            ) : email ? (
              <>
                For a privacy question or request, email{" "}
                <a href={email.href}>{email.address}</a>.
              </>
            ) : phone ? (
              <>
                For a privacy question or request, call{" "}
                <a href={phone.href}>{phone.internationalDisplay}</a>.
              </>
            ) : (
              <>
                Privacy contact details are being confirmed. Please check this
                page again before making a request.
              </>
            )}
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
