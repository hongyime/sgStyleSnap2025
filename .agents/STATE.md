# Private binding version retention - 2026-09-15

Branch `feat/media-binding-versions` prepares private append-only mapping history. The active reader schema stays unchanged. Initial import members retain exact version identities; later replacements and additional active records must not change initial completion counts. All 16 version-retention cases and 67 existing media cases pass locally. Native PostgreSQL 17.11 applies the migration, preserves the initial mapping and membership, and denies private history access. The security advisor reports no warnings or errors. One assertion was corrected to match PostgreSQL SQLSTATE 23502; the orphaned-member rollback then passed. Hosted validation and release remain pending. No live migration, bucket, media copy, writer permission or activation is included. Trusted atomic upload publication, original-byte retention, catalog choice, hosted permissions, full parity, quota and rollback remain required before cutover.

# StyleSnap maintenance

PR #135 is released at a5166348; production still uses Cloudinary. The archive
copy remains disabled, its SQL unapplied, and all source media/provenance retained.

PR #136 is released at 0eec9655 with Vercel production READY and both public
aliases verified. The source prepares private delivery; it does not activate it. Read-only live schema
checks confirm the existing public, owner, friend and history access rules, and no
Storage object policies. The new prepared binding/access migration starts with
reads disabled. It delegates to source-row RLS, matches the current source URL,
and restricts Storage access to authenticated object GET/info operations. It
creates no bucket and grants no upload, overwrite, deletion or provenance access.

The prepared migration passes 22 PostgreSQL RLS tests with synthetic records and
the observed SELECT policies. The browser reader passes 21 real-SDK tests with
injected responses: exact byte/hash parity, rejected mappings, stream limits,
deadline cancellation, fresh permission checks and explicit retry suppression. Existing 76 unit tests and
the production build pass. Source-table grants and RLS flags were also confirmed
read-only. No live migrations, Storage requests or media transfers were run.

At PR #136 the reader was not connected to views. The later PR #139 connects them.
Next: generate bindings from verified
copy checkpoints, integrate readers with bounded concurrency and object-URL
cleanup, finish private uploads and validate hosted Storage behavior. Monthly and
source quota headroom, complete delivery parity and cutover remain open.

The SDK default retried transient metadata failures four times. The follow-up
sets retry(false); both HTTP 520 and network failures must stop after one request.

PR #137 is released at 1bed9a2a. All 14 PR checks and six main workflows pass;
43 media-access tests, 76 unit tests and 14 browser smoke tests pass in CI.
Vercel production is READY and both public aliases pass anonymous navigation.
The reader remains inactive and delivery SQL unapplied.

PR #138 is released at b8f0dedb. Verified source-field planning
and bounded publication are implemented. Complete original/variant checkpoints
and explicit delivery-byte proofs are required; missing and external references
remain in the private plan. The plan reserves additional storage explicitly,
including the existing checkpoint pool and other projects in the capacity check.
Transactions publish at most 100 fields, checking hashes, current source URLs
and object sizes. Conflicts roll back; interrupted batches resume without double
counting. Completed publication is required before read activation.

All 162 Python maintenance tests and 67 combined media checks pass, including
24 SQL publication/reservation cases. All 76 existing unit tests, the build
and 14 browser smoke checks pass. No new SQL, bucket, copy
or live reader has been activated. Next: finish validation and source review,
then connect all image views and private uploads. Fresh quota, full byte parity,
hosted privacy, source-delta and rollback checks still gate the live cutover.

PR #139 (feat/private-media-views) is released at 75d544c9. Thirty clothing/avatar presentation
sites now pass exact source-row identities to a shared private reader, behind
VITE_PRIVATE_MEDIA_ENABLED=false. The loader bounds active and queued reads,
shares mounted views, and revokes URLs on unmount, offscreen/hidden views and
session changes. Private failures use local placeholders and suppress legacy
avatar error callbacks that could restore provider URLs. Canvas copies need
original IDs for both clothes and catalog rows; a regression caught the latter.
All 96 unit cases (including 20 new loader/component cases), 67 media access
checks, type checking and the production build pass locally. Ten real-SDK
desktop/mobile browser cases and all 14 existing application smoke cases pass. Browser regression caught an explicit
sign-out after an initially empty session; it now always invalidates the loader.
All 14 PR checks and six main workflows passed. Production and preview are READY;
nine public HTTP and two production browser checks passed. Private delivery is off.

This presentation change does not complete the migration. Programmatic scoring
and try-on still use source URLs, and uploads still use Cloudinary. The scoring
host currently responds "Service Suspended", so its private-byte API contract
cannot yet be verified. Private uploads require trusted byte verification,
capacity/ownership checks and atomic source/binding publication. Preserve both
original input and processed variants. Do not enable the build flag or live
delivery until those paths, all retained bytes, hosted permissions, quota,
source delta and rollback are verified. No live SQL, bucket or media transfer
was performed during this presentation work.

Current branch: fix/retain-upload-drafts, following the repository's conventional
branch/commit rules and main-targeted PR template. Live schema and trigger definitions
were checked read-only. Two regressions reproduced selected-file upload failures
becoming successful placeholder records; the service now rejects those failures
without inserting. Three form regressions exposed discarded originals and
submission during image processing. The forms now retain original/processed
pairs for retry and prevent submission while processing. Update failures now keep
the caller's files and prior URLs intact; SQL payloads exclude File objects.
Recognition-error previews are bounded to one retained URL and released on
replacement/unmount. A closed dialog ignores late image processing. Eleven
focused cases and all 105 unit tests pass, as do type checking and the production
build. This fix is awaiting hosted validation and release.

This release fixes existing uploads; it does not persist originals to Supabase.
Private Supabase upload implementation remains pending. The current binding
key cannot retain image replacements in one active manifest. Publication must
preserve prior versions, reserve capacity before network writes, verify stored
bytes, and commit source rows plus bindings atomically. Existing catalog adoption
and new OAuth avatars also need complete writer coverage before cutover.

Live auto_contribute_to_catalog currently adds every upload to an active public
anonymous catalog even when the clothing row is private/friends. This behavior
needs an explicit choice in the owner HTML: keep existing anonymous contribution
or limit it to public/opted-in items. Do not silently expose original files or
change visibility of retained catalog records. Quota, parity, hosted privacy,
rollback and programmatic AI transport still gate production migration.
