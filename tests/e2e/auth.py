"""Real local Auth/Mailpit journey. Never run against a hosted project.

Requires Python Playwright 1.64.0 and a running app/Supabase stack.
Fixture Auth users are removed; no real email is sent outside local Mailpit.
"""
import argparse
import base64
import html
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect, TimeoutError as PlaywrightTimeoutError
from catalog import run_catalog, cleanup_catalog

parser = argparse.ArgumentParser()
parser.add_argument("--base-url", default="http://localhost:3000")
parser.add_argument("--mail-url", default="http://127.0.0.1:54324")
parser.add_argument("--browser-channel", default=None)
parser.add_argument("--screenshots", action="store_true", help="Save local profile review screenshots under ignored tmp/")
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
for url in (args.base_url, args.mail_url):
    assert urllib.parse.urlsplit(url).hostname in ("localhost", "127.0.0.1"), "Local testing only"
result = subprocess.run(["node", "node_modules/supabase/dist/supabase.js", "status", "-o", "json"], cwd=root, capture_output=True, text=True)
assert result.returncode == 0, "Start local Supabase first"
status = json.loads(result.stdout)
api_url = status["API_URL"]
assert urllib.parse.urlsplit(api_url).hostname in ("localhost", "127.0.0.1")
admin_key = status.get("SERVICE_ROLE_KEY") or status.get("SECRET_KEY")
assert admin_key, "Local test cleanup requires a server-only local admin key"
run_id = uuid.uuid4().hex[:12]
emails = {f"rentify-auth-{run_id}-{suffix}@example.test" for suffix in ("one", "two")}
email_one, email_two = sorted(emails)
password = "Test-only-" + uuid.uuid4().hex
new_password = "Changed-only-" + uuid.uuid4().hex
phase = "initialization"

def request_json(url, method="GET", headers=None):
    request = urllib.request.Request(url, method=method, headers=headers or {})
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = response.read()
        return json.loads(payload) if payload else None

def email_link(email, kind):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        messages = request_json(args.mail_url + "/api/v1/messages")["messages"]
        for message in messages:
            if not any(to.get("Address") == email for to in message.get("To", [])):
                continue
            body = request_json(args.mail_url + "/api/v1/message/" + message["ID"])
            for link in re.findall(r'href=["\']([^"\']+)["\']', body.get("HTML", "")):
                link = html.unescape(link)
                parsed = urllib.parse.urlsplit(link)
                if parsed.path == "/auth/confirm" and urllib.parse.parse_qs(parsed.query).get("type") == [kind]:
                    assert parsed.netloc == urllib.parse.urlsplit(args.base_url).netloc
                    return link
        time.sleep(0.5)
    raise AssertionError("Expected local email not received")

def session_cookies(context):
    values = [cookie for cookie in context.cookies() if re.search(r"auth-token(?:\.\d+)?$", cookie["name"])]
    assert values, "Expected session cookies"
    values.sort(key=lambda cookie: int(cookie["name"].rsplit(".", 1)[-1]) if re.search(r"\.\d+$", cookie["name"]) else 0)
    encoded = "".join(cookie["value"] for cookie in values)
    assert encoded.startswith("base64-")
    encoded = encoded[7:]
    return values, json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))

def replace_session(context, cookies, session):
    name = re.sub(r"\.\d+$", "", cookies[0]["name"])
    context.clear_cookies(name=re.compile("^" + re.escape(name) + r"(?:\.\d+)?$"))
    encoded = "base64-" + base64.urlsafe_b64encode(json.dumps(session).encode()).decode().rstrip("=")
    chunks = [encoded[i:i+2800] for i in range(0, len(encoded), 2800)]
    context.add_cookies([{**cookies[0], "name": name if len(chunks) == 1 else f"{name}.{i}", "value": chunk} for i, chunk in enumerate(chunks)])

def sign_in(page, email, secret):
    page.goto(args.base_url + "/login")
    page.get_by_label("Email address", exact=True).fill(email)
    page.get_by_label("Password", exact=True).fill(secret)
    page.get_by_role("button", name="Sign in", exact=True).click()

