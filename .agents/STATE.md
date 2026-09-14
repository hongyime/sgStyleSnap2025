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

The reader is not connected to views yet. Next: generate bindings from verified
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

Current branch: feat/private-media-views. Thirty clothing/avatar presentation
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
Hosted review and production capacity remain to be checked.

This presentation change does not complete the migration. Programmatic scoring
and try-on still use source URLs, and uploads still use Cloudinary. The scoring
host currently responds "Service Suspended", so its private-byte API contract
cannot yet be verified. Private uploads require trusted byte verification,
capacity/ownership checks and atomic source/binding publication. Preserve both
original input and processed variants. Do not enable the build flag or live
delivery until those paths, all retained bytes, hosted permissions, quota,
source delta and rollback are verified. No live SQL, bucket or media transfer
was performed during this presentation work.
