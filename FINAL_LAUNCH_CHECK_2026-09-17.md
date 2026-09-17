# Final launch check — 17 September 2026

## Follow-up: code fixes complete; ready for deployment and live acceptance

The owner authorized fixing all findings and assigning Siriranee to currently
unassigned bookings. Both code findings below are now fixed in the working tree.
They remain below as historical reproductions, not unresolved launch blockers.

- SDK network/JSON failures and absent HTTP status now remain uncertain. Legacy
  generic provider failures cannot gain a new retry window, and subsequent
  rejection/configuration failures preserve their original uncertainty.
- API outcomes, CMS labels and retry confirmation use the same uncertainty
  policy. Expired/exhausted retries give explicit manual-review instructions.
- Therapist save feedback preserves approved reassignment/conflict instructions
  without exposing arbitrary internal exceptions. Ambiguous saves still require
  checking the saved profile before retrying or uploading again.
- The sending-only Resend key was left unchanged. Read-only webhook/domain API
  inspection returned `restricted_api_key`; no provider permissions were widened.

### Production assignments completed

All three upcoming active unassigned bookings were assigned to **Siriranee**:

| Booking | Appointment, Dublin time | Verified version |
| --- | --- | --- |
| `SRN-20260919-6981B0` | 19 September, 11:00 | 4 |
| `SRN-20260921-DCA1FB` | 21 September, 12:00 | 3 |
| `SRN-20260921-EB3269` | 21 September, 13:00 | 3 |

The guarded migration checked eligibility, opening hours, closures, capacity,
therapist overlaps and a reviewed plan hash before one transaction. Readback
verified all remain confirmed, all other protected booking fields (including
encrypted customer data, notes and appointment snapshots) are unchanged, email
records are unchanged, and three audit events were recorded. **No emails sent.**
A subsequent dry run returned **zero candidates**. Past, terminal and expired
pending bookings were intentionally not rewritten.

### Verification after the fixes

- `npm.cmd run check`: lint, TypeScript, **290 automated tests**, content checks
  and production build passed. A second test-only run also passed all 290.
- Original installed-SDK reproduction now blocks every 25-hour retry, including
  the legacy failure followed by rate limiting.
- An independent code review found no remaining defect in the corrected paths.
- Isolated real MongoDB migration checks proved read-only dry run, rollback of
  the entire batch after a forced second-write failure, successful apply,
  unchanged encrypted/customer/email fields, and an empty rerun. Cleanup verified.
- Full isolated HTTP booking lifecycle passed with **17 simulated email calls**,
  including confirmation, cancellation, shared operational mailbox rules, manual
  retries, persistent warnings and signed webhook delivery. Cleanup verified.
  The simulator's old rejection payload lacked `statusCode`; it was updated to
  represent an explicit provider rejection. Missing status deliberately remains
  uncertain and has separate installed-SDK regression coverage.
- Rendered-site checks passed: **15 routes, 20 links, 62 images** plus metadata,
  schema, cache policy, CMS indexing, sitemap, robots, redirects and headers.
- Simulated hosted-environment validation passed; actual Vercel secrets were not
  inspected. Production had zero unresolved failed/indeterminate/sending Resend
  notification records in the read-only legacy-provenance audit.
- Owned test servers were stopped; isolated databases were removed and their
  absence verified. No real email was sent during this work.

### What remains before final launch approval

1. Deploy this reviewed working tree. No deployment was requested/performed.
2. Verify `https://siriranee.com/book` has therapist selection. Then set capacity
   to **2** through CMS booking settings. It remains **1** deliberately while the
   old deployed code lacks therapist-specific conflict enforcement. Recheck for
   new unassigned requests after cutover; the old site can still create them.
3. In Resend, verify the webhook endpoint
   `https://siriranee.com/api/webhooks/resend` and events `email.delivered`,
   `email.delivery_delayed`, `email.bounced`, `email.failed`, `email.complained`,
   `email.suppressed`. Store its signing secret as `RESEND_WEBHOOK_SECRET` in
   Vercel production and redeploy if changed. The restricted sending key cannot
   inspect/configure this; do not replace it with a broadly privileged key.
4. Run one controlled live booking through request, confirmation, status-link
   lookup and cancellation; verify customer/therapist inboxes and CMS delivery
   status. This remains distinct from the successful simulated workflow.

