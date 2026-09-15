- 2026-09-14: Added a manual metadata-only identity probe because the retained inventory omits ETags; verify provider field availability before enabling the private copy worker. Preserve all source records and stay on Free plans.
- 2026-09-14: The live batch-field probe confirmed that ETags are omitted. Added an explicit single-asset metadata mode using the documented detail endpoint; keep the same three-request bound and do not retry or copy media automatically.

2026-09-14: Reconciled the disabled archive draft with released main. Replace unsupported batch ETag reads with the live-verified asset-detail endpoint; account for paired identities and derived scans within the unchanged 200-unit Reader limit before transfers.

2026-09-14: Asset-detail adapters pass 148 offline tests. Both identity passes fit before a request; variants reserve two 12-unit scans and use an 88-object limit. Retained-manifest accounting is 15,814 source Admin units before retries; Storage/transfer reservations remain unchanged and copy gates remain closed.

2026-09-14: PR #135 exposed cross-workflow cancellation before the manifest validation job started. Separate offline checks by workflow/ref while preserving the shared manual metadata group and cancel-in-progress: false. Require the full 148-test hosted result before release.

2026-09-14: Private media delivery will reuse current source-row RLS through verified source-field bindings; archive manifests and checkpoints remain service-only. Reads stay disabled during implementation.

2026-09-14: Prepared access policy and browser reader pass 41 isolated tests; current source grants match the fixture. Read buffers are byte-limited and SHA-256 checked, cancellation closes pending streams, and no source-URL fallback or shared auth cache is used. Existing unit tests/build pass; live activation and application integration remain open.

- 2026-09-14: PR #134 and its one manual detail probe are verified in production; the original checkout was fast-forwarded while preserving existing edits. The disabled bulk adapter still needs the verified detail query and an explicit per-asset request budget. Keep every retained record.
- 2026-09-14: PR #135 is released at a5166348 after 148 hosted Python tests, seven encryption tests and 14 browser smoke tests. Vercel production is READY and both public aliases pass anonymous navigation. Preserve the unapplied archive migration and disabled copy gates; current usage and full media parity remain open.

2026-09-14: PR #136 is released at 0eec9655 after all 13 PR checks, 41 new tests, 76 existing unit tests and 14 browser smoke tests. Both production aliases pass anonymous navigation. The original checkout and prior notes are reconciled; local configuration and all retained media remain unchanged. Delivery SQL remains unapplied and views/uploads are not cut over.

2026-09-14: A final SDK review found that metadata GETs retry HTTP 520 and network failures by default. Both synthetic cases made four requests; explicitly disable SDK retries in the private reader and require one-attempt regression tests before activation.

2026-09-14: PR #137 released at 1bed9a2a after 14 passing PR checks, 43 access/reader tests, 76 unit tests and 14 browser smoke tests. Transient metadata errors now make one request. Production and both public aliases verified; source media and local configuration preserved. Private delivery remains inactive.
2026-09-15: Binding publication retains the full verified plan privately, reserves its own additional storage and commits bounded source-field batches without source edits. Checkpoint, URL, size and completion guards remain prerequisites; publication alone does not authorize application cutover.
2026-09-15: Thirty persisted-media presentation sites now use exact source references behind a default-off flag. Bound downloads and resident bytes, revoke on view/session changes, and suppress provider fallback in private mode. Catalog canvas identity and empty-session sign-out regressions were reproduced and fixed. Uploads and AI consumers remain cutover prerequisites; the suspended scoring host is recorded separately from passing local presentation tests.
2026-09-15: Use fix/retain-upload-drafts for the focused upload correction. Selected-file failures must not insert placeholder records, and database update failures must preserve the caller's files and prior URLs. Keep original/processed pairs in the form for retry and bound preview cleanup. Private durable uploads remain pending; the existing automatic public catalog contribution requires an explicit future-sharing decision before cutover.

2026-09-15: Preserve immutable private binding versions and initial import membership while keeping the public reader schema stable. Validate against synthetic PostgreSQL before source release; retain all live migration gates.

2026-09-15: Prepare trusted private clothing uploads on feat/trusted-media-uploads. Preserve originals, processed files, prior rows and bindings; reserve capacity before immutable writes and publish atomically with durable retry receipts. Keep all live switches off. Native browser recovery and PostgreSQL concurrency checks pass; lower new uploads to 4 MiB per source file after the larger local Deno CPU probe exceeded two seconds. Catalog choice, full writer/media coverage, hosted checks and current quota remain activation gates.

2026-09-15: Prepare catalog adoption on feat/private-catalog-adoption with verified existing objects, atomic bindings/provenance and owner-serialized duplicate prevention. Preserve catalog history and uploaded-photo count semantics. Keep legacy mode compatible and all private activation switches off. Native concurrent transactions create one item; local media/unit/build and catalog browser checks pass. Preserve the provider deployment wait, owner catalog-policy choice and full migration, hosted checks and quota gates before activation.

2026-09-16: Prepare private try-on inputs on feat/private-catalog-adoption. Resolve retained wardrobe identities through the verified private reader, retain originals, bound temporary AI derivatives and cancel private work on auth changes. Remove the two unused description calls without retiring credentials. Full unit/build and focused desktop/mobile checks pass; retain the Vercel hold, hosted provider checks and all storage activation gates.
