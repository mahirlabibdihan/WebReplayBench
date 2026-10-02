"""Check the dataset against the running site.

For every single-interaction and two-write scenario: open the home page, follow the
scenario's path, run its setup and perform its interaction, all through accessibility
role/name lookups (as an agent would). Report steps that no longer resolve, and
interactions whose effect on the database disagrees with their ground truth.

  python -m webreplaybench.check [--ids T1,N7] [--set single|pairs|all]

Run it after changing the site (e.g. a redesign) to confirm the dataset still applies.
Environment: PLAYGROUND_URL, PLAYGROUND_ADMIN_URL, PLAYGROUND_USER, PLAYGROUND_PASSWORD.
"""
import argparse
import sys

from .oracle import PLAYGROUND_PASSWORD, PLAYGROUND_URL, PLAYGROUND_USER, Oracle
from .scenarios import PAIRS_DATA, SINGLE


def locate(page, step):
    """The element a dataset step addresses (first match, or the nth)."""
    exact = step.get("match") != "contains"
    loc = page.get_by_role(step["role"], name=step["name"], exact=exact)
    return loc.nth(step.get("nth", 0))


def perform(page, step):
    if step["action"] == "scroll":
        page.mouse.wheel(0, 600 if step["direction"] == "down" else -600)
        return
    el = locate(page, step)
    el.wait_for(state="attached", timeout=5000)
    if step["action"] == "click":
        el.click(timeout=5000)
    elif step["action"] == "fill":
        el.fill(step["text"], timeout=5000)
        if step.get("enter"):
            el.press("Enter")
    elif step["action"] == "select":
        try:
            el.select_option(label=step["option"], timeout=5000)
        except Exception:
            el.select_option(value=step["option"], timeout=5000)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(250)


def sign_in(page):
    page.goto(PLAYGROUND_URL + "/login")
    page.get_by_label("Username").fill(PLAYGROUND_USER)
    page.get_by_label("Password").fill(PLAYGROUND_PASSWORD)
    with page.expect_navigation():
        page.get_by_role("button", name="Sign in").click()
    page.wait_for_load_state("networkidle")


def check(records, headless=True):
    from playwright.sync_api import sync_playwright
    oracle = Oracle()
    problems = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        for rec in records:
            oracle.reset(dynamic=False)
            context = browser.new_context(viewport={"width": 1280, "height": 900})
            page = context.new_page()
            page.on("dialog", lambda d: d.accept())
            phase, step = "sign-in", None
            try:
                sign_in(page)
                phase = "path"
                for step in rec["path"]["detour"] + rec["path"]["navigation"]:
                    perform(page, step)
                phase = "setup"
                for step in rec["setup"]:
                    perform(page, step)
                phase = "interaction"
                before = oracle.settle()
                for step in rec["interaction"]:
                    perform(page, step)
                after = oracle.settle()
                rows = [r for r in oracle.audit(before["audit"], after["audit"]) if not r.get("external")]
                gt = rec.get("ground_truth")
                if gt is not None:
                    expected = "server" in gt
                    if bool(rows) != expected:
                        problems.append((rec["id"], "ground truth",
                                         f"expected {'a' if expected else 'no'} database change, saw {len(rows)} audit rows"))
                        print(f"MISMATCH {rec['id']}: expected {'a' if expected else 'no'} change, saw {len(rows)} rows", flush=True)
                        continue
                print(f"ok       {rec['id']}", flush=True)
            except Exception as e:
                msg = f"{phase} step {step} did not resolve: {type(e).__name__}: {str(e).splitlines()[0]}"
                problems.append((rec["id"], phase, msg))
                print(f"FAIL     {rec['id']}: {msg}", flush=True)
            finally:
                context.close()
        browser.close()
    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", choices=["single", "pairs", "all"], default="all")
    ap.add_argument("--ids", help="comma-separated scenario ids")
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args()
    records = (SINGLE["scenarios"] if args.set in ("single", "all") else []) + \
              (PAIRS_DATA["scenarios"] if args.set in ("pairs", "all") else [])
    if args.ids:
        wanted = set(args.ids.split(","))
        records = [r for r in records if r["id"] in wanted]
    problems = check(records, headless=not args.headed)
    print(f"\n{len(records) - len(problems)}/{len(records)} scenarios apply")
    for pid, phase, msg in problems:
        print(f"  {pid} [{phase}] {msg}")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
