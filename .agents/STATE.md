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

Current branch: feat/private-media-integration. Verified source-field planning
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
