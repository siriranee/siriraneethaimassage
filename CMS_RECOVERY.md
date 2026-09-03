# Siriranee CMS backup and recovery

This runbook covers the custom Siriranee CMS and booking data. It must be tested
before direct public booking is enabled.

## Recovery boundary

A usable recovery requires all of these parts:

- source code and local public assets from the Git repository;
- the MongoDB database named by MONGODB_DB;
- the exact CMS_PII_ENCRYPTION_KEY used for encrypted booking contact data;
- deployment environment configuration and canonical domain settings;
- the Cloudinary account, owned folder, committed image assets and the
  cmsMediaAssets registry that connects provider assets to CMS content;
- the Cloudinary credentials and separate CMS_MEDIA_TOKEN_SECRET held in the
  protected secret store;
- provider configuration for hosting, monitoring and future notifications;
- a record of the deployed source revision and database backup timestamp.

There is no payment-provider data in this application. Cloudinary image bytes
are not stored in MongoDB backups: database recovery restores their registry
and URLs, while the provider account remains a separate recovery boundary.

The PII key is not embedded in MongoDB backups. Losing or changing it makes
existing customer details unreadable. The current v1 encryption envelope does
not implement online key rotation, so keep the exact key in a protected recovery
store and test access to it.

## Safety rules

- Restore into a newly named isolated database first.
- Never use --drop against the production database as a routine restore step.
- Keep all public-booking readiness flags false during a restore drill.
- Do not place database archives, keys or plaintext credentials in Git.
- Use a separate, unique restore-only administrator username when validating an
  isolated copy.
- Record who ran the backup/restore, when it ran, the source revision and the
  verification result.

## MongoDB collections

The current application uses:

- cmsContent
- cmsPublications
- cmsMeta
- cmsUsers
- cmsSessions
- cmsLoginAttempts
- cmsAuditEvents
- cmsBookings
- cmsBookingNotifications
- cmsClosures
- cmsBookingHolds
- cmsBookingDayLocks
- cmsMediaAssets

TTL indexes may remove expired sessions, login attempts and booking holds.
Audit events are retained for 365 days from creation and then expire through a
TTL index. A logical backup is therefore a point-in-time operational snapshot,
not a permanent history of expired records.

The cmsMediaAssets collection deliberately has no TTL index. Incomplete records
retain the ownership evidence needed for safe, idempotent provider cleanup, and
committed records protect assets referenced by current content and immutable
publication history. Failed content saves attempt immediate rollback. There is
no scheduled or batch cleanup API, so an interrupted browser or network session
must be reconciled with Cloudinary as an operator recovery task. Preserve any
`deleting` tombstone until the signed provider request can no longer be replayed.

## Create a logical backup

Run this only from a trusted workstation with MongoDB Database Tools installed.
Use protected environment variables and a backup directory outside the public
website.

~~~powershell
$backupStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDirectory = Join-Path (Get-Location) "private-backups\siriranee-$backupStamp"
$backupArchive = Join-Path $backupDirectory "siriranee.mongodb.gz"
New-Item -ItemType Directory -Path $backupDirectory | Out-Null

mongodump --uri $env:MONGODB_URI --db $env:MONGODB_DB --archive=$backupArchive --gzip
Get-FileHash -Algorithm SHA256 -LiteralPath $backupArchive
~~~

Store with the archive:

- SHA-256 checksum;
- UTC backup time;
- MONGODB_DB name;
- deployed Git commit;
- application version;
- operator;
- confirmation that the protected PII key is independently recoverable.
- Cloudinary account and owned-folder identifiers, an inventory timestamp, and
  confirmation that provider credentials and CMS_MEDIA_TOKEN_SECRET are
  independently recoverable.

Do not copy the PII key into the same archive.
Do not copy Cloudinary or media-token secrets into the database archive.

## Restore to an isolated database

Choose a new name and confirm it is not the production database.

~~~powershell
$restoreStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$sourceDatabase = $env:MONGODB_DB
$restoreDatabase = "siriranee_restore_$restoreStamp"

