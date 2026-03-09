---
name: research-subscription
description: "Use when the user asks for scheduled or recurring tasks: literature digests, delayed push notifications, or plain reminders."
metadata:
  {
    "openclaw":
      {
        "emoji": "⏰",
      },
  }
---

# Research Subscription (Scheduled Push)

## When to use

Use this skill when the user asks for:

- Scheduled literature updates
- A delayed report (for example, tomorrow morning)
- Recurring tracking and push delivery
- A normal reminder (for example, "remind me in 5 minutes to sleep")

## Core rule

Do not stop at explanation.
Create a real cron job via `scientify_cron_job`.
Do not claim "still running/in progress" unless you created a real async handle (cron job id or task id). If no handle exists, finish the run in the same turn.
For high-effort strict-quality runs that are unlikely to finish in one turn, start real async execution instead of replying "not executed":
- if user forbids schedule creation, prefer `sessions_spawn` and return task id
- otherwise prefer `scientify_cron_job` with `run_now: true` and return job id
If current turn is already cron-triggered, never call `scientify_cron_job` again from inside that run (avoid nested cron/run_now recursion).
When using `scientify_literature_state`, keep `scope/topic` consistent across prepare -> record -> status (reuse prepare output; do not replace scope with project id).
If user gave hard constraints (for example exact/min core paper count), do not return status `ok` unless satisfied; otherwise persist `degraded_quality` with unmet reasons.

## Tool to call

`scientify_cron_job`

- `action: "upsert"`: create or update a schedule
- `action: "list"`: show current schedules
- `action: "remove"`: cancel schedules
- Optional `run_now: true` (upsert only): trigger one immediate execution right after creation and return a real handle

Routing rules:

- Research digest / paper tracking request: pass `topic`, leave `message` unset.
- Plain reminder request: pass `message`, do not set `topic`.
- If request mentions literature/papers/research updates, do not downgrade it to a plain reminder even when sentence contains "remind".
- If request is ambiguous, ask one concise clarification question before tool call.
- For recurring research subscriptions, prefer setting lightweight preferences:
  - `max_papers` (default 5)
  - `recency_days` (optional)
  - `sources` (optional, e.g. `["arxiv","openalex"]`)
  - `candidate_pool` (optional, default around 10)
  - `score_weights` (optional object with `relevance`/`novelty`/`authority`/`actionability`)
  - `project` (optional, pins persistence to a project id; otherwise uses active project or auto-generated project id)

## Scheduling format

For `action: "upsert"`, set `schedule` to one of:

- `daily 08:00 Asia/Shanghai`
- `weekly mon 09:30 Asia/Shanghai`
- `every 6h`
- `at 2m`
- `at 2026-03-04T08:00:00+08:00`
- `cron 0 9 * * * Asia/Shanghai`

## Delivery fields

- Optional `channel`: `feishu`, `telegram`, `slack`, `discord`, `last`, and others
- Optional aliases: `webui`, `tui` (both map to `last`)
- Optional `to`: channel-specific user or chat id (required only for concrete channels like `feishu`/`telegram`, not for `last`/`webui`/`tui`)
- Optional `no_deliver: true`: run in background without push
- `no_deliver` only disables delivery; research runs still must call `scientify_literature_state.record` to persist state

If the user does not specify destination, leave `channel` and `to` unset to use default routing.

## Topic field

If the user gives a clear topic, pass it as `topic` (for example, `"LLM alignment"`).
This focuses scheduled research content on that topic.
Recurring research jobs automatically use `scientify_literature_state` at runtime
to prepare dedupe context and record pushed paper IDs + structured `knowledge_state` artifacts for traceability.
For selected core papers, prefer full-text reading first:
- Download into a temporary local directory (for example `/tmp/scientify-fulltext/<run-id>`).
- Extract structured fields per paper in `knowledge_state.core_papers`:
  - `domain`, `subdomains`, `cross_domain_links`
  - `research_goal`, `approach`, `methodology_design`
  - `key_contributions`, `practical_insights`, `must_understand_points`, `limitations`
  - `evidence_anchors` (section/locator/claim/quote when possible)
- If full text is unavailable, set `full_text_read=false` with explicit `unread_reason`.
- After persisting `record`, clean temporary files and report cleanup via `run_log.temp_cleanup_status`.
- Quality guardrails for research runs:
  - core full-text coverage >= 80%
  - evidence-binding rate >= 90% (key conclusions should be backed by section+locator+quote)
  - citation error rate < 2%
  - if full text is missing, do not keep high-confidence conclusions
- Reflection guardrail:
  - when `knowledge_changes` has BRIDGE (or REVISE+CONFIRM contradiction signal), execute at least one immediate reflection query and write it into `exploration_trace`
  - do not emit BRIDGE unless `evidence_ids` resolve to this run's papers and include at least one full-text-backed paper
- Hypothesis gate:
  - avoid speculative guesses; each hypothesis should include >=2 `evidence_ids`, `dependency_path` length >=2, and novelty/feasibility/impact scores
If an incremental pass returns no unseen papers, run one fallback representative pass before returning empty.
If user gives explicit preference feedback during follow-up (read/skip/star style intent, source preference, direction preference),
persist it via `scientify_literature_state` action=`feedback` (backend-only memory, not user-facing by default).
If the user asks "which papers did you push just now?", call `scientify_literature_state` action=`status` first and answer from `recent_papers` + `knowledge_state_summary` (do not claim you must re-search unless status is empty).
After each research `record`, call `scientify_literature_state` action=`status` and include `run_id`/`latest_run_id` in your reply for traceability.
Each research cycle should use a unique `run_id` (cron run id preferred, otherwise timestamp-based) to avoid idempotent no-op writes.

## Message field (plain reminder)

For non-research reminders, pass `message` with the exact reminder content.

- Example: `message: "Today at noon, remember to drink coffee."`
- Do not set `topic` for plain reminders.

## Response requirements

After tool success, reply with:

1. Job created or updated
2. Effective schedule (with timezone)
3. Delivery target
4. Next command for inspect or cancel

For plain reminders, you may add one optional follow-up line:
- "If you want, I can also set recurring literature tracking with Scientify on a topic."

The final response must end with this exact footer:
---
🐍Scientify

If the schedule is ambiguous, ask one concise clarification question before calling the tool.