def profile_api(context, path, method="GET", data=None):
    # Public key + this user's access token only; no admin credential in requests.
    token = session_cookies(context)[1]["access_token"]
    return context.request.fetch(api_url + "/rest/v1/" + path, method=method, data=data,
        headers={"apikey": status.get("ANON_KEY") or status["PUBLISHABLE_KEY"], "Authorization": "Bearer " + token, "Prefer": "return=representation"})

def register(page, email):
    global phase
    phase = "signup form"
    page.goto(args.base_url + "/signup")
    page.get_by_label("Email address", exact=True).fill(email)
    page.get_by_label("Password", exact=True).fill(password)
    page.get_by_role("button", name="Create account", exact=True).click()
    expect(page.get_by_role("status").filter(has_text="Check your email")).to_be_visible()
    phase = "unverified login denial"
    sign_in(page, email, password)
    expect(page.locator("form [role=alert]")).to_contain_text("We couldn't sign you in")
    expect(page.get_by_label("Email address", exact=True)).to_have_value(email)
    expect(page.get_by_label("Password", exact=True)).to_have_value("")
    phase = "verification email link"
    link = email_link(email, "email")
    page.goto(link)
    phase = "verified account landing"
    expect(page.get_by_role("heading", name="Your account", exact=True)).to_be_visible()
    expect(page.get_by_text(email, exact=True)).to_be_visible()
    return link

