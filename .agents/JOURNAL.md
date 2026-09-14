- 2026-09-14: Added a manual metadata-only identity probe because the retained inventory omits ETags; verify provider field availability before enabling the private copy worker. Preserve all source records and stay on Free plans.
- 2026-09-14: The live batch-field probe confirmed that ETags are omitted. Added an explicit single-asset metadata mode using the documented detail endpoint; keep the same three-request bound and do not retry or copy media automatically.

2026-09-14: Reconciled the disabled archive draft with released main. Replace unsupported batch ETag reads with the live-verified asset-detail endpoint; account for paired identities and derived scans within the unchanged 200-unit Reader limit before transfers.

2026-09-14: Asset-detail adapters pass 148 offline tests. Both identity passes fit before a request; variants reserve two 12-unit scans and use an 88-object limit. Retained-manifest accounting is 15,814 source Admin units before retries; Storage/transfer reservations remain unchanged and copy gates remain closed.

2026-09-14: PR #135 exposed cross-workflow cancellation before the manifest validation job started. Separate offline checks by workflow/ref while preserving the shared manual metadata group and cancel-in-progress: false. Require the full 148-test hosted result before release.
