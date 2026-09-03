# Siriranee Thai Massage

Single-language English Next.js website and CMS for Siriranee Thai Massage in
Howth, Dublin, Ireland.

## What is implemented

- Responsive public website for mobile, tablet and desktop.
- Five confirmed massage services, durations and EUR prices.
- Local SEO for Thai massage in Howth and nearby Dublin areas.
- Treatment, price, page heading, SEO, business-detail, home-hero, service
  gallery, promotion and team publishing from immutable CMS publication
  snapshots. Successful content saves publish immediately.
- Customer booking flow with service, date and time selection. Customers never
  select a therapist, and bookings do not include staff assignment.
- Dublin-time availability with capacity, closures, notice period, booking
  horizon, treatment buffers and daylight-saving handling.
- Secure CMS for bookings, day/week/month calendar views, bounded recurring
  closures, services and their image galleries, page SEO and home-hero slides,
  promotions, gallery metadata, site details, hours, team, settings, global
  search and audit history.
- Transactional direct publishing with record validation and immutable
  publication history. A failed content or publication write leaves the live
  website unchanged.
- URL-based booking filters, per-booking activity timelines, unsaved-change
  warnings and a metadata-only notification preview queue. No outbound message
  is sent until a provider and operating process are approved.
- MongoDB persistence, username-and-password authentication, role-based access,
  salted scrypt passwords, revocable sessions, source-aware login throttling and AES-256-GCM
  booking-contact encryption.
- Client-side JPEG, PNG and WebP validation, resizing and compression, followed
  by signed direct Cloudinary uploads and a durable CMS media registry.
- Safe local mock CMS and fail-closed production readiness gates.

Direct website booking is implemented but remains disabled until the production
database, owner approvals, privacy notice and notification workflow are ready.

## Local development

~~~powershell
npm.cmd install
npm.cmd run dev -- --port 3107
~~~

Open:

- Website: http://localhost:3107
- CMS: http://localhost:3107/cms/login

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
- availability, expiry, permission and no-therapist contract tests
- hosted-environment readiness matrix tests
- browser image preparation, media authorization and upload-lifecycle tests
- business-content and SEO regression checks
- a production Next.js build

After starting a built site on port 3107, run:

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
   When a custom domain is confirmed and connected, set NEXT_PUBLIC_SITE_URL to
   that exact origin.
2. Create a production MongoDB deployment that supports transactions.
3. Set CMS_MODE=mongodb, MONGODB_URI, MONGODB_DB and CMS_ORIGIN.
4. Store a secret 32-byte CMS_PII_ENCRYPTION_KEY in the deployment secret
   manager and in the protected recovery store.
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
7. Run npm.cmd run cms:indexes.
8. Temporarily set `CMS_SEED_USERNAME`, `CMS_SEED_PASSWORD`,
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
9. Sign in, confirm and save the business information, opening hours and
   booking rules. Each successful save publishes its section immediately.
10. Test image preparation, upload, direct publication and failed-save cleanup, then
   set CMS_MEDIA_UPLOAD_READY=true.
11. Complete the privacy, retention, notification, monitoring and isolated
   recovery-drill operational reviews. These are launch responsibilities, not
   application environment gates.
12. After end-to-end production testing, set
   CMS_PUBLIC_BOOKING_READY=true and enable public booking in CMS settings.

The runtime also requires MongoDB mode, a valid customer-data encryption key,
and a published CMS snapshot with confirmed hours, confirmed booking rules and
public booking enabled. A missing prerequisite keeps direct booking safely off.

## Published content rules

The public site reads the most recent immutable CMS publication. Every
successful content save publishes the changed section immediately in the same
MongoDB transaction. There is no separate preview or manual publish step.
Promotion and voucher status fields, public-profile controls and gallery
visibility controls still decide whether an individual record renders publicly.

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

Use **Clean expired uploads** in the CMS media library as a bounded maintenance
action. An early cleanup removes the provider asset immediately, then retains a
registry tombstone until the signed Cloudinary request has expired; run cleanup
again later when the result reports that a final safety sweep is pending. This
prevents a late replay from recreating an untracked image.

Cloudinary uploads remain disabled unless CMS_MODE=mongodb, the complete
server-only provider configuration is present, and
CMS_MEDIA_UPLOAD_READY=true. The safe .env.local mock keeps this gate false.

## Recovery

See [CMS_RECOVERY.md](CMS_RECOVERY.md) before enabling production persistence or
public booking. Recovery must be tested against a new isolated database, never
against the live database by default.

## Current owner inputs

Before public launch, configure the real Cloudinary account and signed upload
preset, then confirm the opening hours, Eircode or exact map pin, building
access, cancellation policy, final domain, remaining public contact and social
channels, team details, approved photography, privacy details, retention
period, notification process, monitoring ownership, backup schedule and
hosting/database providers.

Administrator account management supports creating and disabling accounts,
resetting passwords and revoking sessions. These security-sensitive actions are
restricted to administrators and recorded in the audit history. Initial and
recovery-only administrator provisioning still uses the one-time seed command.
Project-integrated backup/restore automation remains intentionally separate;
the manual recovery runbook is the approved reference.
