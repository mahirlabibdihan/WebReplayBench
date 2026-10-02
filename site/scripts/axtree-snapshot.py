"""Snapshot the accessibility tree of every page (and some interactive states) of the site.

Used to check that a visual redesign leaves what agents see unchanged:

  python site/scripts/axtree-snapshot.py before.json
  ... restyle ...
  python site/scripts/axtree-snapshot.py after.json
  python site/scripts/axtree-snapshot.py --diff before.json after.json

The tree is Chrome's full accessibility tree (what BrowserGym reads), with node ids
removed. Each capture starts from a freshly reset database with randomized content off.
Environment: PLAYGROUND_URL, PLAYGROUND_ADMIN_URL, PLAYGROUND_USER, PLAYGROUND_PASSWORD.
"""
import json
import os
import sys
import urllib.request

URL = os.environ.get("PLAYGROUND_URL", "http://localhost:4000").rstrip("/")
ADMIN = os.environ.get("PLAYGROUND_ADMIN_URL", "http://127.0.0.1:4001").rstrip("/")
USER = os.environ.get("PLAYGROUND_USER", "jordan")
PASSWORD = os.environ.get("PLAYGROUND_PASSWORD", "playground123")

# (name, path, steps): a step is ("click", role, name) or ("fill", role, name, text).
STATES = [
    ("home", "/", []),
    ("products", "/products", []),
    ("products-page2", "/products?page=2", []),
    ("products-more-filters", "/products", [("click", "button", "More filters")]),
    ("product-1", "/products/1", []),
    ("product-1-specs", "/products/1", [("click", "button", "Specs")]),
    ("product-1-reviews", "/products/1", [("click", "button", "Reviews")]),
    ("product-4", "/products/4", []),
    ("cart", "/cart", []),
    ("checkout", "/checkout", []),
    ("checkout-step2", "/checkout", [("click", "button", "Continue")]),
    ("checkout-step3", "/checkout", [("click", "button", "Continue"), ("click", "button", "Continue")]),
    ("wishlist", "/wishlist", []),
    ("inbox", "/inbox", []),
    ("inbox-row-menu", "/inbox", [("click", "button", "More actions for Q3 budget draft")]),
    ("message-1", "/inbox/1", []),
    ("message-1-reply", "/inbox/1", [("click", "button", "Reply")]),
    ("message-5", "/inbox/5", []),
    ("todos", "/todos", []),
    ("notes", "/notes", []),
    ("offers", "/offers", []),
    ("orders", "/orders", []),
    ("orders-details", "/orders", [("click", "button", "Show details")]),
    ("support", "/support", []),
    ("settings-profile", "/settings#profile", []),
    ("settings-notifications", "/settings#notifications", []),
    ("settings-privacy", "/settings#privacy", []),
    ("settings-addresses", "/settings#addresses", []),
    ("settings-appearance", "/settings#appearance", []),
]


def admin(path, body):
    req = urllib.request.Request(ADMIN + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"content-type": "application/json"})
    urllib.request.urlopen(req, timeout=30).read()


def tree(page):
    """Chrome's full accessibility tree as nested dicts, without node ids."""
    cdp = page.context.new_cdp_session(page)
    nodes = cdp.send("Accessibility.getFullAXTree")["nodes"]
    cdp.detach()
    by_id = {n["nodeId"]: n for n in nodes}
    val = lambda n, k: (n.get(k) or {}).get("value")

    def build(n):
        props = {p["name"]: (p.get("value") or {}).get("value") for p in n.get("properties", [])
                 if p["name"] not in ("focused", "focusable", "settable")}  # focus follows the last click
        out = {"role": val(n, "role"), "name": val(n, "name")}
        if n.get("ignored"):
            out["ignored"] = True
        if val(n, "value") not in (None, ""):
            out["value"] = val(n, "value")
        if val(n, "description"):
            out["description"] = val(n, "description")
        if props:
            out["props"] = props
        kids = [build(by_id[c]) for c in n.get("childIds", []) if c in by_id]
        if kids:
            out["children"] = kids
        return out

    return build(nodes[0])


def act(page, step):
    loc = page.get_by_role(step[1], name=step[2], exact=True).first
    if step[0] == "click":
        loc.click()
    else:
        loc.fill(step[3])
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(300)


def snapshot(out_path):
    from playwright.sync_api import sync_playwright
    result = {}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        admin("/reset", {"dynamic": False})
        page.goto(URL + "/login")
        page.wait_for_load_state("networkidle")
        result["login"] = tree(page)
        for name, path, steps in STATES:
            admin("/reset", {"dynamic": False})  # also signs the session out
            page.context.clear_cookies()
            page.goto(URL + "/login")
            page.wait_for_load_state("networkidle")
            page.get_by_label("Username").fill(USER)
            page.get_by_label("Password").fill(PASSWORD)
            with page.expect_navigation():
                page.get_by_role("button", name="Sign in").click()
            page.wait_for_load_state("networkidle")
            page.goto(URL + path)
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(300)
            for step in steps:
                act(page, step)
            result[name] = tree(page)
            print("captured", name, flush=True)
        browser.close()
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=1, ensure_ascii=False)
    print(f"wrote {out_path} ({len(result)} states)")


def visible(n):
    """The tree without ignored nodes (their children are lifted), as agents usually see it."""
    kids = [k for c in n.get("children", []) for k in visible(c)]
    if n.get("ignored"):
        return kids
    out = {k: v for k, v in n.items() if k not in ("children", "ignored")}
    if kids:
        out["children"] = kids
    return [out]


def lines(n, depth=0):
    head = {k: v for k, v in n.items() if k != "children"}
    yield "  " * depth + json.dumps(head, ensure_ascii=False)
    for c in n.get("children", []):
        yield from lines(c, depth + 1)


def diff(a_path, b_path):
    import difflib
    a, b = (json.load(open(p, encoding="utf-8")) for p in (a_path, b_path))
    strict_same = visible_same = 0
    for name in a:
        if name not in b:
            print(f"== {name}: missing in {b_path}")
            continue
        if a[name] == b[name]:
            strict_same += 1
            visible_same += 1
            continue
        va, vb = visible(a[name]), visible(b[name])
        if va == vb:
            visible_same += 1
            print(f"== {name}: same visible tree; ignored nodes differ")
            continue
        print(f"== {name}: DIFFERS")
        la = [l for t in va for l in lines(t)]
        lb = [l for t in vb for l in lines(t)]
        for l in list(difflib.unified_diff(la, lb, lineterm="", n=1))[:40]:
            print("   " + l)
    print(f"identical: {strict_same}/{len(a)}; same visible tree: {visible_same}/{len(a)}")
    return strict_same == visible_same == len(a)


if __name__ == "__main__":
    if sys.argv[1] == "--diff":
        sys.exit(0 if diff(sys.argv[2], sys.argv[3]) else 1)
    snapshot(sys.argv[1])
