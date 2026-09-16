# Try-on private-binding fix ready for post-hold merge

PR #143 (`feat/private-catalog-adoption`, HEAD `dcbe475e`) opened against main: virtual try-on now uses `readPrivateMedia` + verified `mediaReference('clothes', record, url)` for both top and bottom garments in private mode; the two previously unused descriptions are wired. `npm test` = 125/125 green (13 files) including the three previously-failing private-consumer regressions. No private storage URLs exposed to client. Branch pushed to `origin/feat/private-catalog-adoption`.

DO NOT MERGE before 2026-09-16T07:14:05Z UTC (Vercel deployment retry hold from PR #142 rate-limit). After hold lifts: validate one preview + production release before merge. Cloudinary remains the live provider; private-media flag stays off until all migration gates pass.

---

# StyleSnap maintenance

Production source is at PR #142 (`e1b66bab`). Cloudinary remains active; no private
archive migration, bucket, media copy, Edge deployment or feature flag is enabled.

Current work: local, unreleased `feat/private-catalog-adoption`, using Conventional
Commits and the four-section repository PR template against main. The prepared
catalog-to-closet writer verifies identity, reuses existing verified objects and
atomically stores the item, two bindings, private provenance and an egress
reservation. Concurrent calls and explicit retries return one active item while
preserving its sharing setting. Existing catalog records and removed copies stay
intact. The separate upload path from PR #142 retains original/processed Files,
immutable prior versions and durable recovery receipts.

The local maximum-body Deno probe exceeded two CPU seconds at 21 MiB. The new
path therefore limits original and processed files to 4 MiB each and thumbnails
to 1 MiB; one multipart upload runs per worker. The revised 9 MiB synthetic probe
used 579 ms CPU and about 129 MiB sampled process RSS. These local measurements
do not prove hosted runtime capacity. No retained originals are reduced/deleted.

Native PostgreSQL 17.11 validated the catalog migration, unchanged legacy function,
client privilege denial and two simultaneous connections yielding one item and
one provenance record. The local media suite passes 150 tests, unit suite 114,
and the production build passes. All 42 browser cases pass on desktop/mobile, including six catalog cases and
36 existing navigation, media-view and upload-recovery cases. Local advisors report three
unchanged legacy function warnings and no new-object findings. All private
catalog switches default off. Hold pushes/PRs that trigger Vercel until the current
provider retry window ends (2026-09-16 07:14:05 UTC), unless fresh provider evidence
permits earlier. The wait does not establish monthly capacity.

Activation remains blocked by full retained-byte and reference parity, source
delta/rollback tests, hosted privacy/runtime checks and fresh monthly headroom.
Storage/egress guards expire after one hour: a verified operating process for
renewing those budgets is required. Avatar and scoring paths still require complete private coverage. Try-on input
transport is prepared locally; live provider/runtime validation is still required. The scoring host is
suspended. The owner must choose future catalog contribution in the existing
HTML (`opt_in`, `public_only`, or existing `legacy`). No choice is made here.
Preserve all stored media, catalog records, source history and local edits.

Initial binding parity must include existing wardrobe copies; catalog retry
confirmation does not repair historical missing bindings. Hosted checks and
production verification remain separate from local preparation.

Detailed continuation: `.agents/handoffs/stylesnap-private-catalog-20260915.json`.

Try-on follow-up (16 September): protected mode resolves exact retained wardrobe
references, reads checksum-verified private bytes and never falls back to the old
provider. Two unused Hugging Face description requests and their diagnostics-only
import are removed. Existing credentials and the unused service source remain.
AI preparation rejects inputs over 8 MiB and produces temporary derivatives up to
1024 pixels / 1 MiB each; stored originals stay intact. Both complete proxy bodies
fit below 3 MB in the maximum-input fixture. Fine texture may be reduced in the
AI derivative. Private mode uses the server proxy, cancels on auth changes, and
accepts the page cancellation signal. The proxy flow has a 90-second deadline;
this is not a hard bound on image-decoder CPU or upstream generation work.
Full unit run: 122 passed; expanded focused suite: 11 passed (125 distinct cases).
Production build passed. All 20 desktop/mobile private-media browser cases pass, including ten try-on
cases. Hosted checks and real AI generation are still unverified.
No live AI requests, storage copy, SQL, flags, credentials or deployment changed.
Private reader download caps, hosted proxy authentication/model compatibility,
real provider generation, retained-media parity and monthly capacity remain
separate checks. The independent scoring provider is still suspended.
