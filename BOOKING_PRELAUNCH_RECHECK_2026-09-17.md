# Booking prelaunch recheck — 17 September 2026

## Follow-up implementation and verification

All three findings below are now fixed in the working tree. They are retained
as historical reproductions, not current unresolved defects. Production has
not been deployed or changed by this fix pass.

- Previous-therapist removal events retain their original appointment details.
  Safe retries still work after another therapist's reschedule/cancellation;
  reassignment back and superseding events block stale messages. Missing legacy
  snapshots fail closed with a clear manual-contact instruction.
- Owner-request fingerprints bind actual message content and recipient, not
  unrelated internal-note versions. Legacy migration requires an exact payload
  proof and preserves uncertain-send limits.
- CMS dashboard, booking list and calendar render saved email-attention metadata
  after refresh, including cancelled bookings. Accepted retries clear attention,
  and provider delivery failures restore it.
- Shared owner/therapist inbox behavior is verified: one operational message per
  lifecycle event, with no additional owner copy on confirmation/change/cancel.
  Customer messages remain separate; initial request and later confirmation are
  deliberately distinct events. Added repeat-dispatch regression coverage with
  a case/whitespace variant of the shared address. Two different therapist
  profiles sharing a mailbox remain separate reassignment recipients.

Validation for this follow-up:

- `npm.cmd run check` passed: lint, TypeScript, **266 automated tests**, content
  checks and production build (25 new regression tests).
- Full real-HTTP workflow passed against a disposable MongoDB database and a
  loopback Resend simulator: **17 simulated email calls**, no real sends.
- Verified original removal time during simultaneous reassignment/rescheduling,
  normalized shared recipient, duplicate safeguards, and signed delivery events.
- Authenticated dashboard/list/calendar HTML retained confirmation and
  cancellation failure warnings after refresh. Mongo attention queries ran
  successfully; manual retries cleared the corresponding persisted warnings.
- The disposable database was removed and its absence verified.
- No deployment, production booking/settings change or real provider call was
  performed. Automatic background recovery remains intentionally excluded.

Production release steps remain: deploy, apply the approved capacity/assignment
choices after checking current records, obtain the missing therapist choice for
the second unassigned booking, configure/verify the webhook, and perform one
controlled live acceptance test. The production observations below are from
the earlier read-only recheck, not a fresh production inspection in this pass.

## Original findings (fixed above)

### 1. P2 — Previous-therapist removal notices use the wrong slot or become unsendable

Normal-path reproduction: a booking assigned to A at 11:00 is changed in one save
to B at 14:00. A's removal email says an appointment was removed and shows 14:00,
without the originally assigned 11:00 or an old/new distinction. The reference
correctly identifies the booking, but the appointment details are misleading for
A's schedule. The sender receives the latest booking at
[notification-service.ts:948](C:/Coding/2026/siriraneethaimassage/src/server/cms/notification-service.ts:948),
and the template uses that updated time at
[booking-email.ts:738](C:/Coding/2026/siriraneethaimassage/src/server/booking/booking-email.ts:738).
This was verified through the actual sender/template with a fake Resend client.

A second consequence was reproduced with a fake provider:

1. Therapist A receives the confirmed assignment.
2. Admin reassigns the booking to B; the removal email to A is rate-limited
   (a known-unsent failure).
3. Admin cancels the booking while B is assigned.
4. Retrying A's removal returns `therapist-booking-state-invalid` without calling
   the provider. Cancellation creates a notification only for B.

A is left with their accepted assignment email and no corrective notice.
The removal validator requires the latest booking to remain confirmed:
[notification-service.ts:967](C:/Coding/2026/siriraneethaimassage/src/server/cms/notification-service.ts:967).
The cancellation plan targets only the currently assigned therapist at line 150.

Fix direction: preserve the original removal event's correct appointment identity
or generate a safe replacement correction for the previous therapist. Retain
duplicate protection and the original uncertainty window; simply ignoring stale
events without a successor loses important communication.

### 2. P2 — Saving internal notes blocks an otherwise valid owner-email retry

