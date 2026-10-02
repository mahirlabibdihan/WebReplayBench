"""The backtracking scenarios of WebReplayBench, loaded from the JSON dataset in data/.

  data/scenarios/single.json      105 single-interaction scenarios
  data/scenarios/pairs.json       12 two-write scenarios
  data/scenarios/multi_user.json  120 multi-user scenarios (a planned action, one edit by another user)
  data/noise.json                 randomness profiles
  data/site_map.json              how paths reach pages, and the safe suffix steps

Each single or two-write scenario brings the agent to a state through real clicks,
performs the interaction(s), and asks the agent to return to the state right after
them; returning is where an undetected persistent change can be re-executed.

For Python harnesses, steps are also available as tuples addressed by role and name:
  ("click", role, name[, nth])   ("fill", role, name, text[, enter])
  ("select", role, name, option) ("scroll", direction)
A name starting with "~" only has to be contained in the element's name.

Regenerate the calibrated paths after editing the scenarios:
  python -m webreplaybench.scenarios --calibrate
"""
import json
import sys
from pathlib import Path

DATA = Path(__file__).with_name("data")


def _load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def step_tuple(d):
    """A dataset step as a tuple (see the module docstring)."""
    if d["action"] == "scroll":
        return ("scroll", d["direction"])
    name = ("~" if d.get("match") == "contains" else "") + d["name"]
    t = (d["action"], d["role"], name)
    if d["action"] == "click" and "nth" in d:
        t += (d["nth"],)
    elif d["action"] == "fill":
        t += (d["text"],) + ((d["enter"],) if "enter" in d else ())
    elif d["action"] == "select":
        t += (d["option"],)
    return t


def step_dict(t):
    """The inverse of step_tuple."""
    if t[0] == "scroll":
        return {"action": "scroll", "direction": t[1]}
    d = {"action": t[0], "role": t[1], "name": t[2][1:] if t[2].startswith("~") else t[2]}
    if t[2].startswith("~"):
        d["match"] = "contains"
    if t[0] == "click" and len(t) > 3:
        d["nth"] = t[3]
    elif t[0] == "fill":
        d["text"] = t[3]
        if len(t) > 4:
            d["enter"] = t[4]
    elif t[0] == "select":
        d["option"] = t[3]
    return d


SINGLE = _load("scenarios/single.json")
PAIRS_DATA = _load("scenarios/pairs.json")
MULTI_USER = _load("scenarios/multi_user.json")
SITE = _load("site_map.json")

CONTROL_PREFIXES = ("S", "P", "Q")  # ids of interactions without a persistent change
TARGET_TOTAL = SINGLE["calibration"]["target_path_length"]
TARGET_SAME_PAGE = SINGLE["calibration"]["target_same_page_length"]


def _case(rec):
    c = {"id": rec["id"], "start": rec["start"]}
    if rec.get("element", rec["id"]) != rec["id"]:
        c["scenario"] = rec["element"]
    if rec.get("cohort"):
        c["cohort"] = rec["cohort"]
    if rec["setup"]:
        c["setup"] = [step_tuple(d) for d in rec["setup"]]
    if "elements" in rec:
        c["acts"] = [step_tuple(d) for d in rec["interaction"]]
        c["writes"] = "+".join(rec["elements"])
    else:
        c["act"] = step_tuple(rec["interaction"][0])
    return c


CASES = [_case(r) for r in SINGLE["scenarios"]]
PAIRS = [_case(r) for r in PAIRS_DATA["scenarios"]]
# Calibrated path lengths as stored in the dataset: {id: (suffix_length, detour_length)}.
PLAN = {r["id"]: (r["path"]["suffix_length"], r["path"]["detour_length"])
        for r in SINGLE["scenarios"] + PAIRS_DATA["scenarios"]}

NOISE = _load("noise.json")["profiles"]
SETTINGS_TABS = SITE["settings_tabs"]
MESSAGE_SUBJECTS = {int(k): v for k, v in SITE["message_subjects"].items()}
PRODUCT_NAMES = {int(k): v for k, v in SITE["product_names"].items()}
HEADER = SITE["header_links"]
DETOUR = SITE["detour_pages"]
SUFFIX_POOL = [step_tuple(d) for d in SITE["suffix_pool"]]  # safe same-page steps, tried in order

MESSAGES = {int(k): v for k, v in MULTI_USER["messages"].items()}
TARGETS = tuple(MULTI_USER["targets"])
PERTURBATIONS = tuple(MULTI_USER["perturbations"])
EDIT_MARK = MULTI_USER["edit_mark"]


