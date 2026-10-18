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
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument("--base-url", default="http://localhost:3000")
parser.add_argument("--mail-url", default="http://127.0.0.1:54324")
parser.add_argument("--browser-channel", default=None)
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
        reset_page.get_by_role("button", name="Sign out", exact=True).click()
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
                request_json(api_url + "/auth/v1/admin/users/" + user["id"], method="DELETE", headers=headers)
        print("Fixture Auth users removed.", flush=True)
    except Exception:
        print("Local fixture cleanup failed; inspect the test-email accounts in Studio.", file=sys.stderr)
        failed = True
sys.exit(1 if failed else 0)
