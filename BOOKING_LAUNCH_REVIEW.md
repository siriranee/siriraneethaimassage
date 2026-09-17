# Booking launch review — implementation update, 17 September 2026

The reviewed defects below have now been fixed in the working tree. The original
16 September findings are retained as historical evidence, not the current
implementation status. **Code is locally verified; production deployment and
provider delivery verification remain outstanding.**

The later [17 September recheck](BOOKING_PRELAUNCH_RECHECK_2026-09-17.md)
also found and fixed original-slot removal notices, notes-only owner retry
fingerprints and refresh-persistent CMS email warnings. Its follow-up passed
266 automated tests and a 17-call simulated-email HTTP lifecycle in a disposable
MongoDB database. Shared owner/therapist recipients receive one operational
message per lifecycle event; customer messages remain separate.

## Completed implementation

- Quick Confirm/Cancel preserves omitted notes; explicit clearing still works.
- Notes-only changes bypass scheduling checks, including legacy unassigned
  confirmed bookings. The editor does not block these saves.
- Existing future confirmations and same-time therapist reassignments bypass
  the new-booking notice cutoff while retaining conflict, opening-hours,
  therapist-eligibility and past-time checks.
- Therapist changes and booking assignment now share transactional write locks.
- Confirmation, cancellation, rescheduling and reassignment dispatch separate
  customer/therapist messages after the booking and durable event commit.
  Notes-only updates send no email. Stale owner request alerts are suppressed.
- CMS history shows current booking status; historical requests no longer appear
  as new requests that still require confirmation. Manual retries cover owner,
  customer and therapist events, with accepted/uncertain-send safeguards.
- Signed Resend delivery updates distinguish provider acceptance from delivered,
  bounced, failed, delayed, complained and suppressed outcomes. Early webhook
  events are retained and reconciled after the send response. Only metadata is
  stored; event metadata expires after 30 days.
- Automatic background email recovery was explicitly excluded at the owner's
  request. Staff must continue checking pending bookings and email warnings in
  the CMS, especially after provider outages or interrupted requests.
- Applied and verified four additive MongoDB indexes: therapist/status/end-time,
  notification provider-message lookup, delivery-event provider lookup, and
  delivery-event TTL. No booking/content documents were rewritten or deleted.

## Verification

- Lint, TypeScript, complete automated suite and production build passed.
- 30 focused email tests use fake providers and cover the complete notification
  lifecycle, duplicate dispatch, stale state, recipient changes, crash-safe
  payload binding, and uncertain delivery windows.
- Nine booking-management regressions and nine index-migration tests passed.
- Five signed webhook tests passed, including invalid/expired signatures,
  oversized requests, event-before-send-response, duplicates and ordering.
- Eight real MongoDB concurrency scenarios passed in disposable databases with
  fictional fixtures. Each test database was removed and absence verified.
- Rendered production-build checks passed: 16 routes, 25 internal links, 62
  images, metadata, handoffs, headers and indexing. Two invalid-origin POST
  probes returned 403 before storage access. No real booking or email was made.
- Browser inspection confirmed the public therapist selection updates the
  booking summary and contact handoff correctly. Authenticated CMS browser QA
  was not completed; the separate mock preview was blocked by the existing dev
  server lock. Automated CMS workflow tests passed.

## Remaining production release steps

1. Deploy this tested working tree. The live `/book` still lacked the therapist
   picker when checked on 17 September; local verification is not deployment.
2. Once the new workflow is live, set CMS booking capacity to **two simultaneous
   appointments**, with one booking per therapist, as approved by the owner.
3. Assign **Siriranee** to **SRN-20260919-6981B0**, 19 September at 11:00 Dublin
   time. Recheck its latest status/version before saving. This confirmed-booking
   change sends an updated-details email to the customer and an assignment
   email to Siriranee, not another owner request or duplicate confirmation.
   Capacity and this assignment were deliberately left unchanged while the old
   production workflow remained deployed.
   The later read-only recheck also found **SRN-20260921-DCA1FB**, 21 September
   at 12:00 Dublin time, confirmed without a therapist. Obtain the owner's
   therapist choice and recheck the current record before assigning it.
4. Configure the signed Resend webhook and `RESEND_WEBHOOK_SECRET` using the
   steps in README.md. The local sending-only API key cannot read old delivery
   history; no inbox delivery claim has been made from acceptance records.
5. Run one owner-approved live acceptance booking after deployment, verify each
   expected recipient and delivery event, and clean up only that test booking.