def nav_path(start):
    """Link clicks from the home page to `start`."""
    if start == "/":
        return []
    path, _, frag = start.partition("#")
    if path in HEADER:
        steps = [("click", "link", HEADER[path])]
    elif path.startswith("/inbox/"):
        steps = [("click", "link", HEADER["/inbox"]), ("click", "link", MESSAGE_SUBJECTS[int(path.rsplit("/", 1)[1])])]
    elif path.startswith("/products/"):
        pid = int(path.rsplit("/", 1)[1])
        steps = [("click", "link", "Products")] + ([("click", "link", "Page 2")] if pid > 12 else []) + [("click", "link", PRODUCT_NAMES[pid])]
    elif path == "/checkout":
        steps = [("click", "link", HEADER["/cart"]), ("click", "link", "Proceed to checkout")]
    else:
        raise KeyError(f"no route to {start}")
    if frag:
        steps.append(("click", "link", SETTINGS_TABS[frag]))
    return steps


def detour_steps(start, n):
    """n link clicks through other pages before the route to `start`."""
    if n <= 0:
        return []
    if start == "/":  # the tour has to come back home: an even number of clicks
        n = max(2, n + n % 2)
        return [("click", "link", DETOUR[i % len(DETOUR)]) for i in range(n - 1)] + [("click", "link", "Home")]
    return [("click", "link", DETOUR[i % len(DETOUR)]) for i in range(n)]


# Safe same-page steps for the suffix, tried in order; scrolling is the fallback.
def acts_of(case):
    return case["acts"] if "acts" in case else [case["act"]]


def calibrate(cases):
    """Assign per-case suffix and detour lengths so each group hits the paper's means.

    Returns {case_id: (suffix_len, detour_len)}. Groups: destructive cases and
    controls are calibrated separately, and so is each cohort (cases added later
    carry "cohort": 2), so that adding cases never changes the paths of earlier ones
    while every cohort, and hence their union, still hits the means.
    """
    plan = {}
    groups = [[c for c in cases if c["id"].startswith(CONTROL_PREFIXES) == ctl and c.get("cohort", 1) == k]
              for ctl in (False, True) for k in sorted({c.get("cohort", 1) for c in cases})]
    for group in groups:
        if not group:
            continue
        n = len(group)
        same = {c["id"]: len(c.get("setup", [])) + len(acts_of(c)) for c in group}
        suffix = {c["id"]: 0 for c in group}
        need = round(TARGET_SAME_PAGE * n) - sum(same.values())
        order = sorted(group, key=lambda c: c["id"])
        while need > 0:  # add suffix steps to the currently shortest same-page parts
            c = min(order, key=lambda c: (same[c["id"]] + suffix[c["id"]], c["id"]))
            suffix[c["id"]] += 1
            need -= 1
        total = {c["id"]: len(nav_path(c["start"])) + same[c["id"]] + suffix[c["id"]] for c in group}
        detour = {c["id"]: 0 for c in group}
        need = round(TARGET_TOTAL * n) - sum(total.values())
        while need > 0:  # lengthen the shortest paths first
            c = min(order, key=lambda c: (total[c["id"]] + len(detour_steps(c["start"], detour[c["id"]])), c["id"]))
            before = len(detour_steps(c["start"], detour[c["id"]]))
            detour[c["id"]] += 1
            while len(detour_steps(c["start"], detour[c["id"]])) == before:
                detour[c["id"]] += 1
            need -= len(detour_steps(c["start"], detour[c["id"]])) - before
        for c in group:
            plan[c["id"]] = (suffix[c["id"]], detour[c["id"]])
    return plan


def _flat(v):
    """A value written on one line: a scalar, or a dict / list of scalars (a step, a record)."""
    if isinstance(v, dict):
        return not any(isinstance(x, (dict, list)) for x in v.values())
    if isinstance(v, list):
        return not any(isinstance(x, (dict, list)) for x in v)
    return True


def render(obj, level=0):
    """JSON with one step (or other flat record) per line."""
    if _flat(obj):
        return json.dumps(obj, ensure_ascii=False)
    pad = " " * level
    if isinstance(obj, dict):
        body = [f"{pad} {json.dumps(k)}: {render(v, level + 1)}" for k, v in obj.items()]
        return "{\n" + ",\n".join(body) + "\n" + pad + "}"
    body = [f"{pad} {render(v, level + 1)}" for v in obj]
    return "[\n" + ",\n".join(body) + "\n" + pad + "]"


def dump(path, obj):
    Path(path).write_text(render(obj) + "\n", encoding="utf-8", newline="\n")


def recalibrate():
    """Recompute every scenario's path (detour, navigation, lengths) and rewrite the dataset."""
    for name, data in (("scenarios/single.json", SINGLE), ("scenarios/pairs.json", PAIRS_DATA)):
        cases = [_case(r) for r in data["scenarios"]]
        plan = calibrate(cases)
        for rec, c in zip(data["scenarios"], cases):
            suffix_len, detour_len = plan[c["id"]]
            rec["path"] = {"detour": [step_dict(t) for t in detour_steps(c["start"], detour_len)],
                           "navigation": [step_dict(t) for t in nav_path(c["start"])],
                           "detour_length": detour_len, "suffix_length": suffix_len}
        dump(DATA / name, data)
        print("rewrote", DATA / name)


if __name__ == "__main__":
    if "--calibrate" in sys.argv:
        recalibrate()
    else:
        print(__doc__)
