# Siriranee Thai Massage

Single-language English Next.js website and CMS for Siriranee Thai Massage in
Howth, Dublin, Ireland.

## What is implemented

- Responsive public website for mobile, tablet and desktop.
- A CMS-managed massage and spa treatment menu with published durations and EUR prices.
- Local SEO for Thai massage in Howth and nearby Dublin areas.
- Treatment, price, business-detail, service-gallery, promotion and voucher
  publishing from immutable CMS publication snapshots. Successful content
  saves publish immediately.
- Source-controlled public page headings, SEO, home-hero slides and site gallery.
- Customer booking flow with service, therapist, date and time selection.
  Customers choose an eligible public therapist before viewing dates and times.
- Dublin-time availability with capacity, closures, notice period, booking
  horizon, treatment buffers and daylight-saving handling.
- Secure CMS for bookings, the operational month calendar, bounded recurring
  closures, services and their image galleries, therapist records and
  treatment eligibility, vouchers, site details, hours, settings and a
  one-year audit history.
- Transactional direct publishing with record validation and immutable
  publication history. A failed content or publication write leaves the live
  website unchanged.
- URL-based booking filters, per-booking activity timelines, unsaved-change
  warnings and metadata-only notification records. A newly stored website
  request triggers one owner Resend alert in Thai and English. When the shop
  confirms a booking, Resend sends the customer an English confirmation with
  the appointment, published business contact details and safe public links.
  Confirmed therapist assignment, reschedule, removal and cancellation events
  are stored in a durable private outbox and sent after saving, using
  privacy-minimised Resend templates.
  Recipient addresses and rendered messages are never stored in notification
  records, and customer confirmation emails exclude customer and internal notes.
- MongoDB persistence, username-and-password authentication, role-based access,
  salted scrypt passwords, revocable sessions, source-aware login throttling
  and AES-256-GCM encryption for booking contacts and private therapist email
  addresses and phone numbers.
- Client-side JPEG, PNG and WebP validation, resizing and compression, followed
  by signed direct Cloudinary uploads and a durable CMS media registry.
- Safe local mock CMS and fail-closed production readiness gates.

Direct website booking is implemented but remains disabled until the production
database, owner approvals, privacy notice and Resend booking-email settings are ready.

## Local development

~~~powershell
npm.cmd install
npm.cmd run dev
~~~

Open:

- Website: http://localhost:3000
- CMS: http://localhost:3000/cms/login

With no production environment variables, local development uses the in-memory
mock CMS. Choose **Open local demo** on the CMS login page. Mock data is
fictional and resets when the development server restarts.

Production and hosted environments reject mock mode.

## Validation

~~~powershell
npm.cmd run check
~~~

The check runs:

- ESLint with zero warnings
- TypeScript without incremental writes
- availability, therapist assignment, expiry and permission contract tests
- hosted-environment readiness matrix tests
- browser image preparation, media authorization and upload-lifecycle tests
- business-content and SEO regression checks
- a production Next.js build

After starting a built site on port 3000, run:

~~~powershell
npm.cmd run test:rendered
~~~

This validates public routes, metadata, canonical links, accessibility
relationships, structured data, internal links, rendered images, booking
handoffs, redirects, robots, sitemap, security headers and CMS no-index rules.

## Production CMS setup

Copy [.env.example](.env.example) into the deployment provider's encrypted
environment settings. Do not commit real secrets.

The normal production sequence is:

1. For the initial Vercel deployment, keep system environment variables enabled
   so VERCEL_PROJECT_PRODUCTION_URL can provide the canonical HTTPS origin.
   For the connected Siriranee domain, set `NEXT_PUBLIC_SITE_URL` to
   `https://siriranee.com`.
2. Create a production MongoDB deployment that supports transactions.
3. Set CMS_MODE=mongodb, MONGODB_URI, MONGODB_DB and CMS_ORIGIN.
4. Store a secret 32-byte CMS_PII_ENCRYPTION_KEY in the deployment secret
   manager and in the protected recovery store. The same key encrypts booking
   contacts and each therapist's private email address and phone number.
5. Create a Cloudinary account and a signed upload preset. Set
   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
   CLOUDINARY_UPLOAD_PRESET and a dedicated folder such as
   CLOUDINARY_FOLDER=siriranee/cms. Keep the preset signed and do not configure
   it to replace the request's public ID, public-ID prefix, folder or incoming
   transformation; the server signs and verifies those ownership controls.
