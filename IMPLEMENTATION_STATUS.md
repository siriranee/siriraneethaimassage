# Siriranee Thai Massage implementation status

Updated: 3 September 2026

## Complete and validated

- Responsive English website for mobile, tablet and desktop.
- Exact brand name: **Siriranee Thai Massage**.
- Confirmed address: Floor 3, Harbour House, Harbour Road, Howth, Dublin,
  Ireland.
- Confirmed menu:
  - Traditional Thai Massage — 60 minutes €65 / 90 minutes €95
  - Hot Oil Massage — 60 minutes €65 / 90 minutes €95
  - Neck, Shoulder & Upper Back Massage — 30 minutes €40
  - Deep Tissue Massage — 60 minutes €65 / 90 minutes €95
  - Hot Stone Massage — 90 minutes €95
- Natural local coverage for Howth, Sutton, Malahide, Portmarnock, Clontarf,
  Raheny and Dublin.
- SEO metadata, canonical links, DaySpa and Service structured data, sitemap,
  robots rules, redirects and social previews.
- Click-to-load Google Maps, telephone links, and optional owner-configured
  email, WhatsApp, Instagram, Booksy and Google Review links.
- Secure username-and-password CMS authentication, administrator/staff
  permissions, session revocation, credential-pair/address throttling,
  account-abuse alerts and audit history.
- Audit records carry an exact 365-day expiry date and are removed by the
  MongoDB TTL index after one year.
- Create/edit/archive workflows for services, plus editable site information,
  hours and booking rules.
- Source-controlled page headings, SEO, home-hero slides and site gallery, plus
  CMS-managed service and voucher imagery with publication safety.
- Client-side raster validation and compression with local previews, size and
  dimension feedback, retry/remove controls and no upload on file selection.
- Signed direct Cloudinary image uploads with server-side provider verification,
  owned-folder enforcement, durable asset states, transactional content commit,
  and immediate conservative rollback when a content save fails.
- Image-only voucher management with draft, published and archived states,
  16:9 contained artwork and a navigation-free draggable public slider.
- CMS-managed public content reads immutable publication snapshots; page copy,
  the home hero and the site gallery remain source-controlled.
- Transactional direct publishing with record validation and immutable
  publication history; failed saves do not replace the live snapshot.
- Booking dashboard, URL-based booking filters, booking
  detail, controlled change reasons, per-booking audit timeline, status updates,
  rescheduling, bounded recurring closures and day/week/month calendar.
- Metadata-only notification activity records. New website requests create one
  owner-only Resend email after the booking transaction commits. The responsive
  email presents Thai first and English second, while recipient addresses and
  rendered message bodies are never copied into MongoDB. Optional customer
  notes remain in the encrypted booking record and are not copied into email.
- Public treatment/date/time booking backend with same-origin checks, bounded
  JSON, validation, rate limiting, idempotency and encrypted customer details.
- Privacy-preserving booking-status lookup by booking ID or reference; it
  exposes status copy only and keeps identifiers out of page URLs.
- Fully booked capacity checks with pending-hold expiry, closures, buffers,
  notice period, booking horizon and Europe/Dublin daylight-saving handling.
- Customers never see, submit or select a therapist, and booking management has
  no staff-assignment workflow. Privileged staff, calendar and price fields are
  rejected by the public booking API.
- Expired pending requests release capacity and are clearly flagged in the CMS.
- Automated TypeScript, lint, content, environment, availability, permission,
  security-contract and production-build checks.
- Sticky CMS navbar and responsive left navigation drawer. Retired CMS Pages,
  Media and Recovery screens are no longer routed; page copy and the public
  gallery are source-controlled.

## Safe defaults

- Local development without MongoDB configuration uses a fictional in-memory
  CMS and a one-click demo login.
- Hosted builds reject mock CMS mode.
- Production CMS is disabled without MongoDB configuration.
- Cloudinary uploads require MongoDB, complete server-only credentials and an
  independent CMS_MEDIA_UPLOAD_READY gate.
- Direct public booking requires MongoDB, confirmed hours and booking rules,
  a valid customer-data encryption key, complete valid Resend sender, recipient
  and API-key configuration, the CMS booking control and one deployment-level
  booking switch.
- Customer details are encrypted with AES-256-GCM before MongoDB storage.
- CMS and API responses containing private data are no-store.
- CMS routes are blocked from indexing.
- Provisional opening hours remain omitted from structured data.

## Operational items still requiring production sign-off

- Remaining public communication channels beyond the confirmed phone and WhatsApp number.
- Exact Eircode/map pin, entrance, lift, accessibility, parking and transport
  guidance.
- Team display details beyond the current supplied names.
- Illustrative spa imagery and final approval of generated treatment galleries.
- Privacy legal basis, retention schedule, provider list and any international
  transfer wording.
- Owner confirmation of the Resend sender domain and recipient address through
  a real production test email.
- Booking response-time, failed-email review and expired-request procedures.
- Production hosting access to the verified Cloudinary credentials, signed
  upload preset, provider retention policy and final image approval workflow.
- Automated backup frequency, retention and restore-test schedule.

## Production runtime gates

Direct website booking fails closed unless all of the following are true:

1. MongoDB production persistence and indexes are configured.
2. The PII encryption key is stored in both deployment and protected recovery
   systems.
3. The owner has confirmed and saved opening hours and booking rules.
4. Public booking is enabled in CMS settings.
5. The Resend API key, verified sender and owner recipient are configured.
6. CMS_PUBLIC_BOOKING_READY is enabled after the production smoke test passes.

Privacy approval, staff notification coverage, monitoring and isolated recovery
testing remain production responsibilities, but no longer use separate runtime
environment flags.

The configured development environment intentionally keeps direct booking off
until the three Resend values are supplied. The same values and provider access
still need verification after the production deployment.

## Remaining launch work

1. Receive the owner-confirmed domain, phone, opening hours, access details,
   cancellation policy, contact channels and final assets.
2. Configure hosting with the verified MongoDB and Cloudinary accounts, Resend
   API key, verified sender and owner recipient, then configure monitoring.
3. Approve the final privacy notice and retention schedule.
4. Establish failed-email review, response-time and expired-request procedures.
5. Configure automated encrypted backups and complete an isolated restore drill.
6. Replace initial test access with unique, high-entropy production
   administrator credentials without retaining plaintext passwords.
7. Run the complete validation and rendered HTTP suite against production.
8. Enable direct booking only after the owner signs off the workflow.

## Sensitive operations

- CMS account creation, disabling, role changes, password resets and session
  revocation require administrator permission and are recorded in audit history.
- Project-integrated backup and isolated-restore commands that can read or write
  production database archives remain intentionally unimplemented.

Backup and recovery remain an operator-run, approval-gated procedure documented
in CMS_RECOVERY.md. No sensitive booking CSV export has been added.

No production deployment has been made. On 3 September 2026, the configured
MongoDB publication was migrated atomically to schema 7/revision 8 and the two
approved voucher images were uploaded and registered in the configured
Cloudinary account. Re-running the migration verified as a no-op.
