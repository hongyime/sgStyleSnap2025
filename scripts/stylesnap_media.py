"""Bounded private media manifest and add-only copy primitives for StyleSnap.

The CLI only inventories. Copy primitives have no CLI or workflow entrypoint yet.
Provider metadata and image references stay in a private runner file; reports
contain only aggregate counts, byte totals, checksums, and fixed failure codes.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

PROJECT_REF = "nztqjmknblelnzpeatyx"
SUPABASE_URL = "https://" + PROJECT_REF + ".supabase.co"
MAX_JSON_BYTES = 8 * 1024 * 1024
MAX_OBJECT_BYTES = 50_000_000
MAX_ASSETS = 20_000
MAX_PAGES = 45
MAX_ADMIN_UNITS = 200
COPY_BUDGET_BYTES = 800_000_000  # Reserve at least 200 MB below a conservative 1 GB ceiling.
RESOURCE_TYPES = ("image", "video", "raw")
REFERENCE_COLUMNS = {
    "catalog_items": ("id", "image_url", "thumbnail_url", "cloudinary_public_id"),
    "clothes": ("id", "owner_id", "privacy", "image_url", "thumbnail_url", "removed_at"),
    "outfit_collections": ("id", "cover_image_url"),
    "outfit_history": ("id", "photo_url"),
    "users": ("id", "avatar_url"),
}


class MediaError(Exception):
    def __init__(self, code, http_status=None):
        super().__init__(code)
        self.code = code
        self.http_status = http_status


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def natural(value):
    if type(value) is not int or value < 0:
        raise MediaError("invalid_provider_counter")
    return value


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


class Reader:
    """Fixed provider origins, refused redirects, bounded bodies and API budget."""

    def __init__(self, env, opener=None):
        self.cloud = env.get("VITE_CLOUDINARY_CLOUD_NAME", "").strip()
        key = env.get("CLOUDINARY_API_KEY", "").strip()
        secret = env.get("CLOUDINARY_API_SECRET", "").strip()
        self.supabase_key = env.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not all((self.cloud, key, secret, self.supabase_key)):
            raise MediaError("missing_configuration")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", self.cloud):
            raise MediaError("invalid_configuration")
        if any(c in key + secret + self.supabase_key for c in "\r\n"):
            raise MediaError("invalid_configuration")
        # Configuration check only; the provider must still authenticate the token.
        if not self.supabase_key.startswith("sb_secret_"):
            try:
                payload = self.supabase_key.split(".")[1]
                claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
                if claims.get("ref") != PROJECT_REF or claims.get("role") != "service_role":
                    raise ValueError("wrong role or project")
            except Exception:
                raise MediaError("wrong_destination_credential") from None
        self.cloud_auth = "Basic " + base64.b64encode((key + ":" + secret).encode()).decode()
        self.opener = opener or urllib.request.build_opener(NoRedirects())
        self.admin_units = 0
        self.admin_unit_limit = MAX_ADMIN_UNITS
        self.source_requests = 0
        self.stage = "configuration"

    def request(self, url, headers, maximum=MAX_JSON_BYTES, method="GET", data=None):
        try:
            request = urllib.request.Request(url, method=method, headers=headers, data=data)
            with self.opener.open(request, timeout=30) as response:
                content = response.read(maximum + 1)
                if len(content) > maximum:
                    raise MediaError("response_too_large")
                return content
        except MediaError:
            raise
        except urllib.error.HTTPError as exc:
            raise MediaError("provider_http_error", exc.code) from None
        except Exception:
            raise MediaError("request_failed") from None

    def admin(self, path, params=None, units=1):
        if self.admin_units + units > self.admin_unit_limit:
            raise MediaError("admin_budget_reached")
        if not re.fullmatch(r"(?:usage|resources/(?:image|video|raw|search)|resources/(?:image|video|raw)/[A-Za-z_]+/.+|transformations(?:/.+)?)", path):
            raise MediaError("invalid_admin_path")
        self.admin_units += units
        url = "https://api.cloudinary.com/v1_1/" + self.cloud + "/" + path
        if params:
            url += "?" + urllib.parse.urlencode(params, doseq=True)
        raw = self.request(url, {"Authorization": self.cloud_auth, "Accept": "application/json"})
        return decode_json(raw)

    def database(self, table, after=None):
        if table not in REFERENCE_COLUMNS:
            raise MediaError("invalid_table")
        params = {"select": ",".join(REFERENCE_COLUMNS[table]), "order": "id.asc", "limit": 500}
        if after is not None:
            if not re.fullmatch(r"[0-9a-fA-F-]{36}", after):
                raise MediaError("invalid_database_cursor")
            params["id"] = "gt." + after
        raw = self.request(SUPABASE_URL + "/rest/v1/" + table + "?" + urllib.parse.urlencode(params),
                           {"Authorization": "Bearer " + self.supabase_key, "apikey": self.supabase_key})
        rows = decode_json(raw)
        if not isinstance(rows, list) or len(rows) > 500:
            raise MediaError("invalid_database_response")
        return rows

    def original(self, url, expected_size):
        validate_media_url(url, self.cloud)
        if not 0 < natural(expected_size) <= MAX_OBJECT_BYTES:
            raise MediaError("object_size_limit")
        self.source_requests += 1
        # No Admin or Supabase credentials ever accompany a delivery request.
        content = self.request(url, {"Accept": "*/*"}, maximum=expected_size)
        if len(content) != expected_size:
            raise MediaError("source_size_mismatch")
        return content


def decode_json(raw):
    try:
        value = json.loads(raw)
        if isinstance(value, dict) and "error" in value:
            raise ValueError("provider error")
        return value
    except (ValueError, TypeError):
        raise MediaError("invalid_provider_response") from None


def validate_media_url(url, cloud):
    try:
        parsed = urllib.parse.urlsplit(url)
        prefix = "/" + cloud + "/"
        if parsed.scheme != "https" or parsed.netloc != "res.cloudinary.com" or not parsed.path.startswith(prefix):
            raise ValueError("wrong media origin")
        if parsed.query or parsed.fragment or any(c in url for c in "\r\n"):
            raise ValueError("unexpected URL suffix")
        parts = urllib.parse.unquote(parsed.path[len(prefix):]).split("/")
        if len(parts) < 3 or parts[0] not in RESOURCE_TYPES or any(p in (".", "..") for p in parts):
            raise ValueError("invalid media path")
        return parts
    except Exception:
        raise MediaError("unsupported_media_url") from None


def pages(reader, path, collection, params=None):
    cursor = None
    seen = set()
    for _ in range(MAX_PAGES):
        query = {"max_results": 500, **(params or {})}
        if cursor is not None:
            query["next_cursor"] = cursor
        page = reader.admin(path, query)
        if not isinstance(page, dict) or not isinstance(page.get(collection), list) or len(page[collection]) > 500:
            raise MediaError("invalid_provider_page")
        yield page[collection]
        cursor = page.get("next_cursor")
        if cursor is None:
            return
        if not isinstance(cursor, str) or not cursor or len(cursor) > 2048 or cursor in seen:
            raise MediaError("repeated_provider_cursor")
        seen.add(cursor)
    raise MediaError("page_budget_reached")


def transformation_pages(reader, name):
    """Use the official SDK's query form; preserve chained transformation names."""
    received_page = False
    try:
        for page in pages(reader, "transformations", "derived", {"transformation": name}):
            received_page = True
            yield page
    except MediaError as exc:
        # Cloudinary documents a trailing slash for extensionless variants.
        # Only retry a first-page 404, once; never restart a partial enumeration.
        if exc.http_status != 404 or received_page or name.endswith("/"):
            raise
        reader.progress["extensionless_detail_lookups"] += 1
        yield from pages(reader, "transformations", "derived", {"transformation": name + "/"})


