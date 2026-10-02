"""Client for the site's admin/oracle API (reset + ground truth).

The admin API listens on its own port; an agent under test must not be allowed
to reach it (restrict the agent to PLAYGROUND_URL).
"""
import json
import os
import time
import urllib.request

PLAYGROUND_URL = os.environ.get("PLAYGROUND_URL", "http://localhost:4000").rstrip("/")
ADMIN_URL = os.environ.get("PLAYGROUND_ADMIN_URL", "http://127.0.0.1:4001").rstrip("/")
PLAYGROUND_USER = os.environ.get("PLAYGROUND_USER", "jordan")
PLAYGROUND_PASSWORD = os.environ.get("PLAYGROUND_PASSWORD", "playground123")


class Oracle:
    def __init__(self, admin_url: str = ADMIN_URL):
        self.admin_url = admin_url

    def _call(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            self.admin_url + path, data=data, method=method, headers={"content-type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read().decode())

    def reset(self, dynamic: bool = True, external: dict | None = None) -> dict:
        return self._call("POST", "/reset", {"dynamic": dynamic, "external": external})

    def perturb(self, kind: str, message_id: int | None = None) -> dict:
        """One controlled change by another actor (see the playground's runtime.js)."""
        return self._call("POST", "/perturb", {"kind": kind, "message_id": message_id})

    def watermark(self) -> dict:
        return self._call("GET", "/watermark")

    def audit(self, after: int, upto: int | None = None) -> list[dict]:
        q = f"/audit?after={after}" + (f"&upto={upto}" if upto is not None else "")
        return self._call("GET", q)["rows"]

    def requests(self, after: int, upto: int | None = None) -> list[dict]:
        q = f"/requests?after={after}" + (f"&upto={upto}" if upto is not None else "")
        return self._call("GET", q)["rows"]

    def fingerprint(self) -> dict:
        return self._call("GET", "/fingerprint")["tables"]

    def query(self, sql: str, params: list | None = None) -> list[dict]:
        return self._call("POST", "/query", {"sql": sql, "params": params or []})["rows"]

    def settle(self, min_wait: float = 0.6, quiet: float = 0.5, max_wait: float = 3.0) -> dict:
        """Wait until no new audit/request rows appear (debounced autosaves, redirects)."""
        start = time.time()
        time.sleep(min_wait)
        last = self.watermark()
        quiet_since = time.time()
        while time.time() - start < max_wait:
            time.sleep(0.2)
            cur = self.watermark()
            if cur != last:
                last, quiet_since = cur, time.time()
            elif time.time() - quiet_since >= quiet:
                break
        return last
