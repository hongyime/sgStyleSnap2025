# StyleSnap maintenance

The production app still uses Cloudinary for media. The encrypted manifest export
is released; no archive schema, media copy or application cutover is enabled.

A manual metadata probe now checks the proposed archive identity query with at
most three requests and ten images. Local validation passed 45 maintenance tests.
Hosted validation and the first manual probe remain pending. A passing sample
does not prove complete source parity or available monthly transfer capacity.

Next: validate and release the probe, run it once, and record its aggregate result.
Keep the private archive worker draft disabled until fresh identities, full
delivery parity, privacy and current organization capacity are verified.