def derived_inventory(reader):
    derived = {}
    transformations = []
    reader.stage = "transformation_list"
    for page in pages(reader, "transformations", "transformations"):
        transformations.extend(page)
        reader.progress["transformations"] = len(transformations)
    for transformation in transformations:
        reader.stage = "derived_asset_list"
        name = transformation.get("name")
        if not isinstance(name, str) or not name or len(name) > 2048:
            raise MediaError("invalid_transformation")
        for page in transformation_pages(reader, name):
            for item in page:
                item_id = item.get("id")
                if not isinstance(item_id, str) or not item_id:
                    raise MediaError("missing_derived_identity")
                if item_id in derived and derived[item_id] != item:
                    raise MediaError("conflicting_derived_identity")
                natural(item.get("bytes"))
                validate_media_url(item.get("secure_url", ""), reader.cloud)
                derived[item_id] = item
                reader.progress["derived_assets"] = len(derived)
                if len(derived) > MAX_ASSETS:
                    raise MediaError("asset_budget_reached")
    return transformations, derived


def derived_probe(reader):
    reader.admin_unit_limit = 35
    reader.progress = {"transformations": 0, "derived_assets": 0, "extensionless_detail_lookups": 0}
    reader.stage = "usage_before"
    before = reader.admin("usage")
    transformations, derived = derived_inventory(reader)
    reader.stage = "usage_after"
    after = reader.admin("usage")
    if natural(before.get("derived_resources")) != natural(after.get("derived_resources")):
        raise MediaError("source_changed_during_inventory")
    if len(derived) != natural(after.get("derived_resources")):
        raise MediaError("provider_count_parity_failed")
    return {"status": "ok", "phase": "derived_probe", "admin_units": reader.admin_units,
            "transformation_count": len(transformations), "derived_count": len(derived),
            "derived_bytes": sum(natural(item["bytes"]) for item in derived.values()),
            "extensionless_detail_lookups": reader.progress["extensionless_detail_lookups"],
            "snapshot_consistency_proven": False, "copy_eligible": False}


