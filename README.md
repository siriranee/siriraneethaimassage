# Siriranee Thai Massage

Single-language English Next.js website and CMS for Siriranee Thai Massage in
Howth, Dublin, Ireland.

## What is implemented

- Responsive public website for mobile, tablet and desktop.
- Five confirmed massage services, durations and EUR prices.
- Local SEO for Thai massage in Howth and nearby Dublin areas.
- Treatment, price, page heading, SEO, business-detail, gallery, promotion and
  team publishing from an immutable CMS publication snapshot. Draft edits do
  not leak onto public pages.
- Customer booking flow with service, date and time selection. Customers never
  select a therapist; staff assignment is internal only.
- Dublin-time availability with capacity, closures, notice period, booking
  horizon, treatment buffers and daylight-saving handling.
- Secure CMS for bookings, day/week/month calendar views, bounded recurring
  closures, services, page SEO, promotions, gallery metadata, site details,
  hours, team, settings, global search and audit history.
- Review-first publishing with grouped changes, readiness feedback, immutable
  publication history and safe restore-to-draft. Restoring an older snapshot
  never silently changes live content or current booking rules.
- URL-based booking filters, per-booking activity timelines, unsaved-change
  warnings and a metadata-only notification preview queue. No outbound message
  is sent until a provider and operating process are approved.
- MongoDB persistence, role-based access, salted scrypt passwords, revocable
  sessions, login lockout and AES-256-GCM booking-contact encryption.
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

1. Confirm the canonical HTTPS domain and set NEXT_PUBLIC_SITE_URL.
2. Create a production MongoDB deployment that supports transactions.
3. Set CMS_MODE=mongodb, MONGODB_URI, MONGODB_DB and CMS_ORIGIN.
4. Store a secret 32-byte CMS_PII_ENCRYPTION_KEY in the deployment secret
   manager and in the protected recovery store.
5. Run npm.cmd run cms:indexes.
6. Temporarily set the CMS_SEED_* values and run
   npm.cmd run cms:seed-admin, then remove the seed values.
7. Sign in, confirm the business information, publish the content snapshot,
   and confirm opening hours and booking rules.
8. Complete the privacy, retention, notification, monitoring and isolated
   recovery-drill operational reviews.
9. Enable the five final gates only after end-to-end production testing:
   CMS_PUBLIC_BOOKING_READY=true,
   CMS_PRIVACY_NOTICE_APPROVED=true, and
   CMS_BOOKING_NOTIFICATION_READY=true,
   CMS_MONITORING_READY=true, and
   CMS_RECOVERY_DRILL_VERIFIED=true.

The runtime also requires the published CMS snapshot to have confirmed hours,
confirmed booking rules and public booking enabled. A missing prerequisite keeps
direct booking safely off.

## Published content rules

The public site reads the most recent immutable CMS publication. Editors can
save drafts without changing the public site, then deliberately publish a
complete snapshot.

The media library currently manages approved local image metadata. Remote CMS
image URLs and direct uploads are not rendered until a production media
provider, validation rules and the Next.js image allowlist are approved. Local
/images/... assets continue to work and unapproved remote values fall back to
the existing treatment image.

## Recovery

See [CMS_RECOVERY.md](CMS_RECOVERY.md) before enabling production persistence or
public booking. Recovery must be tested against a new isolated database, never
against the live database by default.

## Current owner inputs

Before public launch, confirm the phone number, opening hours, Eircode or exact
map pin, building access, cancellation policy, final domain, public contact and
social channels, team details, approved photography, privacy details, retention
period, notification process, monitoring ownership, backup schedule and
hosting/database providers.

Persistent administrator-account management and project-integrated
backup/restore automation are intentionally not included without explicit
authorization for those sensitive operations. The existing account directory
is read-only, initial provisioning uses the one-time seed command, and the
manual recovery runbook remains the approved reference.