## Original review — 16 September 2026 (historical)

**Recommendation: hold the therapist/booking release until the confirmed defects below are corrected.** The application builds and its existing automated suite passes, but the review reproduced gaps that those tests do not cover.

This was a review of the current working tree, isolated workflow tests, read-only checks of the configured MongoDB, and browser checks of the local production build and existing public site. No application code, production booking, therapist profile, or email delivery was changed. No new real emails were sent.

## Confirmed defects

### 1. Quick Confirm/Cancel can erase internal notes

- Evidence: `src/components/cms/CmsBookingQuickActions.tsx:87` sends a status update without `internalNotes`. `src/server/cms/booking-service.ts:457` converts an omitted notes field to an empty string and persists it.
- Isolated reproduction: save a pending booking with `internalNotes = "Important operational note"`; call the same status-only update used by Quick Confirm. The booking becomes confirmed and its notes become empty. Cancellation uses the same update path.
- Impact: staff can lose operational notes while handling a booking.
- Required correction: preserve the current notes when the field is omitted, while still allowing an explicitly submitted empty string to clear notes.
- Verification: exercise both quick actions and an intentional notes clear.

### 2. The new-booking notice window blocks existing booking management

- Evidence: `src/server/cms/booking-service.ts:504` reruns `findSlot` for every save whose resulting status is pending or confirmed, including notes-only changes. `src/domain/booking/availability.ts:269` applies the minimum advance-notice rule.
- Isolated reproduction: one pending booking tomorrow at 12:00, an active eligible therapist, valid opening hours, and no competing occupancy. With a 48-hour minimum notice, confirming the unchanged request fails with "This time is outside opening hours, blocked or fully booked." Change only the notice setting to zero, repeat the same update/version, and confirmation succeeds. A notes-only edit of a confirmed appointment inside the notice window also fails.
- The configured live minimum notice is **120 minutes**. The equivalent live scenario is an existing request handled less than two hours before its appointment.
- Impact: staff cannot confirm a valid existing request or edit notes near the appointment time. The error incorrectly suggests a capacity or opening-hours problem.
- Required correction: notes-only changes should not rerun scheduling validation. Confirmation of an unchanged future request should retain actual conflict and therapist checks without treating it as a newly requested slot. Preserve appropriate past-time and scheduling rules for new or rescheduled appointments.

## Email behavior and release gaps

| Event | Current behavior |
| --- | --- |
| Customer submits website booking | Saves a pending booking, then attempts one owner email; selected transient errors get one immediate retry. |
| Admin confirms booking | Saves confirmed status and the customer outbox event, then sends to the recorded customer email. Missing email is explicitly skipped. |
| Admin cancels pending or confirmed booking | Saves cancelled status and attempts a separate customer cancellation email. |
| Admin reschedules an already-confirmed booking | Saves the new time, but the customer reschedule email remains a preview; no customer update is sent. |
| Therapist assignment/reschedule/removal/cancellation | Records separate therapist outbox events, but there is no runtime delivery caller. Therapist emails are not currently sent. |

Confirmed owner/customer delivery safeguards: separate event IDs and recipients, stable Resend idempotency keys, atomic delivery claims, no automatic resend after acceptance, bounded uncertain retries, and a fresh booking-state check before customer delivery. A failed email does not roll back a saved booking status. Confirmation does not call the owner "new request" sender.

Outstanding email work:

1. **Therapist email dispatch is incomplete.** `src/server/cms/booking-service.ts:549` records plans and `src/server/booking/resend-booking-email.ts:766` defines a sender, but the sender has no runtime caller. The README explicitly describes this as disabled pending approval of the data sent. Do not advertise automatic therapist emails for this release until this is resolved and tested.
2. **Owner email failures have no operator retry or background recovery.** Owner delivery is invoked from `src/server/booking/public-booking.ts:309` only. A provider outage or process exit after the booking commits can leave a request stored without an owner alert. Customer confirmation/cancellation have retry controls; owner alerts do not. Staff must monitor pending bookings in the CMS until recovery is implemented.
3. **Customer reschedule notifications are not implemented.** Preview records at `src/server/cms/notification-service.ts:357` do not send. Staff must communicate changed appointment times separately.
4. **The original notification-history ambiguity remains.** `src/server/cms/read-service.ts:82` returns earlier dashboard events without the current booking status. `src/components/cms/CmsNotificationBell.tsx:15` still calls an old event "New booking request" after confirmation. The original owner email also remains a snapshot of the pending request. Show current status or clearly distinguish history from actions still required.
5. **Inbox delivery remains a separate verification.** Stored `sent` means accepted by Resend, not verified inbox delivery. No delivered/bounced webhook reconciliation is implemented. The configured send-only API key cannot read delivery events; the previous provider read returned that restriction. This review did not resend messages or obtain a new delivery event from the dashboard.