def inventory(reader):
    reader.progress = {"original_assets": 0, "backup_assets": 0,
                       "version_details_completed": 0, "retained_versions": 0,
                       "transformations": 0, "derived_assets": 0,
                       "database_rows": 0, "database_tables_completed": 0,
                       "extensionless_detail_lookups": 0}
    reader.stage = "usage_before"
    before = reader.admin("usage")
    assets = {}
    reader.stage = "original_asset_list"
    for resource_type in RESOURCE_TYPES:
        for page in pages(reader, "resources/" + resource_type, "resources", {"direction": "asc", "tags": "true", "context": "true", "metadata": "true"}):
            for asset in page:
                asset_id = asset.get("asset_id")
                if not isinstance(asset_id, str) or not asset_id or asset_id in assets:
                    raise MediaError("duplicate_or_missing_asset")
                if asset.get("resource_type") != resource_type:
                    raise MediaError("invalid_asset_type")
                natural(asset.get("bytes"))
                natural(asset.get("version"))
                if asset.get("secure_url"):
                    validate_media_url(asset["secure_url"], reader.cloud)
                assets[asset_id] = asset
                reader.progress["original_assets"] = len(assets)
                if len(assets) > MAX_ASSETS:
                    raise MediaError("asset_budget_reached")

    # Search includes deleted backed-up assets; active-only listings would miss them.
    backups = {}
    reader.stage = "backup_asset_search"
    for page in pages(reader, "resources/search", "resources", {"expression": "(status=active AND backup_bytes>0) OR status=deleted"}):
        for asset in page:
            asset_id = asset.get("asset_id")
            if not isinstance(asset_id, str) or asset_id in backups:
                raise MediaError("duplicate_or_missing_backup")
            backups[asset_id] = asset
            reader.progress["backup_assets"] = len(backups)
    versions = {}
    reader.stage = "backup_version_details"
    for asset_id, asset in backups.items():
        resource_type, delivery = asset.get("resource_type"), asset.get("type")
        if resource_type not in RESOURCE_TYPES or not re.fullmatch(r"[A-Za-z_]+", delivery or ""):
            raise MediaError("invalid_backup_type")
        detail = reader.admin("resources/" + resource_type + "/" + delivery + "/" + urllib.parse.quote(asset["public_id"], safe=""),
                              {"versions": "true", "max_results": 100}, units=11)
        # versions=true returns all backups. max_results and derived_next_cursor
        # apply only to derived assets, enumerated separately below.
        if not isinstance(detail.get("versions"), list):
            raise MediaError("version_inventory_incomplete")
        seen_versions = set()
        for version in detail["versions"]:
            version_id = version.get("version_id") if isinstance(version, dict) else None
            if not isinstance(version_id, str) or not version_id or version_id in seen_versions:
                raise MediaError("invalid_version_identity")
            seen_versions.add(version_id)
            if "bytes" in version:
                natural(version["bytes"])
        versions[asset_id] = detail
        reader.progress["version_details_completed"] = len(versions)
        reader.progress["retained_versions"] += len(detail["versions"])

    transformations, derived = derived_inventory(reader)

    references = {}
    reader.stage = "database_references"
    for table in REFERENCE_COLUMNS:
        rows = []
        after = None
        for _ in range(MAX_PAGES):
            page = reader.database(table, after)
            if not page:
                break
            ids = [row.get("id") for row in page]
            if any(not isinstance(value, str) for value in ids) or ids != sorted(set(ids)) or (after is not None and ids[0] <= after):
                raise MediaError("invalid_database_order")
            rows.extend(page)
            reader.progress["database_rows"] += len(page)
            after = ids[-1]
            if len(page) < 500:
                break
        else:
            raise MediaError("database_page_budget_reached")
        references[table] = rows
        reader.progress["database_tables_completed"] = len(references)
    reader.stage = "usage_after"
    after_usage = reader.admin("usage")
    for field in ("resources", "derived_resources"):
        if natural(before.get(field)) != natural(after_usage.get(field)):
            raise MediaError("source_changed_during_inventory")
    # Usage can lag; any mismatch stays a gate, never a silent truncation.
    if len(assets) != natural(after_usage.get("resources")) or len(derived) != natural(after_usage.get("derived_resources")):
        raise MediaError("provider_count_parity_failed")
    manifest = {"schema_version": 1, "source_cloud": reader.cloud, "target_project": PROJECT_REF,
                "assets": assets, "backups": backups, "versions": versions, "derived": derived,
                "transformations": transformations, "database_references": references, "usage": after_usage}
    reader.stage = "reference_mapping"
    manifest["reference_mapping"] = map_references(manifest)
    return manifest


