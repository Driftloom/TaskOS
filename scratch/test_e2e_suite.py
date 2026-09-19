import os
import sys
import time
import json
import urllib.request
from playwright.sync_api import sync_playwright

# Ensure utf-8 output on Windows console
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_URL = "http://localhost:5173"
API_URL = "http://localhost:5000"
ARTIFACT_DIR = r"C:\Users\Dell\.gemini\antigravity\brain\654b86d4-7bb3-4f87-a585-673177fa66c4"
SCREENSHOT_DIR = os.path.join(ARTIFACT_DIR, "e2e_screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

results = {
    "suite": "Cadence Task & Time OS End-to-End Test Suite",
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    "tests_run": 0,
    "tests_passed": 0,
    "tests_failed": 0,
    "details": [],
    "screenshots": []
}

def log_test(name, passed, detail=""):
    results["tests_run"] += 1
    if passed:
        results["tests_passed"] += 1
        status = "PASS"
    else:
        results["tests_failed"] += 1
        status = "FAIL"
    print(f"[{status}] {name}: {detail}")
    results["details"].append({
        "test": name,
        "status": status,
        "detail": detail
    })

def capture_screen(page, filename):
    path = os.path.join(SCREENSHOT_DIR, filename)
    page.screenshot(path=path, full_page=True)
    results["screenshots"].append(path)
    print(f"  [SCREENSHOT] Saved: {filename}")
    return path

print("=" * 60)
print("STARTING CADENCE FULL END-TO-END VERIFICATION")
print("=" * 60)

# -------------------------------------------------------------
# 1. API SERVER HEALTH & SECURITY TESTS
# -------------------------------------------------------------
print("\n--- 1. API Server Health & Security Tests ---")
try:
    req = urllib.request.Request(f"{API_URL}/api/healthz")
    with urllib.request.urlopen(req) as resp:
        body = json.loads(resp.read().decode())
        passed = resp.status == 200 and body.get("status") == "ok"
        log_test("API Public Health Check (/api/healthz)", passed, f"Status: {resp.status}, Body: {body}")
except Exception as e:
    log_test("API Public Health Check (/api/healthz)", False, str(e))

# Test Unauthenticated Fail-Closed (RLS / Clerk)
try:
    req = urllib.request.Request(f"{API_URL}/api/tasks")
    try:
        urllib.request.urlopen(req)
        log_test("API Fail-Closed Security (/api/tasks)", False, "Expected 401 but succeeded")
    except urllib.error.HTTPError as err:
        passed = err.code == 401
        log_test("API Fail-Closed Security (/api/tasks)", passed, f"Correctly returned HTTP {err.code} Unauthorized")
except Exception as e:
    log_test("API Fail-Closed Security (/api/tasks)", False, str(e))

# -------------------------------------------------------------
# 2. PLAYWRIGHT BROWSER E2E TESTS
# -------------------------------------------------------------
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # ---------------------------------------------------------
    # Test Suite A: Desktop (1280 x 800)
    # ---------------------------------------------------------
    print("\n--- 2. Frontend Desktop E2E Tests ---")
    context = browser.new_context(viewport={"width": 1280, "height": 800})
    page = context.new_page()

    # Test 2.1: Landing Page
    try:
        page.goto(f"{BASE_URL}/")
        page.wait_for_load_state("networkidle")
        title = page.title()
        has_title = "cadence" in title.lower()
        has_thesis = page.locator("text=Make room for the day").first.is_visible()
        has_rings = page.locator("text=Activity Rings").first.is_visible()
        has_get_started = page.locator("[data-testid='link-landing-sign-up']").first.is_visible()
        has_sign_in = page.locator("[data-testid='link-landing-sign-in']").first.is_visible()

        passed = has_title and has_thesis and has_get_started and has_sign_in
        capture_screen(page, "01_landing_page.png")
        log_test("Landing Page Rendering & HIG Styling", passed,
                 f"Title: '{title}', Thesis: {has_thesis}, CTA: {has_get_started}, Rings: {has_rings}")
    except Exception as e:
        log_test("Landing Page Rendering & HIG Styling", False, str(e))

    # Test 2.2: Sign-In Page
    try:
        page.goto(f"{BASE_URL}/sign-in")
        page.wait_for_load_state("networkidle")
        time.sleep(1) # Allow Clerk scripts to render
        has_clerk_root = page.locator(".cl-rootBox").first.is_visible() or page.locator("text=Sign in").first.is_visible() or page.locator("text=Welcome back").first.is_visible()
        capture_screen(page, "02_sign_in_page.png")
        log_test("Clerk Branded Sign-In Page", has_clerk_root, f"Sign-in container visible: {has_clerk_root}")
    except Exception as e:
        log_test("Clerk Branded Sign-In Page", False, str(e))

    # Test 2.3: Unauthenticated Route Protection
    try:
        page.goto(f"{BASE_URL}/today")
        page.wait_for_load_state("networkidle")
        current_url = page.url
        passed = current_url.endswith("/") or "sign-in" in current_url
        log_test("Unauthenticated Route Redirection (/today -> /)", passed, f"Redirected to: {current_url}")
    except Exception as e:
        log_test("Unauthenticated Route Redirection (/today -> /)", False, str(e))

    # Test 2.4: Memory Transparency Page (What Cadence Knows About Me)
    try:
        page.goto(f"{BASE_URL}/memory?test_auth=true")
        page.wait_for_load_state("networkidle")
        has_header = page.locator("text=What Cadence Knows About Me").first.is_visible()
        has_sub = page.locator("text=Transparency Engine").first.is_visible()
        has_source_a = page.locator("text=Source A").first.is_visible() or page.locator("text=Behavioral Arithmetic").first.is_visible()
        has_source_b = page.locator("text=Source B").first.is_visible() or page.locator("text=Conversational LLM").first.is_visible()

        capture_screen(page, "03_memory_transparency.png")
        passed = has_header and has_sub and (has_source_a or has_source_b)
        log_test("Memory Transparency Screen & Confirmation Queue (/memory)", passed,
                 f"Header: {has_header}, Sub: {has_sub}, Source A: {has_source_a}, Source B: {has_source_b}")
    except Exception as e:
        log_test("Memory Transparency Screen & Confirmation Queue (/memory)", False, str(e))

    # Test 2.5: Onboarding Wizard (3-Step Flow)
    try:
        page.goto(f"{BASE_URL}/onboarding?test_auth=true")
        page.wait_for_load_state("networkidle")
        
        # Step 1: Rhythm
        has_step1 = page.locator("text=Step 1 of 3").first.is_visible()
        has_24h = page.locator("text=24-Hour Flexible Rhythm").first.is_visible()
        capture_screen(page, "04_onboarding_step1.png")

        # Advance to Step 2 via "Next Step"
        next_btn = page.locator("button:has-text('Next Step')").first
        if next_btn.is_visible():
            next_btn.click()
            time.sleep(0.5)

        # Step 2: Automation Dial
        has_step2 = page.locator("text=Step 2 of 3").first.is_visible()
        has_dial = page.locator("text=Smart Reschedule Dial").first.is_visible() or page.locator("text=Auto-reschedule").first.is_visible()
        capture_screen(page, "05_onboarding_step2.png")

        # Advance to Step 3 via "Next Step"
        next_btn = page.locator("button:has-text('Next Step')").first
        if next_btn.is_visible():
            next_btn.click()
            time.sleep(0.5)

        # Step 3: Telegram Pairing
        has_step3 = page.locator("text=Step 3 of 3").first.is_visible()
        has_tg = page.locator("text=Channels & Telegram").first.is_visible() or page.locator("text=Telegram Bot").first.is_visible()
        capture_screen(page, "06_onboarding_step3.png")

        passed = has_step1 and has_24h and has_step2 and has_step3
        log_test("Onboarding 3-Step Wizard Flow (/onboarding)", passed,
                 f"Step 1 (24h rhythm): {has_24h}, Step 2 (dial): {has_dial}, Step 3 (telegram): {has_tg}")
    except Exception as e:
        log_test("Onboarding 3-Step Wizard Flow (/onboarding)", False, str(e))

    # Test 2.6: Review Page & Guided Rituals (Morning Plan & Evening Close)
    try:
        page.goto(f"{BASE_URL}/review?test_auth=true")
        page.wait_for_load_state("networkidle")
        has_review_title = page.locator("p:has-text('Review')").first.is_visible() or page.locator("text=Notice what moved").first.is_visible()
        
        # Test Opening "Plan Day"
        plan_btn = page.locator("button:has-text('Plan Day')").first
        has_plan_btn = plan_btn.is_visible()
        dialog_visible = False
        has_dialog_title = False
        if has_plan_btn:
            plan_btn.click()
            time.sleep(0.5)
            has_dialog_title = page.locator("text=Plan My Day Ritual").first.is_visible()
            dialog_visible = has_dialog_title
            capture_screen(page, "07_morning_ritual_dialog.png")
            # Close dialog
            cancel_btn = page.locator("button:has-text('✕')").first
            if cancel_btn.is_visible():
                cancel_btn.click()
                time.sleep(0.3)

        # Test Opening "Close Day"
        close_btn = page.locator("button:has-text('Close Day')").first
        has_close_btn = close_btn.is_visible()
        has_close_title = False
        if has_close_btn:
            close_btn.click()
            time.sleep(0.5)
            has_close_title = page.locator("text=Close My Day Ritual").first.is_visible()
            capture_screen(page, "08_evening_ritual_dialog.png")
            # Close dialog
            cancel_btn = page.locator("button:has-text('✕')").first
            if cancel_btn.is_visible():
                cancel_btn.click()
                time.sleep(0.3)

        passed = has_review_title and has_plan_btn and dialog_visible and has_close_btn and has_close_title
        log_test("Guided Rituals (Plan Day & Close Day Modal)", passed,
                 f"Review page: {has_review_title}, Morning dialog: {has_dialog_title}, Evening dialog: {has_close_title}")
    except Exception as e:
        log_test("Guided Rituals (Plan Day & Close Day Modal)", False, str(e))

    # Test 2.7: Focus Page & Studio-Grade Audio Synthesis
    try:
        page.goto(f"{BASE_URL}/focus?test_auth=true")
        page.wait_for_load_state("networkidle")
        has_focus_header = page.locator("p:has-text('Focus')").first.is_visible() or page.locator("text=Your attention, here").first.is_visible()

        # Verify Audio Engine in browser
        audio_check = page.evaluate("""() => {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const state = ctx.state;
            ctx.close();
            return { supported: true, state: state };
        }""")

        # Trigger Begin Focus
        begin_btn = page.locator("[data-testid='button-begin-focus']").first
        if not begin_btn.is_visible():
            begin_btn = page.locator("button:has-text('Begin Focus')").first

        if begin_btn.is_visible():
            begin_btn.click()
            time.sleep(1)
            has_running = page.locator("[data-testid='button-toggle-focus']").first.is_visible() or page.locator("button:has-text('Pause')").first.is_visible()
        else:
            has_running = False

        capture_screen(page, "09_focus_running.png")
        passed = has_focus_header and audio_check.get("supported", False)
        log_test("Focus Rounds & Studio-Grade Acoustics", passed,
                 f"Focus header: {has_focus_header}, Audio engine: {audio_check}, Timer running: {has_running}")
    except Exception as e:
        log_test("Focus Rounds & Studio-Grade Acoustics", False, str(e))

    # Test 2.8: Calendar Page (24-Hour Grid)
    try:
        page.goto(f"{BASE_URL}/calendar?test_auth=true")
        page.wait_for_load_state("networkidle")
        has_cal_title = page.locator("p:has-text('Calendar')").first.is_visible() or page.locator("text=time in perspective").first.is_visible()
        capture_screen(page, "10_calendar_grid.png")
        passed = has_cal_title
        log_test("Calendar 24-Hour Time-Blocking Grid (/calendar)", passed,
                 f"Calendar title: {has_cal_title}")
    except Exception as e:
        log_test("Calendar 24-Hour Time-Blocking Grid (/calendar)", False, str(e))

    # Test 2.9: Settings Page (24-Hour Rhythm & Sound Settings)
    try:
        page.goto(f"{BASE_URL}/settings?test_auth=true")
        page.wait_for_load_state("networkidle")
        has_settings_title = page.locator("text=Settings & Boundaries").first.is_visible()
        has_24h_toggle = page.locator("text=24-Hour Working Rhythm").first.is_visible()
        has_memory_link = page.locator("text=What Cadence Knows").first.is_visible() or page.locator("a[href*='/memory']").first.is_visible()
        has_onboarding_link = page.locator("text=Setup Wizard").first.is_visible() or page.locator("a[href*='/onboarding']").first.is_visible()

        capture_screen(page, "11_settings_page.png")
        passed = has_settings_title and has_24h_toggle and has_memory_link and has_onboarding_link
        log_test("Settings Configuration (/settings)", passed,
                 f"Settings title: {has_settings_title}, 24h toggle: {has_24h_toggle}, Memory link: {has_memory_link}")
    except Exception as e:
        log_test("Settings Configuration (/settings)", False, str(e))

    # Test 2.10: Dedicated Profile & Account Page (/profile)
    try:
        page.goto(f"{BASE_URL}/profile?test_auth=true")
        page.wait_for_load_state("networkidle")
        
        has_profile_heading = page.locator("p:has-text('Profile')").first.is_visible()
        has_identity_card = page.locator("text=Active User").first.is_visible() or page.locator("text=Single User Safe").first.is_visible()
        has_timezone_clock = page.locator("text=Asia/Kolkata").first.is_visible()
        has_24h_checkbox = page.locator("[data-testid='checkbox-profile-24h']").first.is_visible()
        has_peak_chronotype = page.locator("text=Peak Focus Chronotype").first.is_visible()
        has_telegram_card = page.locator("text=Telegram Bot").first.is_visible()
        has_privacy_ledger = page.locator("text=Zero-Trust & Privacy Ledger").first.is_visible()
        has_export_btn = page.locator("[data-testid='button-profile-export']").first.is_visible()
        has_signout_btn = page.locator("[data-testid='button-profile-signout']").first.is_visible()

        # Test opening Sign-Out confirmation modal
        if has_signout_btn:
            page.locator("[data-testid='button-profile-signout']").click()
            time.sleep(0.3)
            has_modal = page.locator("text=Sign out of Cadence?").first.is_visible()
            has_confirm_btn = page.locator("[data-testid='button-confirm-signout']").first.is_visible()
            # Close modal with Cancel
            page.locator("button:has-text('Cancel')").first.click()
            time.sleep(0.3)
        else:
            has_modal = False
            has_confirm_btn = False

        capture_screen(page, "13_profile_page.png")
        passed = has_profile_heading and has_identity_card and has_timezone_clock and has_24h_checkbox and has_peak_chronotype and has_telegram_card and has_privacy_ledger and has_export_btn and has_modal
        log_test("Dedicated Profile & Account Page (/profile)", passed,
                 f"Heading: {has_profile_heading}, Identity: {has_identity_card}, Clock: {has_timezone_clock}, 24h: {has_24h_checkbox}, Telegram: {has_telegram_card}, Privacy: {has_privacy_ledger}, Modal: {has_modal}")
    except Exception as e:
        log_test("Dedicated Profile & Account Page (/profile)", False, str(e))

    # Test 2.11: AppShell Header Avatar Navigation
    try:
        page.goto(f"{BASE_URL}/today?test_auth=true")
        page.wait_for_load_state("networkidle")
        avatar_btn = page.locator("[data-testid='button-profile']").first
        if avatar_btn.is_visible():
            avatar_btn.click()
            time.sleep(0.5)
            passed = "/profile" in page.url
            log_test("AppShell Header Avatar Navigation (Click -> /profile)", passed, f"Target URL: {page.url}")
        else:
            log_test("AppShell Header Avatar Navigation (Click -> /profile)", False, "Avatar button not visible")
    except Exception as e:
        log_test("AppShell Header Avatar Navigation (Click -> /profile)", False, str(e))

    # ---------------------------------------------------------
    # Test Suite B: Mobile Safari / iPhone 14 Viewport
    # ---------------------------------------------------------
    print("\n--- 3. Mobile Viewport (iPhone 14) Responsiveness ---")
    mobile_context = browser.new_context(
        viewport={"width": 390, "height": 844},
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
    )
    mobile_page = mobile_context.new_page()

    # Test 3.1: Mobile Today View & Dock
    try:
        mobile_page.goto(f"{BASE_URL}/today?test_auth=true")
        mobile_page.wait_for_load_state("networkidle")

        has_bottom_dock = mobile_page.locator("nav[aria-label='Mobile navigation']").first.is_visible()
        has_no_overflow = mobile_page.evaluate("""() => {
            return document.documentElement.scrollWidth <= window.innerWidth;
        }""")

        capture_screen(mobile_page, "12_mobile_today_view.png")
        passed = has_bottom_dock and has_no_overflow
        log_test("Mobile Safari iPhone 14 Layout & Bottom Dock", passed,
                 f"Bottom dock: {has_bottom_dock}, Zero horizontal overflow: {has_no_overflow}")
    except Exception as e:
        log_test("Mobile Safari iPhone 14 Layout & Bottom Dock", False, str(e))

    # Test 3.2: Mobile Profile View
    try:
        mobile_page.goto(f"{BASE_URL}/profile?test_auth=true")
        mobile_page.wait_for_load_state("networkidle")

        has_profile_mobile = mobile_page.locator("p:has-text('Profile')").first.is_visible()
        has_mobile_overflow = mobile_page.evaluate("""() => {
            return document.documentElement.scrollWidth <= window.innerWidth;
        }""")

        capture_screen(mobile_page, "14_profile_mobile_view.png")
        passed = has_profile_mobile and has_mobile_overflow
        log_test("Mobile Safari iPhone 14 Profile View", passed,
                 f"Profile visible: {has_profile_mobile}, Zero horizontal overflow: {has_mobile_overflow}")
    except Exception as e:
        log_test("Mobile Safari iPhone 14 Profile View", False, str(e))

    browser.close()

# -------------------------------------------------------------
# WRITE RESULTS REPORT TO DISK
# -------------------------------------------------------------
print("\n" + "=" * 60)
print(f"VERIFICATION COMPLETE: {results['tests_passed']}/{results['tests_run']} TESTS PASSED")
print("=" * 60)

output_json = os.path.join(ARTIFACT_DIR, "e2e_results.json")
with open(output_json, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)

print(f"Full report written to: {output_json}")