The code blockers are resolved. Local success is not proof that the new build,
hosted configuration or inbox delivery has been verified in production.

## Original review decision — resolved by the follow-up above

The normal booking lifecycle, scheduling constraints, shared owner/therapist
recipient rules and production build passed the checks below. However, a new
reproduction through the **installed Resend SDK** shows that an uncertain send
can be retried outside its duplicate-protection window. Fix this before launch.

This is a fresh review of the current working tree. The earlier findings marked
fixed in `BOOKING_PRELAUNCH_RECHECK_2026-09-17.md` remain historical; this report
adds a newly reproduced SDK-boundary defect and updates production observations.

No application fix, deployment, production data change or real email send was
performed in this review. Isolated test databases were removed and their absence
verified. Automatic background email recovery remains intentionally excluded.

## 1. P1 — Lost provider responses treated as definitely unsent (now fixed)

Relevant code:

- [SDK error classification](C:/Coding/2026/siriraneethaimassage/src/server/booking/resend-booking-email.ts:687)
- [Known-unsent failure list](C:/Coding/2026/siriraneethaimassage/src/domain/booking/email-retry-policy.ts:13)
- [Retry eligibility](C:/Coding/2026/siriraneethaimassage/src/server/cms/notification-service.ts:460)
- [Preservation of earlier uncertainty](C:/Coding/2026/siriraneethaimassage/src/server/cms/notification-service.ts:640)

The installed SDK catches network/response-parsing exceptions and returns
`application_error` with `statusCode: null`. The application classifies this as
`resend-provider-error`, which is in the known-unsent list. That permits a failed
notification to be retried after the application's original 23-hour safety
window and resets its first-attempt timestamp.

The provider may already have accepted the message when its response is lost.
Resend retains idempotency keys for only 24 hours; a later retry can therefore
send a duplicate. See the current [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys).

Reproduction used the actual installed SDK with all fetch calls replaced by a
local stub, fake credentials, fictional recipients and an in-memory repository:

| Simulated outcome | Recorded classification | Retry after 25 hours |
| --- | --- | --- |
| HTTP 200 with unreadable JSON response | `resend-provider-error` | Allowed |
| Socket/transport exception | `resend-provider-error` | Allowed |
| Existing ambiguous generic failure followed by a rate-limit rejection | `failed/resend-rate-limited` | Allowed |

The third case matters for existing records: a subsequent explicit rejection
does not prove that an earlier ambiguous send was never accepted.

Required correction:

1. Treat SDK errors with an unknown transport outcome as indeterminate, not
   definitely unsent.
2. Treat legacy `resend-provider-error` records conservatively; remove their
   permission to retry beyond the original protection window.
3. Preserve uncertainty and the original timestamp across subsequent failures,
   including known-unsent failures such as rate limiting.
4. Show the uncertain state in CMS retry guidance, and add regressions that go
   through the actual SDK wrapper, not only an injected sender.

The ignored reproduction is `.tmp/recheck-resend-sdk-outcome.ts`, runnable with
`node --import tsx .tmp/recheck-resend-sdk-outcome.ts`. It makes no network calls.

## 2. P2 — Therapist save errors hide the resolution instruction (now fixed)

[TeamEditorForm.tsx:50](C:/Coding/2026/siriraneethaimassage/src/components/cms/TeamEditorForm.tsx:50)
accepts only strings in `safeMessage`. A backend error is wrapped in `Error`, then
the catch handler passes that object back to `safeMessage` at line 256. The
specific message is replaced by a generic save failure.

For example, the server correctly refuses to disable a therapist with a future
booking and tells staff which booking to reassign. The UI hides that instruction.
The scheduling guard still works; this is an operational usability issue, not a
reproduced double-booking/data-loss defect. Preserve an approved error message in
the catch handler and add a form-error regression.

Verified by source tracing and execution of the actual helper logic. The final
browser confirmation interaction timed out in the browser-control connection,
so a full interactive reproduction of this therapist error was not completed.

## Verification completed in this review

- `npm.cmd run check` passed: ESLint, TypeScript, **266 tests**, content validation
  and the production build.
