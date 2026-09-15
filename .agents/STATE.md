# StyleSnap maintenance

Production source is at PR #141 (`148b6d63`). Cloudinary remains active; no private
archive migration, bucket, media copy, Edge deployment or feature flag is enabled.

Current work: `feat/trusted-media-uploads`, using Conventional Commits and the
repository PR template against main. The prepared clothing create/replacement
path now verifies user identity and received bytes, reserves Storage and egress,
retains original/processed/thumbnail objects, and atomically publishes source rows,
bindings, immutable prior versions, catalog contribution and durable receipts.
IndexedDB recovery retains both original and processed Files before sending;
reloads and tabs reuse request IDs. Confirmed receipts survive failed responses.
An account change prevents another account's result from appearing in the UI.

The local maximum-body Deno probe exceeded two CPU seconds at 21 MiB. The new
path therefore limits original and processed files to 4 MiB each and thumbnails
to 1 MiB; one multipart upload runs per worker. The revised 9 MiB synthetic probe
used 579 ms CPU and about 129 MiB sampled process RSS. These local measurements
do not prove hosted runtime capacity. No retained originals are reduced/deleted.

Native PostgreSQL 17.11 validated migration application, unchanged legacy catalog
trigger behavior, client privilege denial and two simultaneous reservations for
the single remaining item slot. Browser tests validate native IndexedDB across
reloads/tabs, exact Files, explicit consent, thumbnails and keyboard recovery on
desktop/mobile. Current checks and release evidence are recorded in the existing
handoff; required hosted checks and production verification follow the PR.

Activation remains blocked by full retained-byte and reference parity, source
delta/rollback tests, hosted privacy/runtime checks and fresh monthly headroom.
Storage/egress guards expire after one hour: a verified operating process for
renewing those budgets is required. Catalog adoption, avatars, scoring and try-on
still require complete private writer/consumer coverage; the scoring host is
suspended. The owner must choose future catalog contribution in the existing
HTML (`opt_in`, `public_only`, or existing `legacy`). No choice is made here.
Preserve all stored media, catalog records, source history and local edits.

Detailed continuation: `.agents/handoffs/stylesnap-private-uploads-20260915.json`.