## Additional concurrency risk

Therapist deactivation or treatment-eligibility removal can race a booking assignment. The therapist update checks future bookings at `src/server/cms/content-service.ts:794` and writes content at line 843. Booking assignment writes the booking and date-lock documents, without a shared therapist write lock. MongoDB snapshot transactions can therefore both pass their initial reads and commit, leaving a new booking assigned to an unavailable therapist.

This is a source-established race, **not a production-concurrency reproduction**. Resolve it with shared serialization between therapist availability/eligibility changes and booking assignment, then verify both operation orders against an isolated MongoDB database.

## Current data and deployment checks

- Configured MongoDB responds; published and editable content both have revision 17. Current runtime readiness evaluates to true. Hours and booking rules are marked confirmed.
- Siriranee and Mon (Ubon) are the two active public therapists. Both have private notification addresses and eligibility for all five active treatments.
- One upcoming confirmed booking, **SRN-20260919-6981B0, 19 September at 11:00 Dublin time**, has no assigned therapist. Assign it before using the new therapist workflow. The new editor requires a therapist even for a notes-only save while this booking remains confirmed.
- Maximum concurrent appointments is **1 for the whole spa**, even though two therapists exist. Confirm that this matches actual staffing/room capacity before changing it.
- Core unique booking-reference/idempotency indexes and relevant hold/notification/date-lock indexes are present. The newer `cms_bookings_staff_status_end` index declared in `scripts/cms-indexes.mjs:284` is missing. This is a performance/readiness migration item, not proof of current booking corruption. The mutation/retention script was not run during this review.
- `https://siriranee.com/api/health` responds 200 with MongoDB and a publication available. The deployed `/book` does **not** yet contain the therapist picker; the reviewed local production build does. Do not treat local release verification as proof that the new code is deployed.
- Local `CMS_ORIGIN` is intentionally `http://localhost:3000`. The hosted configuration validator passes when the origin is supplied as `https://siriranee.com` in the test process. This does not verify the hosting provider's actual environment variables.
- Existing notification metadata still records one accepted customer confirmation for the recent confirmed website booking. Historical `preview` rows must not be interpreted as delivered messages.

## Verification performed

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — passed, including booking, availability, status, authorization, notification, isolated launch workflows, CMS, media, environment, and content checks.
- Isolated launch workflow covers service setup, ten bookings, therapist assignment/lifecycle guards, confirmation/cancellation and notification planning, using mocks rather than production writes.
- Additional isolated reproductions established the two defects above despite the existing suite passing.
- `npm run build` — passed with the current Next.js version.
- `git diff --check` — passed.
- Local production browser: treatment/therapist selection, available dates/times, price and appointment summary, contact form reveal, and resetting the old selection when therapist changes worked. The checked mobile layout had no horizontal overflow.
- Live customer confirmation link automatically fetched and displayed **Confirmed** without another click. It displayed no customer contact details.
- CMS browser navigation reached the login page; no live administrator mutation was performed. CMS changes were checked through source and isolated service tests.
- `npm run test:rendered` against the local production build — **two stale assertions fail** at `scripts/validate-rendered-site.mjs:507` and `:540`. One expects no therapist parameter, and the other permits only retired therapist `waen`. Actual contact links correctly preserve Hot Oil Massage, 90 minutes and fallback therapist Siriranee, including the return booking link. Update the assertions to validate parsed parameters against current selected data.

## Release exit criteria

1. Correct the two reproduced CMS update defects and add focused behavioral coverage.
2. Resolve therapist dispatch scope and delivery, the therapist lifecycle race, and the unassigned upcoming booking.
3. Make notification history unambiguous for staff; provide an owner email recovery path or explicitly establish a manual monitoring procedure. Decide whether reschedules need automatic customer emails before relying on that behavior.
4. Update the stale rendered checks and apply the reviewed database index/configuration requirements through the normal release process.
5. Deploy the reviewed revision, then perform one explicitly designated end-to-end booking with controlled recipient addresses and check the actual Resend delivery events for each enabled notification. Do not replay existing customer notifications merely to test the release.