6. Generate a separate secret of at least 32 bytes for
   CMS_MEDIA_TOKEN_SECRET. It must not be the Cloudinary API secret or booking
   encryption key.

   ~~~powershell
   $mediaSecretBytes = [byte[]]::new(48)
   [Security.Cryptography.RandomNumberGenerator]::Fill($mediaSecretBytes)
   [Convert]::ToBase64String($mediaSecretBytes)
   ~~~
7. Create a Resend API key, verify the sending domain, and set
   `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and `RESEND_BOOKING_TO_EMAIL` in the
   deployment secret manager. Use a sender address on `siriranee.com`.
   `RESEND_BOOKING_TO_EMAIL` is the owner address that receives every new
   website booking request; confirmed customer emails go to the optional email
   stored with that booking. Therapist messages
   go separately to the private address saved on the assigned therapist record.
   No additional therapist email environment variable is required. For testing
   with Resend's shared domain, each recipient must satisfy Resend's account
   restrictions.
   DMARC is a DNS setting rather than application code. A verified Resend domain
   already passes SPF and DKIM; add and monitor a `_dmarc.siriranee.com` TXT
   record, then move from monitoring to `quarantine` or `reject` only after all
   legitimate senders for the domain are aligned.
8. Run npm.cmd run cms:indexes.
9. Temporarily set `CMS_SEED_USERNAME`, `CMS_SEED_PASSWORD`,
   `CMS_SEED_DISPLAY_NAME` and `CMS_SEED_ROLE`, then run
   `npm.cmd run cms:seed-admin`. The username is stored in lowercase and must
   contain 4-32 ASCII letters or numbers. The password must contain 12-256
   ASCII letters or numbers. Neither field requires a particular starting or
   ending character or a mixture of letters and numbers. The display name must
   contain 2-80 characters. Remove all seed values immediately after
   provisioning.
   For an existing database, complete this step before switching users to the
   username-only login; legacy email-only accounts cannot authenticate with the
   new form.
10. Sign in, confirm and save the business information, opening hours and
   booking rules. Each successful save publishes its section immediately.
11. Open **Therapists** in the CMS. Create or edit each profile, add the private
   notification email, select every treatment they can provide, and choose the
   public and booking flags deliberately. Upload a portrait through the form if
   approved photography is available.
12. Test image preparation, upload, direct publication and failed-save cleanup, then
   set CMS_MEDIA_UPLOAD_READY=true.
13. Send a test booking to the owner address and confirm the Thai section,
   English section, reply-to address and CMS booking link. Then confirm that
   changing the booking from pending to confirmed sends one customer email with
   the correct Dublin appointment time and public links. Test
   the separate therapist assignment, reschedule, reassignment and cancellation
   messages. Complete the privacy, retention, monitoring and isolated
   recovery-drill operational reviews before launch.
14. After end-to-end production testing, set
   CMS_PUBLIC_BOOKING_READY=true and enable public booking in CMS settings.

The hosted build and runtime both require complete Resend settings before
direct booking is available. A temporary Resend failure never rolls back an
already stored or confirmed booking. Separate durable outbox records and stable
provider idempotency keys protect the owner alert and customer confirmation.
The CMS records failed or uncertain delivery for operator review without
storing the recipient or message body. Therapist messages
use the same durable delivery controls and existing Resend credentials, with
each message addressed only to that therapist rather than copying the owner or
customer.

The runtime requires MongoDB mode, a valid customer-data encryption key,
complete valid Resend settings, and a published CMS snapshot with confirmed
hours, confirmed booking rules and public booking enabled. A missing
prerequisite keeps direct booking safely off.

## Therapist setup

Use **CMS > Therapists** to create a therapist record or edit an existing one.
Customer-facing fields include the booking-link slug, display name, role, short
introduction and portrait. Therapist lists are ordered alphabetically. The
public therapist listing/profile pages are intentionally not published. Select
only treatments the therapist is qualified to provide. An empty treatment list
keeps the therapist unavailable for booking.

The two visibility controls have separate purposes:

- **Available for booking** permits CMS staff to assign the therapist to an
  eligible treatment. It requires at least one treatment and a valid private
  notification email.
- **Show in online booking** makes the therapist visible in the booking form.
  A customer can select the therapist only when both controls are enabled and
  the chosen treatment is in the therapist's eligibility list.

Archiving removes the therapist from public and operational choices while
retaining booking history. Reassign future pending or confirmed appointments
before deactivating, archiving or removing a treatment that those appointments
need.

Portraits are optional. Choose the photo in the therapist form instead of
entering a remote URL; the browser prepares it and the CMS uploads it only when
the entire record save succeeds. Booking choices without a portrait use the
designed initials fallback. Add useful portrait alt text whenever a photo is
present.

After deploying the schema-version-9 application, remove the retired biography,
specialties, languages and manual display-order keys from current content and
retained publication snapshots. Run
`npm run cms:remove-retired-therapist-fields` first, review the printed plan,
then rerun with `-- --apply --expected-plan=<printed-hash>`. Do not apply this
cleanup while an older CMS version can still write content.

The notification address and optional phone number are operational data, not
customer-facing content. In MongoDB they are stored separately with AES-256-GCM
encryption under the existing `CMS_PII_ENCRYPTION_KEY`; they are excluded from
publication snapshots and public APIs. A pending website request does not notify the therapist. After the shop
confirms and assigns the booking, the durable outbox sends a separate
therapist message for assignment and distinct messages for rescheduling,
removal or reassignment, and cancellation. The existing `RESEND_API_KEY` and
`RESEND_FROM_EMAIL` are reused, so therapist notifications add no environment
variable.

### Booking email operations and delivery tracking

Saving a booking always finishes before contacting Resend. A website request
alerts the owner once; it does not confirm the customer or notify the therapist.
Confirming sends the customer confirmation and a separate therapist assignment.
Changing a confirmed appointment or its therapist sends updated customer details
and the appropriate therapist update/removal/assignment messages. Cancellation
sends separate customer and assigned-therapist notices. Saving notes alone sends
no email. Pending-request history remains visible in the CMS, labelled with the
booking's current status rather than as a new request needing confirmation.

When the owner and assigned therapist share an email address, that inbox receives
one operational message per event, not an extra copy for each role: the owner
request first, then therapist confirmation, change or cancellation updates.
These are different lifecycle events, not duplicate requests. Customer emails
remain separate. Replaying a dispatch or retrying an accepted event does not
send another copy. Two different therapist records should use their own
notification addresses; reassignment produces distinct removal and assignment
notices for those profiles.

Removal notices preserve the previous therapist's original treatment, date,
time and duration even when the reassignment also changes the appointment.
Later changes or cancellation with another therapist do not erase that
correction. Legacy removal events without a trustworthy original-slot snapshot
are not guessed or resent; the CMS asks staff to contact the previous therapist.

Each email has its own durable event and idempotency key. CMS booking details
provide a retry button only while that exact unsent event can safely be retried.
Already accepted emails are never blindly resent, including emails that later
bounce. Uncertain provider outcomes retain the original 23-hour safe retry
window; expired or changed-payload events require checking Resend and contacting
the customer as appropriate. There is no scheduled/background email recovery.
Notes-only changes no longer invalidate an otherwise unchanged owner-request
email retry. Legacy fingerprint migration requires proof of the same message
and recipient and does not extend an uncertain send's safe retry window.
Saved email warnings appear on the dashboard, booking list and calendar after
refresh, including cancelled bookings. Successful retries clear their warning;
later delivery failures restore it. Historical unresolved customer/therapist
events remain visible for review, while obsolete owner-request alerts are
hidden once staff have acted on the booking.

To see delivery rather than only provider acceptance:

1. Deploy the application including `/api/webhooks/resend`.
2. In Resend, add `https://siriranee.com/api/webhooks/resend` for
   `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.failed`,
   `email.complained`, and `email.suppressed`.
