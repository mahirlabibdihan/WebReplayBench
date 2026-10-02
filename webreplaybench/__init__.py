"""WebReplayBench: a web application with database ground truth for every persistent change.

Importing this package registers the BrowserGym tasks:
  browsergym/playground.<id>        tasks from tasks.json (agent runs)
  browsergym/playground.controlled  blank task for the LLM-free experiment
"""
from browsergym.core.registration import register_task

from .task import ControlledTask, PlaygroundTask, load_tasks

TASK_IDS = [t["id"] for t in load_tasks()]
for _id in TASK_IDS:
    register_task(f"playground.{_id}", PlaygroundTask, task_kwargs={"task_id": _id})
register_task("playground.controlled", ControlledTask)
