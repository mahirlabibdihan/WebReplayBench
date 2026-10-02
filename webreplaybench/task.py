"""BrowserGym tasks for WebReplayBench. Every setup() resets the database."""
import json
import logging
from pathlib import Path

import playwright.sync_api
from browsergym.core.task import AbstractBrowserTask

from .evaluate import evaluate
from .oracle import PLAYGROUND_PASSWORD, PLAYGROUND_URL, PLAYGROUND_USER, Oracle

logger = logging.getLogger(__name__)
# Optional observer of agent runs, set by an evaluation harness: an object with
# begin_task(config, browser_context) and end_task(result). None: no observer.
HOOK = None
TASKS_FILE = Path(__file__).with_name("data") / "tasks.json"


def load_tasks() -> list[dict]:
    return json.loads(TASKS_FILE.read_text(encoding="utf-8"))["tasks"]


def attach_handlers(page: playwright.sync_api.Page) -> None:
    """Record every request on page.http_requests (method, url, header, payload),
    plus ground truth from the site's X-DB-Changed response header.

    Each request record gains "db_changed" / "db_changes" once its response
    arrives, so an agent's logs carry ground truth next to its own verdict on
    each request. If the response arrives after the step's observation was
    taken, a {"method": "RESPONSE", ...} record is appended to the next step
    instead.
    """
    pending = {}

    def handle_dialog(dialog):
        page.dialog_message = dialog.message
        dialog.accept()

    def log_request(request):
        try:
            payload = request.post_data
        except Exception:
            payload = None
        try:
            headers = dict(request.headers)
        except Exception:
            headers = {}
        record = {
            "method": request.method,
            "url": request.url,
            "header": headers,
            "payload": payload if payload is not None else "",
        }
        pending[request] = record
        page.http_requests.append(record)

    def log_response(response):
        record = pending.pop(response.request, None)
        changed = response.headers.get("x-db-changed")
        if record is None or changed is None:
            return
        gt = {"status": response.status, "db_changed": changed == "true",
              "db_changes": int(response.headers.get("x-db-changes", "0"))}
        if any(r is record for r in page.http_requests):
            record.update(gt)
        else:
            page.http_requests.append({"method": "RESPONSE", "for_method": record["method"], "url": record["url"],
                                       "header": {}, "payload": "", "late": True, **gt})

    page.dialog_message = None
    page.http_requests = []
    page.on("dialog", handle_dialog)
    page.on("request", log_request)
    page.on("response", log_response)


def login_and_open(page: playwright.sync_api.Page, start_path: str) -> None:
    # page.request shares its cookie jar with the browser context.
    res = page.request.post(
        f"{PLAYGROUND_URL}/api/login", data={"username": PLAYGROUND_USER, "password": PLAYGROUND_PASSWORD}
    )
    if not res.ok:
        raise RuntimeError(f"Playground login failed ({res.status}). Is the server running at {PLAYGROUND_URL}?")
    page.goto(PLAYGROUND_URL + start_path)
    page.wait_for_load_state("networkidle")


class PlaygroundTask(AbstractBrowserTask):
    """One benchmark task from tasks.json, evaluated against the database."""

    def __init__(self, seed: int, task_id: int) -> None:
        super().__init__(seed)
        self.viewport = {"width": 1280, "height": 720}
        self.slow_mo = 200
        self.timeout = 10000
        self.oracle = Oracle()
        self.config = next(t for t in load_tasks() if t["id"] == task_id)

    @classmethod
    def get_task_id(cls):
        return "playground"

    def setup(self, page: playwright.sync_api.Page) -> tuple[str, dict]:
        reset = self.config.get("reset", {})
        self.oracle.reset(dynamic=reset.get("dynamic", True), external=reset.get("external"))
        attach_handlers(page)
        login_and_open(page, self.config["start_path"])
        if HOOK is not None:
            HOOK.begin_task(self.config, page.context)
        return self.config["intent"], {}

    def teardown(self) -> None:
        # Stop background activity but keep the final state for evaluation;
        # the next task's setup() resets the database.
        self.oracle._call("POST", "/external", {})

    def validate(self, page: playwright.sync_api.Page, chat_messages: list) -> tuple[float, bool, str, dict]:
        if not chat_messages or chat_messages[-1]["role"] not in ("assistant", "infeasible"):
            return 0.0, False, "", {}
        answer = chat_messages[-1]["message"] if chat_messages[-1]["role"] == "assistant" else "N/A"
        result = evaluate(self.config, self.oracle, page, answer)
        if HOOK is not None:
            HOOK.end_task(result)
        return (1.0 if result["success"] and result["clean"] else 0.0), True, "", result


# Mutable config for ControlledTask, set by the controlled experiment before env.reset().
CONTROLLED = {"start_path": "/", "dynamic": False, "external": None}


class ControlledTask(AbstractBrowserTask):
    """Blank task used by the LLM-free layered-defense experiment."""

    def __init__(self, seed: int) -> None:
        super().__init__(seed)
        self.viewport = {"width": 1280, "height": 720}
        self.slow_mo = 0
        self.timeout = 10000
        self.oracle = Oracle()

    @classmethod
    def get_task_id(cls):
        return "playground.controlled"

    def setup(self, page: playwright.sync_api.Page) -> tuple[str, dict]:
        self.oracle.reset(dynamic=CONTROLLED["dynamic"], external=CONTROLLED.get("external"))
        attach_handlers(page)
        login_and_open(page, CONTROLLED["start_path"])
        return "controlled experiment", {}

    def validate(self, page, chat_messages):
        return 0.0, False, "", {}