def run():
    global phase
    expect.set_options(timeout=20000)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel=args.browser_channel)
        one = browser.new_context(viewport={"width": 1280, "height": 900})
        two = browser.new_context(viewport={"width": 375, "height": 812})
        guest = browser.new_context()
        page = one.new_page()
        page.set_default_navigation_timeout(120000)
        errors = []
        page.on("pageerror", lambda _error: errors.append("pageerror"))
        phase = "anonymous route protection"
        for path in ("/account", "/update-password", "/owner/listings/new", "/owner/private.png", "/account/details.svg", "/bookings", "/messages", "/checklists", "/admin"):
            response = guest.request.get(args.base_url + path, max_redirects=0)
            assert response.status == 303
            location = urllib.parse.urlsplit(response.headers["location"])
            assert location.path == "/login"
            assert "no-store" in response.headers["cache-control"]
        print("Anonymous protected routes: PASS", flush=True)

        phase = "signup and verified email"
        original_link = register(page, email_one)
        print("Signup, unverified login denial, real email verification: PASS", flush=True)
        phase = "expired/replayed link"
        page.goto(original_link)
        expect(page).to_have_url(args.base_url + "/auth/error")
        page.goto(args.base_url + "/account")
        expect(page.get_by_text(email_one, exact=True)).to_be_visible()

        phase = "session refresh cookie persistence"
        cookies, session = session_cookies(one)
        old_refresh = session["refresh_token"]
        session["expires_at"] = int(time.time()) - 3600
        replace_session(one, cookies, session)
        response = page.goto(args.base_url + "/account")
        expect(page.get_by_text(email_one, exact=True)).to_be_visible()
        assert "no-store" in response.headers["cache-control"]
        assert session_cookies(one)[1]["refresh_token"] != old_refresh
        page.reload()
        expect(page.get_by_role("heading", name="Your account", exact=True)).to_be_visible()
        print("Expired-link handling and real refresh-cookie persistence: PASS", flush=True)

        phase = "second account isolation and mobile layout"
        second_page = two.new_page()
        second_page.set_default_navigation_timeout(120000)
        register(second_page, email_two)
        assert second_page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        expect(page.get_by_text(email_two, exact=True)).not_to_be_visible()
        assert one.request.get(args.base_url + "/admin", max_redirects=0).status == 403

        phase = "profile creation and persistence"
        page.get_by_label("Display name", exact=True).fill("  First member  ")
        page.get_by_label("Phone number (optional)", exact=True).fill("+639171234567")
        page.get_by_role("button", name="Save profile", exact=True).click()
        expect(page.get_by_role("status").filter(has_text="Profile saved")).to_be_visible()
        page.reload()
        expect(page.get_by_label("Display name", exact=True)).to_have_value("First member")
        expect(page.get_by_label("Phone number (optional)", exact=True)).to_have_value("+639171234567")
        owner_id = session_cookies(one)[1]["user"]["id"]
        public_headers = {"apikey": status.get("ANON_KEY") or status["PUBLISHABLE_KEY"]}
        public = guest.request.get(api_url + "/rest/v1/profiles?select=id,display_name,avatar_path&id=eq." + owner_id, headers=public_headers)
        assert public.status == 200 and public.json()[0]["display_name"] == "First member"
        assert "phone" not in public.text() and email_one not in public.text()
        assert guest.request.get(api_url + "/rest/v1/profiles?select=role", headers=public_headers).status in (401, 403)
        assert guest.request.get(api_url + "/rest/v1/profile_private?select=phone", headers=public_headers).status in (401, 403)

        phase = "profile owner permissions and protected fields"
        assert profile_api(one, "profiles?select=id,display_name&id=eq." + owner_id, "PATCH", {"role": "admin"}).status == 403
        assert profile_api(one, "profile_private?select=user_id&user_id=eq." + owner_id, "PATCH", {"phone_verified_at": "2026-10-18T00:00:00Z"}).status == 403
        other_read = profile_api(two, "profile_private?select=phone&user_id=eq." + owner_id)
        assert other_read.status == 200 and other_read.json() == []
        other_write = profile_api(two, "profiles?select=id,display_name&id=eq." + owner_id, "PATCH", {"display_name": "Intruder"})
        assert other_write.status == 200 and other_write.json() == []
        second_page.get_by_label("Display name", exact=True).fill("Second member")
        second_page.get_by_role("button", name="Save profile", exact=True).click()
        expect(second_page.get_by_role("status").filter(has_text="Profile saved")).to_be_visible()
        expect(second_page.get_by_label("Phone number (optional)", exact=True)).to_have_value("")

        phase = "profile editing and optional phone removal"
        page.get_by_label("Display name", exact=True).fill("Updated member")
        page.get_by_label("Phone number (optional)", exact=True).fill("invalid")
        page.get_by_role("button", name="Save profile", exact=True).click()
        expect(page.locator("#phone-error")).to_contain_text("international number")
        page.get_by_label("Phone number (optional)", exact=True).fill("")
        page.get_by_role("button", name="Save profile", exact=True).click()
        expect(page.get_by_role("status").filter(has_text="Profile saved")).to_be_visible()
        page.reload()
        expect(page.get_by_label("Display name", exact=True)).to_have_value("Updated member")
        expect(page.get_by_label("Phone number (optional)", exact=True)).to_have_value("")
        assert second_page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        if args.screenshots:
            phase = "profile review screenshots"
            for review_page in (page, second_page):
                try:
                    review_page.wait_for_load_state("networkidle", timeout=5000)
                except PlaywrightTimeoutError:
                    # The shared shell may keep background prefetches active.
                    expect(review_page.get_by_role("form", name="Your profile")).to_be_visible()
            output = root / "tmp" / "profile-ui-review"
            output.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(output / "desktop.png"), full_page=True)
            second_page.screenshot(path=str(output / "mobile.png"), full_page=True)
        print("Profile create/edit/remove, public projection, private isolation, role/verification denial: PASS", flush=True)

        phase = "catalog and storage permissions"
        run_catalog(one, two, guest, args.base_url, api_url, status, session_cookies(one)[1]["access_token"], session_cookies(two)[1]["access_token"])

        phase = "public listing and checkout sign-in returns"
        assert guest.request.get(args.base_url + "/listings", max_redirects=0).status == 200
        # Missing UUIDs also exercise a real 404 after sign-in without creating bookings.
        missing_id = str(uuid.uuid4())
        for destination in ("/listings?q=camera&sort=price_asc", "/listings/" + missing_id, "/checkout/" + missing_id):
            return_context = browser.new_context()
            try:
                return_page = return_context.new_page()
                return_page.goto(args.base_url + "/login?" + urllib.parse.urlencode({"next": destination}))
                return_page.wait_for_load_state("networkidle")
                return_page.get_by_label("Email address", exact=True).fill(email_one)
                return_page.get_by_label("Password", exact=True).fill(password)
                return_page.get_by_role("button", name="Sign in", exact=True).click()
                expect(return_page).to_have_url(args.base_url + destination)
                assert session_cookies(return_context)[1]["user"]["id"] == owner_id
                if destination.startswith(("/listings/", "/checkout/")):
                    assert return_context.request.get(args.base_url + destination).status == 404
            finally:
                return_context.close()
        print("Public listings stay public; real sign-in preserves listing and checkout destinations: PASS", flush=True)

        phase = "forged cookie rejection"
        cookies, session = session_cookies(one)
        session["access_token"] = "invalid.signature.value"
        session["expires_at"] = int(time.time()) + 3600
        session["user"] = {"id": "forged", "email": "attacker@example.test", "role": "admin", "email_confirmed_at": "2026-10-18T00:00:00Z"}
        replace_session(guest, cookies, session)
        assert guest.request.get(args.base_url + "/account", max_redirects=0).status in (303, 503)
        print("Account isolation, mobile layout, admin denial, forged-cookie rejection: PASS", flush=True)

        phase = "password recovery email"
        page.goto(args.base_url + "/forgot-password")
        page.get_by_label("Email address", exact=True).fill(email_one)
        page.get_by_role("button", name="Send reset link", exact=True).click()
        expect(page.get_by_role("status").filter(has_text="If an account exists")).to_be_visible()
        recovery_link = email_link(email_one, "recovery")
        recovery = browser.new_context()
        reset_page = recovery.new_page()
        reset_page.goto(recovery_link)
        expect(reset_page.get_by_role("heading", name="Set a new password", exact=True)).to_be_visible()
        phase = "password mismatch and update"
        reset_page.get_by_label("New password", exact=True).fill(new_password)
        reset_page.get_by_label("Confirm new password", exact=True).fill("Different-password")
        reset_page.get_by_role("button", name="Save new password", exact=True).click()
        expect(reset_page.get_by_text("Passwords must match.", exact=True)).to_be_visible()
        reset_page.get_by_label("New password", exact=True).fill(new_password)
        reset_page.get_by_label("Confirm new password", exact=True).fill(new_password)
        reset_page.get_by_role("button", name="Save new password", exact=True).click()
        expect(reset_page).to_have_url(args.base_url + "/login?notice=password-updated")
        sign_in(reset_page, email_one, password)
        expect(reset_page.locator("form [role=alert]")).to_contain_text("We couldn't sign you in")
        sign_in(reset_page, email_one, new_password)
        expect(reset_page.get_by_role("heading", name="Your account", exact=True)).to_be_visible()
        phase = "logout"
        # The header also has a Sign out button; target the account page's own form.
        reset_page.get_by_role("main").get_by_role("button", name="Sign out", exact=True).click()
        expect(reset_page).to_have_url(args.base_url + "/login?notice=signed-out")
        assert recovery.request.get(args.base_url + "/account", max_redirects=0).status == 303
        print("Recovery across browsers, mismatch validation, password replacement, logout: PASS", flush=True)
        assert not errors
        browser.close()

failed = False
try:
    run()
except Exception as error:
    # Avoid Playwright call logs containing passwords or one-time email URLs.
    print(f"Auth journey failed during '{phase}' ({type(error).__name__}).", file=sys.stderr)
    failed = True
finally:
    try:
        headers = {"apikey": admin_key, "Authorization": "Bearer " + admin_key}
        users = request_json(api_url + "/auth/v1/admin/users?page=1&per_page=1000", headers=headers)["users"]
        for user in users:
            if user.get("email") in emails:
                cleanup_catalog(api_url, headers, user["id"])
                request_json(api_url + "/auth/v1/admin/users/" + user["id"], method="DELETE", headers=headers)
        print("Fixture Auth users removed.", flush=True)
    except Exception:
        print("Local fixture cleanup failed; inspect the test-email accounts in Studio.", file=sys.stderr)
        failed = True
sys.exit(1 if failed else 0)