if ($restoreDatabase -eq $sourceDatabase) {
  throw "Restore database must be different from the source database."
}

mongorestore --uri $env:MONGODB_URI --archive=$backupArchive --gzip --nsInclude="$sourceDatabase.*" --nsFrom="$sourceDatabase.*" --nsTo="$restoreDatabase.*"
~~~

Point a local or staging deployment at the isolated database:

~~~powershell
$env:CMS_MODE = "mongodb"
$env:MONGODB_DB = $restoreDatabase
$env:CMS_PUBLIC_BOOKING_READY = "false"
$env:CMS_MEDIA_UPLOAD_READY = "false"
~~~

Set the original PII key through the trusted secret channel, then install and
verify indexes:

~~~powershell
npm.cmd run cms:indexes
~~~

Provision a temporary restore-only administrator in the isolated database using
`CMS_SEED_USERNAME`, `CMS_SEED_PASSWORD`, `CMS_SEED_DISPLAY_NAME` and
`CMS_SEED_ROLE`. Usernames contain 4-32 characters and passwords contain
12-256 characters; apply the complete rules documented in `.env.example`. Then
run:

~~~powershell
npm.cmd run cms:seed-admin
~~~

Remove the temporary seed values from the shell after provisioning. Do not
record or retain the plaintext password. The restore-only username must not
collide with a restored account.

## Verification checklist

1. Confirm the archive checksum before restore.
2. Confirm the restored database name is isolated.
3. Compare collection counts with the backup manifest.
4. Confirm cmsMeta/current-publication points to an existing publication.
5. Sign in with the restore-only administrator username and password.
6. Open the dashboard, services, vouchers, settings, bookings, calendar, admin
   and audit pages.
7. Verify at least one encrypted booking can be opened with the recovered key.
8. Verify a missing or incorrect key fails closed rather than exposing data.
9. Confirm published services, prices, promotions, vouchers, business
   information and site navigation match the restored publication. Confirm the
   source-controlled page copy, home hero and site gallery match the deployed
   source revision.
10. Compare committed cmsMediaAssets records with every current and historical
    content reference, then verify a sample from each image scope resolves from
    the original Cloudinary account.
11. Confirm a failed content save rolls its staged uploads back without deleting
    committed or publication-referenced assets. Reconcile any incomplete staged
    records left by an interrupted session directly against Cloudinary.
12. Run npm.cmd run check.
13. Start the isolated application and run npm.cmd run test:rendered.
14. Confirm public booking and CMS media uploads remain disabled and no
    notifications are sent.
15. Record the result, duration and any remediation work.

The notification collection contains operational preview metadata only; it must
not contain recipient addresses, phone numbers or message bodies. Confirm that
property during every recovery drill.

## Production recovery

Promoting a restore is a separate, approval-gated operation:

1. Identify the incident and freeze writes if required.
2. Select the newest verified backup that meets the agreed recovery point.
3. Restore and validate it in an isolated database.
4. Reconcile Cloudinary uploads/deletions and any other provider-side actions
   that occurred after the database backup. Never bulk-delete provider assets
   merely because they are absent from an older restored snapshot.
5. Obtain owner/technical approval.
6. Prefer switching the deployment to the verified restored database rather
   than overwriting the damaged database.
7. Deploy with public booking disabled.
8. Run authenticated CMS and public smoke tests.
9. Re-enable booking only after staff monitoring is confirmed.
10. Preserve the previous database for rollback until the recovery is signed
    off.

If validation fails, point the deployment back to the previous database and keep
public booking disabled while the cause is investigated.

## Schedule still to confirm

The owner and provider must agree:

- backup frequency and retention;
- target recovery point and recovery time;
- encryption and storage location;
- who receives backup-failure alerts;
- restore-test frequency;
- responsibility for the PII recovery key;
- secure deletion at the end of retention.

Until those decisions are made and one isolated restore drill passes, backups
and recovery are not production-ready.

This repository currently provides the runbook but does not execute backup or
restore commands on the owner's behalf. Adding project-integrated automation is
a separate sensitive operation and requires explicit authorization, provider
selection and an approved private storage destination.