def map_references(manifest):
    candidates = {}
    for asset_id, asset in manifest["assets"].items():
        public_id = asset.get("public_id")
        if not isinstance(public_id, str) or not public_id:
            raise MediaError("missing_public_id")
        suffix = public_id if asset["resource_type"] == "raw" else public_id + "." + asset.get("format", "")
        key = (asset["resource_type"], asset.get("type"), suffix)
        if key in candidates:
            raise MediaError("ambiguous_asset_mapping")
        candidates[key] = asset_id
    mappings = []
    for table, rows in manifest["database_references"].items():
        for row in rows:
            for column in REFERENCE_COLUMNS[table]:
                url = row.get(column)
                if not column.endswith("_url") or not isinstance(url, str) or not url.startswith("https://res.cloudinary.com/"):
                    continue
                item = {"table": table, "row_id": row["id"], "column": column, "source_url": url}
                try:
                    parts = validate_media_url(url, manifest["source_cloud"])
                    matches = [(index, candidates[(parts[0], parts[1], "/".join(parts[index:]))])
                               for index in range(2, len(parts)) if (parts[0], parts[1], "/".join(parts[index:])) in candidates]
                    if not matches:
                        item["status"] = "unresolved_asset"
                    else:
                        index, asset_id = matches[0]  # Longest matching public ID wins.
                        item.update({"status": "matched", "asset_id": asset_id, "delivery_prefix": parts[2:index]})
                        requested_versions = [int(p[1:]) for p in parts[2:index] if re.fullmatch(r"v[0-9]+", p)]
                        if requested_versions and requested_versions[-1] != manifest["assets"][asset_id]["version"]:
                            item["status"] = "historical_version_reference"
                except MediaError:
                    item["status"] = "unsupported_url"
                mappings.append(item)
    return mappings


