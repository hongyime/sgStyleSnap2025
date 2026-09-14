"""Bounded single-member gzip objects, with separate raw and stored identities."""
from __future__ import annotations

import gzip
import re
import zlib
from typing import Any

from stylesnap_media import MediaError, digest

MAX_STORED_JSON_BYTES = 8_000_000
MAX_MANIFEST_RAW_BYTES = 32 * 1024 * 1024
MAX_CHECKPOINT_RAW_BYTES = 8_000_000
DESCRIPTOR_FIELDS = {"encoding", "compression_level", "raw_sha256", "raw_bytes", "compressed_sha256", "compressed_bytes"}


def raw_limit(namespace: str) -> int:
    if namespace == "manifests": return MAX_MANIFEST_RAW_BYTES
    if namespace == "checkpoints": return MAX_CHECKPOINT_RAW_BYTES
    raise MediaError("invalid_private_json_namespace")


def validate_descriptor(namespace: str, descriptor: dict[str, Any]) -> None:
    if (not isinstance(descriptor, dict) or set(descriptor) != DESCRIPTOR_FIELDS
            or descriptor.get("encoding") != "gzip" or type(descriptor.get("compression_level")) is not int
            or descriptor["compression_level"] != 6):
        raise MediaError("invalid_private_json_descriptor")
    for name in ("raw_sha256", "compressed_sha256"):
        if not isinstance(descriptor[name], str) or not re.fullmatch(r"[0-9a-f]{64}", descriptor[name]):
            raise MediaError("invalid_private_json_descriptor")
    for name, maximum in (("raw_bytes", raw_limit(namespace)), ("compressed_bytes", MAX_STORED_JSON_BYTES)):
        if type(descriptor[name]) is not int or not 0 < descriptor[name] <= maximum:
            raise MediaError("private_json_size_limit")


def encode_private_json(namespace: str, raw: bytes) -> tuple[bytes, dict[str, Any]]:
    if not isinstance(raw, bytes) or not 0 < len(raw) <= raw_limit(namespace):
        raise MediaError("private_json_expanded_size_limit")
    compressed = gzip.compress(raw, compresslevel=6, mtime=0)
    # Normalize the non-content OS header byte across supported Python versions.
    compressed = compressed[:9] + b"\xff" + compressed[10:]
    descriptor = {"encoding":"gzip", "compression_level":6, "raw_sha256":digest(raw), "raw_bytes":len(raw),
                  "compressed_sha256":digest(compressed), "compressed_bytes":len(compressed)}
    validate_descriptor(namespace, descriptor)
    return compressed, descriptor


def decode_private_json(namespace: str, compressed: bytes, expected_raw_sha: str,
                        descriptor: dict[str, Any] | None = None) -> tuple[bytes, dict[str, Any]]:
    """Never use gzip.decompress/flush, which can expand without an output cap.

    Manifests require their approved descriptor. A checkpoint's durable raw hash
    remains its authority; without a descriptor its expanded size is capped and
    both observed identities are returned after exact raw-hash verification.
    """
    maximum_raw = raw_limit(namespace)
    if not isinstance(expected_raw_sha, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_raw_sha):
        raise MediaError("invalid_private_json_identity")
    if not isinstance(compressed, bytes) or not 0 < len(compressed) <= MAX_STORED_JSON_BYTES:
        raise MediaError("private_json_stored_size_limit")
    if namespace == "manifests" and descriptor is None:
        raise MediaError("manifest_descriptor_required")
    if descriptor is not None:
        validate_descriptor(namespace, descriptor)
        if (descriptor["raw_sha256"] != expected_raw_sha or len(compressed) != descriptor["compressed_bytes"]
                or digest(compressed) != descriptor["compressed_sha256"]):
            raise MediaError("private_json_compressed_parity_failed")
        maximum_raw = descriptor["raw_bytes"]
    try:
        inflater = zlib.decompressobj(wbits=31)
        raw = inflater.decompress(compressed, maximum_raw + 1)
    except zlib.error:
        raise MediaError("invalid_private_json_encoding") from None
    if len(raw) > maximum_raw or inflater.unconsumed_tail:
        raise MediaError("private_json_expanded_size_limit")
    if not inflater.eof:
        raise MediaError("truncated_private_json")
    if inflater.unused_data:
        raise MediaError("private_json_trailing_data")
    if not raw or digest(raw) != expected_raw_sha or (descriptor is not None and len(raw) != descriptor["raw_bytes"]):
        raise MediaError("private_json_raw_parity_failed")
    # A checkpoint resumed using only its durable raw hash does not establish
    # the encoder's compression level. Keep that observation explicitly unknown.
    observed = {"encoding":"gzip", "compression_level":descriptor["compression_level"] if descriptor else None,
                "raw_sha256":digest(raw), "raw_bytes":len(raw),
                "compressed_sha256":digest(compressed), "compressed_bytes":len(compressed)}
    return raw, observed
