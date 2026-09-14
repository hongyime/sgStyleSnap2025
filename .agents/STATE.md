# StyleSnap maintenance

The production app still uses Cloudinary. PR #134's single-asset metadata probe
passed live: one stable ETag, three metadata requests, no media or Supabase calls.
The batch endpoint does not return the ETags required by the archive draft.

The disabled archive draft is reconciled onto that released main, preserving
the export and probe tools. Asset-detail reads now use the verified endpoint and
64 KiB cap, with both passes budgeted before requests. The shared 200-unit limit
supports 100 originals or 88 variants with two bounded inventories. A provider
failure ends the attempt; staged data and reservations remain for reconciliation.
All 148 offline tests pass. Hosted validation and source publication are next.

The unchanged retained manifest uses 80 checkpoints and reserves 594,719,352
Storage bytes plus at most 3,298,163,708 Supabase transfer bytes. Corrected source
accounting adds 15,814 Admin units and at most 1,236,140,032 metadata response
bytes before retries. These are bounds, not verified current usage/headroom.

No archive SQL, bucket, media copy or cutover is enabled. All source records and
raw manifest provenance must remain. Current usage, delivery-byte parity, four
unmaterialized thumbnail references and private readers/writers remain open.