def safe_summary(manifest, admin_units):
    mapped = manifest["reference_mapping"]
    original_bytes = sum(natural(asset["bytes"]) for asset in manifest["assets"].values())
    derived_bytes = sum(natural(asset["bytes"]) for asset in manifest["derived"].values())
    known_bytes = original_bytes + derived_bytes
    retained_versions = [version for detail in manifest["versions"].values() for version in detail["versions"]]
    sized_versions = [version for version in retained_versions if "bytes" in version]
    sized_backups = [asset for asset in manifest["backups"].values() if "backup_bytes" in asset]
    return {"status": "ok", "phase": "manifest_only", "admin_units": admin_units,
            "asset_count": len(manifest["assets"]), "original_bytes": original_bytes,
            "derived_count": len(manifest["derived"]), "derived_bytes": derived_bytes,
            "backup_asset_count": len(manifest["backups"]),
            "retained_version_count": len(retained_versions),
            "retained_version_known_bytes": sum(natural(v["bytes"]) for v in sized_versions),
            "retained_version_unknown_size_count": len(retained_versions) - len(sized_versions),
            "backup_storage_reported_bytes": sum(natural(a["backup_bytes"]) for a in sized_backups),
            "backup_storage_unknown_size_asset_count": len(manifest["backups"]) - len(sized_backups),
            "cloudinary_reference_count": len(mapped),
            "reference_status_counts": {status: sum(m["status"] == status for m in mapped)
                for status in ("matched", "historical_version_reference", "unresolved_asset", "unsupported_url")},
            "database_row_counts": {table: len(rows) for table, rows in manifest["database_references"].items()},
            "largest_original_bytes": max((a["bytes"] for a in manifest["assets"].values()), default=0),
            "known_original_and_derived_bytes": known_bytes,
            "known_bytes_exclude_backups": True,
            "snapshot_consistency_proven": False,
            "copy_budget_bytes": COPY_BUDGET_BYTES,
            "known_bytes_below_copy_budget": known_bytes <= COPY_BUDGET_BYTES,
            "manifest_sha256": digest(canonical(manifest)),
            "copy_eligible": False}  # A reviewed version/variant/privacy/capacity plan is still required.


def copy_verified(reader, storage, source_url, expected_bytes, budget):
    """Add-only primitive: no database mapping changes and no source deletion.

    Not exposed by the CLI. The future reviewed migration coordinator must supply
    an exclusive capacity reservation and a private destination bucket adapter.
    """
    if budget["used_bytes"] + natural(expected_bytes) > min(budget["ceiling_bytes"], COPY_BUDGET_BYTES):
        raise MediaError("copy_capacity_limit")
    content = reader.original(source_url, expected_bytes)
    sha256 = digest(content)
    path = "sha256/" + sha256[:2] + "/" + sha256
    existing = storage.get_if_exists(path)
    if existing is not None:
        if digest(existing) != sha256 or len(existing) != expected_bytes:
            raise MediaError("destination_conflict")
        return {"sha256": sha256, "bytes": expected_bytes, "created": False}
    storage.insert_only(path, content)
    observed = storage.get_if_exists(path)
    if observed is None or digest(observed) != sha256 or len(observed) != expected_bytes:
        raise MediaError("destination_parity_failed")
    budget["used_bytes"] += expected_bytes
    return {"sha256": sha256, "bytes": expected_bytes, "created": True}


def main():
    report = {"status": "error", "phase": "manifest_only"}
    reader = None
    try:
        reader = Reader(os.environ)
        phase = os.environ.get("STYLESNAP_MANIFEST_PHASE", "manifest_only")
        if phase == "derived_probe":
            report["phase"] = phase
            report = derived_probe(reader)
        elif phase != "manifest_only":
            raise MediaError("invalid_manifest_phase")
        else:
            report = write_manifest(reader)
    except MediaError as exc:
        report["failure_code"] = exc.code
        if exc.http_status is not None:
            report["http_status"] = exc.http_status
        if reader is not None:
            report["admin_units"] = reader.admin_units
            report["stage"] = reader.stage
            report["progress_counts"] = getattr(reader, "progress", {})
    except Exception:
        report["failure_code"] = "manifest_failed"
        if reader is not None:
            report["admin_units"] = reader.admin_units
            report["stage"] = reader.stage
            report["progress_counts"] = getattr(reader, "progress", {})
    encoded = json.dumps(report, sort_keys=True)
    print(encoded)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as handle:
            handle.write("```json\n" + encoded + "\n```\n")
    return 0 if report["status"] == "ok" else 1


def write_manifest(reader):
    manifest = inventory(reader)
    target = os.environ.get("STYLESNAP_PRIVATE_MANIFEST")
    if not target:
        raise MediaError("private_manifest_path_required")
    path = Path(target).resolve()
    if path.is_relative_to(Path(__file__).resolve().parent.parent):
        raise MediaError("manifest_must_be_outside_repository")
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(canonical(manifest))
    return safe_summary(manifest, reader.admin_units)


if __name__ == "__main__":
    sys.exit(main())
