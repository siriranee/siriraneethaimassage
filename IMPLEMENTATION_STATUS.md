# Siriranee Thai Massage implementation status

Updated: 2 September 2026

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
- Create/edit/archive workflows for services and team profiles, plus editable
  site information, hours, booking rules, public page headings and SEO.
- CMS-managed home-hero slides and per-service image galleries with ordering,
  crop focus, alternative text and publication safety.
- Client-side raster validation and compression with local previews, size and
  dimension feedback, retry/remove controls and no upload on file selection.
- Signed direct Cloudinary image uploads with server-side provider verification,
  owned-folder enforcement, durable asset states, transactional content commit,
  conservative rollback and bounded expired-stage cleanup.
- Promotion and local gallery-metadata management with draft, published and
  archived states.
- Public pages read immutable CMS publication snapshots; successful content
  saves publish the changed section immediately.
- Transactional direct publishing with record validation and immutable
  publication history; failed saves do not replace the live snapshot.
- Booking dashboard, global CMS search, URL-based booking filters, booking
  detail, controlled change reasons, per-booking audit timeline, status updates,
  rescheduling, bounded recurring closures and day/week/month calendar.
- Metadata-only notification preview queue. It records delivery intent without
  duplicating contact details or message bodies and sends no external messages.
- Public treatment/date/time booking backend with same-origin checks, bounded
  JSON, validation, rate limiting, idempotency and encrypted customer details.
- Fully booked capacity checks with pending-hold expiry, closures, buffers,
  notice period, booking horizon and Europe/Dublin daylight-saving handling.
- Customers never see, submit or select a therapist, and booking management has
  no staff-assignment workflow. Privileged staff, calendar and price fields are
  rejected by the public booking API.
- Expired pending requests release capacity and are clearly flagged in the CMS.
- Automated TypeScript, lint, content, environment, availability, permission,
  security-contract and production-build checks.

## Safe defaults

- Local development uses a fictional in-memory CMS and a one-click demo login.
- Hosted builds reject mock CMS mode.
- Production CMS is disabled without MongoDB configuration.
- Cloudinary uploads require MongoDB, complete server-only credentials and an
  independent CMS_MEDIA_UPLOAD_READY gate.
- Direct public booking requires MongoDB, confirmed hours and booking rules,
  a valid customer-data encryption key, the CMS booking control and one
  deployment-level booking switch.
- Customer details are encrypted with AES-256-GCM before MongoDB storage.
- CMS and API responses containing private data are no-store.
- CMS routes are blocked from indexing.
- Provisional opening hours remain omitted from structured data.

## Mock or provisional until the owner confirms

- Opening hours and operational booking rules.
- Maximum simultaneous appointments, booking notice, buffers, hold time,
  booking horizon and cancellation cutoff.
- Remaining public communication channels beyond the confirmed phone and WhatsApp number.
- Exact Eircode/map pin, entrance, lift, accessibility, parking and transport
  guidance.
- Team display details beyond the current supplied names.
- Illustrative spa imagery and final approval of generated treatment galleries.
- Privacy legal basis, retention schedule, provider list and any international
  transfer wording.
- Booking notification and follow-up workflow.
- External notification delivery provider, retries and alert ownership.
- Production Cloudinary credentials, signed upload preset, provider retention
  policy and final image approval workflow.
- Automated backup frequency, retention and restore-test schedule.

## Implemented but intentionally not live

Direct website booking is production-shaped but remains off until all of the
following are true:

1. MongoDB production persistence and indexes are configured.
2. The PII encryption key is stored in both deployment and protected recovery
   systems.
3. The owner has confirmed and saved opening hours and booking rules.
4. Public booking is enabled in CMS settings.
5. CMS_PUBLIC_BOOKING_READY is enabled after the production smoke test passes.

Privacy approval, staff notification coverage, monitoring and isolated recovery
testing remain production responsibilities, but no longer use separate runtime
environment flags.

## Remaining launch work

1. Receive the owner-confirmed domain, phone, opening hours, access details,
   cancellation policy, contact channels and final assets.
2. Configure hosting, MongoDB, Cloudinary, notification and monitoring
   providers.
3. Approve the final privacy notice and retention schedule.
4. Establish booking notification, response-time and expired-request procedures.
5. Configure automated encrypted backups and complete an isolated restore drill.
6. Provision production administrators with unique usernames without retaining
   plaintext credentials.
7. Run the complete validation and rendered HTTP suite against production.
8. Enable direct booking only after the owner signs off the workflow.

## Sensitive operations

- CMS account creation, disabling, role changes, password resets and session
  revocation require administrator permission and are recorded in audit history.
- Project-integrated backup and isolated-restore commands that can read or write
  production database archives remain intentionally unimplemented.

Backup and recovery remain an operator-run, approval-gated procedure documented
in CMS_RECOVERY.md. No sensitive booking CSV export has been added.

No production deployment or provider account changes have been made.
