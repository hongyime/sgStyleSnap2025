# StyleSnap maintenance

The production app still uses Cloudinary for media. The encrypted manifest export
is released; no archive schema, media copy or application cutover is enabled.

A manual metadata probe was released in PR #133 after all hosted checks passed.
Its live run stopped with `etag_unavailable` after two requests and 4,461 response
bytes; no media or database requests were made. The batch endpoint omits ETags.
A follow-up mode checks one asset using documented `image_metadata=true` detail
reads, retaining the original three-request / 64 KiB response bounds. Its first
live run is pending. A sample does not establish full parity or capacity.

Next: validate and release the detail mode, run it once, and record its result.
Keep the private archive worker draft disabled until fresh identities, full
delivery parity, privacy and current organization capacity are verified.