- `git -c core.safecrlf=false diff --check` passed.
- Production-rendered checks passed for **15 routes, 20 internal links and 62
  images**, including metadata/schema, sitemap, robots, security headers, API
  cache behavior, CMS noindex and redirects.
- `/therapists` and `/therapists/siriranee` returned 404 in the local production
  build. `/masseuses` redirected to `/book`; therapist booking selection and CMS
  management remain present.
- The hosted-environment validator passed with a simulated hosted configuration.
  This verifies validation rules, not the actual Vercel environment or credentials.
- All four booking-launch/delivery database indexes were already present; the
  read-only index dry run made no changes.
- **Ten real MongoDB concurrency cases** passed: public/admin booking versus
  therapist deactivation or service-eligibility changes in both operation orders,
  plus first-use day locks for different therapists. Cleanup was verified.
- The full HTTP workflow passed against the production build, an isolated MongoDB
  database and a loopback Resend simulator, with **17 simulated email calls**:
  - Authentication and unauthenticated access protection.
  - Public booking creation, identical replay and conflicting replay rejection.
  - Different-therapist concurrency and same-therapist overlap rejection.
  - Confirmation, separate customer/therapist delivery and retained internal notes.
  - Stale update rejection and no email from a notes-only edit.
  - Reschedule, reassignment and cancellation, including the previous therapist's
    original appointment time in removal notices.
  - Privacy-safe public booking status.
  - Provider rejection without rolling back booking status; independent therapist
    delivery and a safe manual customer retry.
  - Signed delivery webhooks arriving before send responses.
  - Accepted/bounced delivery records protected against unsafe manual resending.
  - Persistent email-attention warnings in authenticated CMS HTML.
- Shared owner/therapist inbox regressions passed: one operational message per
  lifecycle event, with customer messages separate. Initial request and later
  confirmation are intentionally different events. Two distinct therapist
  profiles sharing an inbox remain separate removal/assignment recipients.
- Browser spot checks verified the public therapist selector, no public therapist
  navigation, CMS email-attention visibility, booking-detail fields and a new
  fictional CMS booking. The public form correctly displayed its rate-limit
  error after earlier HTTP tests exhausted the isolated client's allowance.
  A further browser confirmation click could not be verified because browser
  control timed out; confirmation itself passed the HTTP workflow above.

All simulated email recipients were fictional. No customer or therapist received
a message from these tests. Test servers owned by this run were stopped and all
created isolated databases were removed with absence checks.

## Production observations before the authorized assignment backfill

- Live health and `/book` returned HTTP 200, but the deployed booking page still
  had no therapist picker. Local working-tree results are not deployed results.
- Editable and published content were both **revision 18**.
- Capacity was still **1**, not the approved **2**. Increase it only after deploying
  and verifying therapist-aware scheduling.
- Siriranee and Mon (Ubon) were active public therapists.
- **Three** upcoming confirmed bookings had no therapist assignment:

| Booking | Appointment, Dublin time | Assignment needed |
| --- | --- | --- |
| `SRN-20260919-6981B0` | 19 September, 11:00 | Siriranee already chosen by owner |
| `SRN-20260921-DCA1FB` | 21 September, 12:00 | Owner choice needed |
| `SRN-20260921-EB3269` | 21 September, 13:00 | Owner choice needed |

- Recent stored metadata contained six owner and three customer messages marked
  sent, without delivery-status metadata on those records. Provider acceptance
  does not establish inbox delivery.
- The local webhook signing secret was unset. Hosted environment values were
  not inspected; this does **not** establish that production is missing it.

## Original release sequence (superseded by the follow-up checklist)

1. Fix the SDK uncertainty/retry issue and preferably the therapist save feedback.
2. Re-run targeted regressions and the full check against the final patch.
3. Verify actual hosted environment, Resend sender/domain and signed webhook
   configuration, then deploy the reviewed build.
4. Re-read production bookings, apply the approved capacity of two and Siriranee
   assignment, and obtain the two remaining therapist choices before assigning.
5. Run one explicitly authorized live acceptance booking: customer request,
   owner confirmation, correct therapist/customer emails, automatic status-link
   lookup, and cancellation. Check provider delivery events and recipient inboxes,
   not just a successful HTTP response.

This is an application launch review, not an exhaustive penetration test or a
guarantee about third-party inbox placement.
