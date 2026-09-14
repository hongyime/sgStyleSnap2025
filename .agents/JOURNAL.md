- 2026-09-14: Added a manual metadata-only identity probe because the retained inventory omits ETags; verify provider field availability before enabling the private copy worker. Preserve all source records and stay on Free plans.
- 2026-09-14: The live batch-field probe confirmed that ETags are omitted. Added an explicit single-asset metadata mode using the documented detail endpoint; keep the same three-request bound and do not retry or copy media automatically.

2026-09-14: Reconciled the disabled archive draft with released main. Replace unsupported batch ETag reads with the live-verified asset-detail endpoint; account for paired identities and derived scans within the unchanged 200-unit Reader limit before transfers.

2026-09-14: Asset-detail adapters pass 148 offline tests. Both identity passes fit before a request; variants reserve two 12-unit scans and use an 88-object limit. Retained-manifest accounting is 15,814 source Admin units before retries; Storage/transfer reservations remain unchanged and copy gates remain closed.

2026-09-14: PR #135 exposed cross-workflow cancellation before the manifest validation job started. Separate offline checks by workflow/ref while preserving the shared manual metadata group and cancel-in-progress: false. Require the full 148-test hosted result before release.

2026-09-14: Private media delivery will reuse current source-row RLS through verified source-field bindings; archive manifests and checkpoints remain service-only. Reads stay disabled during implementation.

2026-09-14: Prepared access policy and browser reader pass 41 isolated tests; current source grants match the fixture. Read buffers are byte-limited and SHA-256 checked, cancellation closes pending streams, and no source-URL fallback or shared auth cache is used. Existing unit tests/build pass; live activation and application integration remain open.

- 2026-09-14: PR #134 and its one manual detail probe are verified in production; the original checkout was fast-forwarded while preserving existing edits. The disabled bulk adapter still needs the verified detail query and an explicit per-asset request budget. Keep every retained record.
- 2026-09-14: PR #135 is released at a5166348 after 148 hosted Python tests, seven encryption tests and 14 browser smoke tests. Vercel production is READY and both public aliases pass anonymous navigation. Preserve the unapplied archive migration and disabled copy gates; current usage and full media parity remain open.
