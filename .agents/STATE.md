# StyleSnap maintenance

PR #135 is released at a5166348; production still uses Cloudinary. The archive
copy remains disabled, its SQL unapplied, and all source media/provenance retained.

Private delivery is being implemented on a separate branch. Read-only live schema
checks confirm the existing public, owner, friend and history access rules, and no
Storage object policies. The new prepared binding/access migration starts with
reads disabled. It delegates to source-row RLS, matches the current source URL,
and restricts Storage access to authenticated object GET/info operations. It
creates no bucket and grants no upload, overwrite, deletion or provenance access.

The prepared migration passes 22 PostgreSQL RLS tests with synthetic records and
the observed SELECT policies. The browser reader passes 19 real-SDK tests with
injected responses: exact byte/hash parity, rejected mappings, stream limits,
deadline cancellation and fresh permission checks. Existing 76 unit tests and
the production build pass. Source-table grants and RLS flags were also confirmed
read-only. No live migrations, Storage requests or media transfers were run.

The reader is not connected to views yet. Next: generate bindings from verified
copy checkpoints, integrate readers with bounded concurrency and object-URL
cleanup, finish private uploads and validate hosted Storage behavior. Monthly and
source quota headroom, complete delivery parity and cutover remain open.