3. Set the webhook's signing secret as `RESEND_WEBHOOK_SECRET` in production,
   then redeploy. Do not replace the sending API key or expose this secret in
   browser variables. A missing secret safely disables the endpoint.
4. Run `npm run cms:booking-launch-indexes` to inspect and
   `npm run cms:booking-launch-indexes -- --apply` to install only additive
   booking/delivery indexes. The launch command does not prune data.
5. Send one controlled test booking through request, confirmation and cancellation.
   Verify each expected recipient, booking reference and CMS delivery badge.
   An accepted email is not proof of inbox delivery, and delivered is not proof
   the recipient read it. Historical sends remain accepted unless a provider
   delivery event is received.

Webhook signatures authenticate the original request body. Duplicate and
out-of-order events are safe; events received before a send response is saved
are reconciled afterward. Only message IDs, event IDs, delivery states and
timestamps are kept. Raw payloads/recipient addresses are not retained; detached
event metadata expires after 30 days. See the official
[Resend verification guide](https://resend.com/docs/webhooks/verify-webhooks-requests).

### One-time therapist assignment backfill

For owner-approved legacy assignments without customer reschedule emails, use
`npm run cms:assign-unassigned-therapist -- --therapist-id=<exact-id>` first.
The default dry run lists only future active unassigned booking references and
prints a plan hash. Review the appointments, then repeat with
`--apply --expected-plan=<reviewed-hash>`. A changed plan or availability conflict
aborts the entire batch. Re-run the dry run afterward to verify no candidates remain.

This maintenance command preserves appointment times, customer data, notes,
status and existing email records; it adds an audit event and increments each
booking version. It sends no email and does not assign past, terminal or expired
pending bookings. Normal CMS reassignment remains the correct workflow when
customers and therapists should receive appointment-change notifications.

Keep capacity at one while the older non-therapist-aware version is live. After
deploying and verifying the therapist-aware booking routes, publish the approved
capacity of two through CMS booking settings. Recheck unassigned bookings after
cutover because the old website can create more before deployment.

## Published content rules

The public site reads the most recent immutable CMS publication. Every
successful content save publishes the changed section immediately in the same
MongoDB transaction. There is no separate preview or manual publish step.
Promotion and voucher status fields and public-profile controls still decide
whether an individual record renders publicly.

Local /images/... assets continue to work. CMS editors can also prepare new
images in the browser; selection validates the real file type, rejects animated
or oversized files, preserves aspect ratio, downsizes without upscaling and
encodes an efficient WebP with a JPEG fallback. Nothing uploads merely because
a file was selected.

When a content form is submitted, prepared files upload one at a time through a
short-lived server signature. The server verifies the provider response and
Cloudinary resource metadata, records the asset as staged, and commits the
asset with the content change in the same MongoDB transaction. Failed saves use
idempotent cleanup, while committed or publication-referenced images are never
deleted by rollback. Only versioned HTTPS images inside the configured
Cloudinary account and owned CMS folder can render publicly; other remote URLs
fail closed.

There is no scheduled or batch media-cleanup endpoint. A failed content save
immediately attempts idempotent rollback through the authenticated upload
workflow. If a browser or network session ends before that save can run, retain
the registry evidence and reconcile the incomplete upload with Cloudinary as an
operator recovery task.

The approved initial voucher artwork can be checked with
`npm.cmd run cms:migrate-vouchers` and applied once with
`npm.cmd run cms:migrate-vouchers -- --apply`. The command is deterministic and
idempotent: it uploads both images before one atomic MongoDB publication, and a
failed database commit removes only the immutable Cloudinary assets owned by
that run.

Cloudinary uploads remain disabled unless CMS_MODE=mongodb, the complete
server-only provider configuration is present, and
CMS_MEDIA_UPLOAD_READY=true. The safe .env.local mock keeps this gate false.

## Recovery

See [CMS_RECOVERY.md](CMS_RECOVERY.md) before enabling production persistence or
public booking. Recovery must be tested against a new isolated database, never
against the live database by default.

## Current owner inputs

Before public launch, confirm that production hosting uses the already verified
MongoDB and Cloudinary accounts, signed upload preset and Resend sending domain.
Confirm the owner recipient address with a real test email. Then confirm the
Eircode or exact map pin, building access, cancellation policy,
remaining public contact and social channels, team details, approved
photography, privacy details, retention period, notification response process,
monitoring ownership and backup schedule.

Administrator account management supports creating and disabling accounts,
resetting passwords and revoking sessions. These security-sensitive actions are
restricted to administrators and recorded in the audit history. Initial and
recovery-only administrator provisioning still uses the one-time seed command.
Project-integrated backup/restore automation remains intentionally separate;
the manual recovery runbook is the approved reference.
