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
            connected with this website and appointments. Siriranee Thai
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
            phone number, email address, optional notes, selected
            treatment, massage therapist, duration, date and time. It also records when you accepted
            this version of the privacy notice and limited technical information
            used to prevent abuse.
          </p>
          <p>
            This information is used to confirm and administer your appointment,
            contact you about the booking, protect booking
            availability and maintain an operational record.
          </p>
        </section>

        <section>
          <h2>Storage, access and retention</h2>
          <p>
            Booking contact details are encrypted before they are stored. Access is
            limited to authorised Siriranee administrators and staff who need the
            information to manage appointments. MongoDB stores the encrypted
            booking record. For a newly confirmed website booking, the owner
            receives a CMS dashboard alert. Resend processes your name, email
            address, appointment details and published business details to send
            your confirmation email. It also sends the selected therapist an
            appointment email containing your name, phone number, email address,
            any optional booking note, and the booking reference, treatment,
            duration, date and time. Relevant appointment changes may generate
            further emails. Older requests that are still pending may have sent
            the owner and selected therapist a request email with a private link
            for reviewing and confirming the appointment. Opening that link alone
            does not confirm it, and its review page does not display your contact
            details or booking note. Internal CMS notes are not included in
            therapist emails or review pages. Therapist
            notification addresses and private phone numbers are stored separately
            from public profile content and encrypted in production. The customer
            confirmation does not include your notes or internal CMS notes.
            Hosting and support providers may process limited information
            only when configured for this service.
          </p>
          <p>
            Booking records are retained for two years after the appointment,
            or for two years after a historical appointment is recorded if that
            is later, and then deleted automatically. Operational notification records and CMS
            audit records are retained for one year. Newly confirmed website
            appointments block new bookings according to the shop&apos;s therapist
            and capacity settings. Older requests that remain pending do not
            reserve appointment capacity until they are confirmed.
            Provider systems may apply their own documented retention periods.
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
            If you accept analytics cookies, Google Analytics measures public
            page visits and successful website bookings so we can understand
            how the website is used. We send page paths without query strings
            and a booking event with the treatment and duration. We do
            not send your name, contact details, booking reference, appointment
            time or booking note as analytics event details. Google may set
            analytics cookies and process technical information under its own
            retention settings. Analytics is optional; choosing to reject it
            does not affect booking. You can change your choice using
            &ldquo;Analytics preferences&rdquo; in the footer. Essential hosting
            and security infrastructure may still process request information
            such as IP address, browser details and server logs.
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
            This notice should be reviewed and kept up to date as the booking
            process and service providers change.
          </p>
        </section>
      </article>
    </div>
  );
}