Reproduced: a pending-request owner email is rate-limited; admin changes only
internal notes; retry returns `resend-payload-changed` and becomes nonretryable.
The original and updated rendered owner messages are identical, verified with a
deep equality assertion. Nevertheless, the fingerprint includes the unrelated
booking version:
[resend-booking-email.ts:519](C:/Coding/2026/siriraneethaimassage/src/server/booking/resend-booking-email.ts:519).

Fix direction: bind retries to actual email content/recipient and relevant booking
state, not internal-note version changes. Handle already-stored fingerprints
carefully; do not reset or bypass duplicate protection for uncertain sends.

### 3. P2 — Quick-action email warnings are erased by the refresh

Source-established React lifecycle issue: confirmation/cancellation sets local
email feedback and then calls `router.refresh()` in
[CmsBookingQuickActions.tsx:110](C:/Coding/2026/siriraneethaimassage/src/components/cms/CmsBookingQuickActions.tsx:110).
The booking list, dashboard and calendar key this component by booking version;
for example the [booking list at line 162](C:/Coding/2026/siriraneethaimassage/src/app/cms/(protected)/bookings/page.tsx:162).
After a successful status save, the new version remounts the component and drops
its warning. Staff can see Confirmed/Cancelled without the failed-email warning.
Booking details still retain notification metadata. This was verified from the
component/parent data flow, not an interactive browser timing reproduction.

Fix direction: render persistent email attention from stored metadata or retain
feedback outside the version-keyed component. Preserve the existing protection
against stale booking status/version; removing the key alone is not a complete fix.

## Original review verification

- `npm.cmd run check`: lint, TypeScript, 241 automated tests, content validation
  and production build all passed.
- Full HTTP workflow against the production build, a new disposable MongoDB
  database and a loopback-only Resend simulator passed:
  - Authentication and unauthenticated access checks.
  - Public request, identical replay and changed-payload rejection.
  - Two simultaneous bookings with different therapists; same-therapist clash rejected.
  - Confirmation, correct customer/therapist recipients and retained internal notes.
  - Stale update rejected; notes-only update produced no email.
  - Reschedule, reassignment and cancellation produced their separate messages.
  - Public status changed to the existing privacy-safe Closed state after cancellation.
  - Accepted and bounced events did not resend through the manual retry API.
  - Simulated provider rejection did not undo a confirmation; therapist delivery
    proceeded independently; manual customer retry succeeded.
  - Signed delivery events arriving before send responses were reconciled.
  - Authenticated booking-detail HTML showed current status, notes and delivery.
- The HTTP run made 14 simulated email calls; no real email provider was contacted.
- Ten real MongoDB concurrency scenarios passed: first-use date locks for two
  therapists (admin/public), plus booking versus therapist deactivation/eligibility
  changes in both operation orders. No scheduling defect was reproduced.
- Every created disposable test database was removed and its absence verified.

Ignored diagnostic scripts under `.tmp/` preserve reproductions:
`recheck-booking-http.ts`, `recheck-email-lifecycle.ts`, and
`recheck-day-lock-race.ts`. They are test artifacts, not application changes.

## Current production/read-only checks

- Live health and booking page respond 200, but `/book` still has no therapist picker.
- Editable and published content are both revision 17.
- Capacity is still **1**, not the approved **2**. Apply the choice only after
  deploying and verifying the therapist-enabled workflow.
- Both Siriranee and Mon (Ubon) are active public therapists.
- Two upcoming confirmed bookings remain unassigned:
  - `SRN-20260919-6981B0`: 19 September, 11:00 Dublin time. Owner already chose Siriranee.
  - `SRN-20260921-DCA1FB`: 21 September, 12:00 Dublin time. Therapist choice still needed.
- All four booking-launch/delivery indexes are present; the read-only dry run made no changes.
- Recent metadata shows five owner and two customer emails accepted by Resend.
  It does not prove inbox delivery. No live resend or inbox verification was done.
- The local webhook signing secret is unset. Production environment values were
  not inspected, so local configuration must not be presented as hosted configuration.
- Automatic background recovery remains intentionally excluded per the owner's
  instruction. The findings concern normal delivery/manual retries and staff visibility.

The original review made no production changes or application fixes. The
authorized follow-up fixes and their validation are recorded at the top of
this report; deployment and a controlled live email test remain outstanding.
