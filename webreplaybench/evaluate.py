"""Database/browser-state evaluation of playground tasks.

A task config's "eval" block may contain:
  goal:       [{name, sql}]   each query returns one row with a boolean column "ok"
  collateral: [{name, sql}]   same format; checks that nothing else was changed
  answer_contains: [str]      all must appear (case-insensitive) in the agent's answer
  client:     [{type: localStorage|cookie, key, equals|contains}]
success = goal + answer + client checks pass; clean = all collateral checks pass.
"""
import json


def _sql_checks(oracle, checks):
    out = []
    for c in checks:
        try:
            rows = oracle.query(c["sql"])
            ok = bool(rows and rows[0].get("ok"))
            out.append({"name": c["name"], "ok": ok})
        except Exception as e:  # a broken check must fail loudly, not pass
            out.append({"name": c["name"], "ok": False, "error": str(e)})
    return out


def read_client_state(page):
    try:
        local = page.evaluate("() => Object.assign({}, window.localStorage)")
    except Exception:
        local = {}
    cookies = {c["name"]: c["value"] for c in page.context.cookies()}
    return local, cookies


def evaluate(config, oracle, page, answer: str) -> dict:
    spec = config.get("eval", {})
    goal = _sql_checks(oracle, spec.get("goal", []))
    collateral = _sql_checks(oracle, spec.get("collateral", []))

    answer_checks = [
        {"name": f"answer contains {s!r}", "ok": s.lower() in (answer or "").lower()}
        for s in spec.get("answer_contains", [])
    ]

    client_checks = []
    if spec.get("client"):
        local, cookies = read_client_state(page) if page is not None else ({}, {})
        for c in spec["client"]:
            value = local.get(c["key"]) if c["type"] == "localStorage" else cookies.get(c["key"])
            if "equals" in c:
                ok = value == c["equals"]
            elif "contains" in c:
                ok = value is not None and c["contains"] in value
            else:
                ok = value is None if c.get("absent") else value is not None
            client_checks.append({"name": f"{c['type']}:{c['key']}", "ok": ok, "value": value})

    success = all(c["ok"] for c in goal + answer_checks + client_checks)
    clean = all(c["ok"] for c in collateral)
    return {
        "task_id": config["id"],
        "success": success,
        "clean": clean,
        "answer": answer,
        "checks": {"goal": goal, "answer": answer_checks, "client": client_checks, "collateral": collateral},
        "final_fingerprint": oracle.fingerprint(),
    }


if __name__ == "__main__":  # quick manual check against the current DB state
    import sys
    from .oracle import Oracle
    from .task import load_tasks

    task = next(t for t in load_tasks() if t["id"] == int(sys.argv[1]))
    o = Oracle()
    print(json.dumps({k: _sql_checks(o, task["eval"].get(k, [])) for k in ("goal", "collateral")}, indent=2))
