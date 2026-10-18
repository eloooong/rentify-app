"""Catalog/storage journey using the two disposable users from auth.py."""
import json
import struct
import urllib.request
import uuid
import zlib


def run_catalog(one, two, guest, base_url, api_url, status, token_one, token_two):
    origin = {"Origin": base_url}
    prefix = base_url + "/api/catalog"
    categories = guest.request.get(prefix + "/categories")
    assert categories.status == 200
    camera = next(row for row in categories.json()["data"] if row["slug"] == "cameras")
    assert camera["attribute_schema"]["version"] == 1
    title = "Test camera " + uuid.uuid4().hex[:12]
    listing = {"category_id": camera["id"], "title": title, "description": "Disposable test listing", "daily_price_amount": 12000, "deposit_amount": 50000, "currency": "PHP", "condition": "Good", "pickup_area": "Campus", "attributes": {"brand": "Canon", "model": "R6"}}
    assert guest.request.get(prefix + "/own").status == 401
    assert guest.request.post(prefix + "/listings", data=listing, headers=origin).status == 401
    assert one.request.post(prefix + "/listings", data=listing, headers={"Origin": "https://attacker.invalid"}).status == 403
    assert one.request.post(prefix + "/listings", data={**listing, "owner_id": "forged"}, headers=origin).status == 400
    assert one.request.post(prefix + "/listings", data={**listing, "attributes": {}}, headers=origin).status == 400
    created = one.request.post(prefix + "/listings", data=listing, headers=origin)
    assert created.status == 201, "Draft creation failed"
    record = created.json()["data"]
    listing_id = record["id"]
    url = prefix + "/listings/" + listing_id
    assert record["status"] == "draft"
    assert guest.request.get(url).status == 404
    assert one.request.get(prefix + "/own?id=" + listing_id).json()["data"][0]["id"] == listing_id
    assert two.request.get(prefix + "/own?id=" + listing_id).json()["data"] == []
    assert two.request.patch(url, data={**listing, "status": "published"}, headers=origin).status == 404
    assert one.request.patch(url, data={**listing, "status": "published"}, headers=origin).status == 400

    def upload(data, position="0"):
        return one.request.post(url + "/photos", headers=origin, multipart={"position": position, "file": {"name": "not-trusted.jpg", "mimeType": "image/jpeg", "buffer": data}})

    assert upload(b"<html>This is not an image</html>").status == 415
    assert upload(b"x" * (4 * 1024 * 1024 + 1)).status == 413
    def chunk(kind, data):
        return struct.pack("!I", len(data)) + kind + data + struct.pack("!I", zlib.crc32(kind + data) & 0xffffffff)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack("!2I5B", 32, 32, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress((b"\0" + b"\xff\0\0" * 32) * 32)) + chunk(b"IEND", b"")
    photo = upload(png)
    assert photo.status == 201, "Real image upload failed"
    photo_data = photo.json()["data"]
    photo_url = base_url + photo_data["url"]
    assert guest.request.get(photo_url).status == 404
    image = one.request.get(photo_url)
    assert image.status == 200 and image.body()[:4] == b"RIFF" and image.body()[8:12] == b"WEBP"
    assert image.headers["content-type"] == "image/webp"
    assert upload(png).status == 409, "Duplicate position must fail and clean its upload"

    public_key = status.get("ANON_KEY") or status["PUBLISHABLE_KEY"]
    first_headers = {"apikey": public_key, "Authorization": "Bearer " + token_one}
    second_headers = {"apikey": public_key, "Authorization": "Bearer " + token_two}
    rows = one.request.get(api_url + "/rest/v1/listing_photos?select=storage_path&listing_id=eq." + listing_id, headers=first_headers)
    path = rows.json()[0]["storage_path"]
    foreign_upload = two.request.post(api_url + "/storage/v1/object/listing-images/" + path.replace(path.rsplit("/", 1)[1], str(uuid.uuid4()) + ".webp"), headers={**second_headers, "Content-Type": "image/webp"}, data=png)
    assert not foreign_upload.ok, "Other user's direct Storage upload must fail"
    assert not two.request.get(api_url + "/storage/v1/object/authenticated/listing-images/" + path, headers=second_headers).ok
    overwritten = one.request.post(api_url + "/storage/v1/object/listing-images/" + path, headers={**first_headers, "Content-Type": "image/webp", "x-upsert": "true"}, data=png)
    assert not overwritten.ok, "Referenced objects must not be overwritten"
    one.request.delete(api_url + "/storage/v1/object/listing-images", headers=first_headers, data={"prefixes": [path]})
    assert one.request.get(photo_url).status == 200, "Direct removal must not break attached photos"

    assert one.request.patch(url, data={**listing, "status": "published"}, headers=origin).status == 200
    public_listing = guest.request.get(url)
    assert public_listing.status == 200
    search = guest.request.get(prefix + "/listings", params={"q": title, "currency": "PHP", "categoryId": camera["id"], "minPrice": "10000", "maxPrice": "13000", "sort": "price_asc", "pageSize": "2"})
    assert search.status == 200 and search.json()["pagination"]["total"] == 1
    assert search.json()["data"][0]["photos"][0]["id"] == photo_data["id"]
    assert "phone" not in public_listing.json()["data"]
    public_image = guest.request.get(photo_url)
    assert public_image.status == 200 and public_image.headers["x-content-type-options"] == "nosniff"
    assert "no-store" in public_image.headers["cache-control"]
    assert two.request.delete(photo_url, headers=origin).status == 404
    assert one.request.delete(photo_url, headers=origin).status == 400
    assert one.request.patch(url, data={**listing, "status": "paused"}, headers=origin).status == 200
    assert guest.request.get(url).status == 404 and guest.request.get(photo_url).status == 404
    assert one.request.patch(url, data={**listing, "status": "draft"}, headers=origin).status == 200
    assert one.request.delete(url, headers=origin).status == 409
    deleted = one.request.delete(photo_url, headers=origin)
    assert deleted.status == 200 and not deleted.json()["data"]["storageCleanupPending"]
    assert one.request.get(photo_url).status == 404
    assert one.request.delete(url, headers=origin).status == 200
    print("Catalog lifecycle, filters, image normalization, private drafts, direct Storage denial, and cleanup: PASS", flush=True)


def cleanup_catalog(api_url, headers, owner_id):
    """Only called for this run's randomly named disposable Auth fixtures."""
    def call(path, method="GET", data=None):
        body = json.dumps(data).encode() if data is not None else None
        req = urllib.request.Request(api_url + path, data=body, method=method, headers={**headers, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as response:
            payload = response.read()
            return json.loads(payload) if payload else None
    listings = call("/rest/v1/listings?select=id&owner_id=eq." + owner_id)
    for listing in listings:
        listing_id = listing["id"]
        call("/rest/v1/listings?id=eq." + listing_id, "PATCH", {"status": "draft"})
        call("/rest/v1/listing_photos?listing_id=eq." + listing_id, "DELETE")
        prefix = owner_id + "/" + listing_id + "/"
        objects = call("/storage/v1/object/list/listing-images", "POST", {"prefix": prefix, "limit": 100})
        paths = [prefix + obj["name"] for obj in objects if obj.get("id")]
        if paths:
            call("/storage/v1/object/listing-images", "DELETE", {"prefixes": paths})
        call("/rest/v1/listings?id=eq." + listing_id, "DELETE")
