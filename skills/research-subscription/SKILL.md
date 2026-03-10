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
Default policy is fast/non-blocking: always complete retrieve -> filter -> read -> record -> status in this turn when possible.
User-facing output should be concise Markdown; keep tool-call JSON minimal (only required persistence fields).
For high-effort strict-quality runs that are unlikely to finish in one turn, start real async execution instead of replying "not executed":
- if user forbids schedule creation, prefer `sessions_spawn` and return task id
- otherwise prefer `scientify_cron_job` with `run_now: true` and return job id
If user asks "create/start a research task now and return raw status JSON", call `scientify_cron_job` (`action=upsert`, `run_now=true`) and return the tool-provided `status_json` directly (do not synthesize JSON text).
If current turn is already cron-triggered, never call `scientify_cron_job` again from inside that run (avoid nested cron/run_now recursion).
When using `scientify_literature_state`, keep `scope/topic` consistent across prepare -> record -> status (reuse prepare output; do not replace scope with project id).
Soft-gate default: non-fatal quality issues should be persisted as warnings; only fatal issues should become `degraded_quality`.
If at least one paper was selected/read, never downgrade the run to `empty` only because strict-quality warnings are unmet.
In strict profile, do not lower `required_core_papers` below `min(3, max_papers)` to force-pass quality gates. If selected papers are insufficient, broaden retrieval queries first.
If strict constraints cannot be fully satisfied in this turn, do not refuse execution; persist a traceable run and let quality gate severity explain risk level.

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
  - `candidate_pool` (optional, strict default 24)
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
- Do not fill placeholders like `N/A`, `not provided`, `unknown`; omit field if unavailable, or use `unread_reason` when full text was not read.
- If full text is unavailable, set `full_text_read=false` with explicit `unread_reason`.
- After persisting `record`, clean temporary files and report cleanup via `run_log.temp_cleanup_status`.
- Quality guardrails for research runs:
  - core full-text coverage >= 80%
  - evidence-binding rate >= 90% (key conclusions should be backed by section+locator+quote)
  - citation error rate < 2%
  - if full text is missing, do not keep high-confidence conclusions
  - quality gate mode is soft by default (`severity=warn` does not block run status)
- Reflection guardrail:
  - when `knowledge_changes` has BRIDGE (or NEW+REVISE signal, or unread core backlog), execute one immediate reflection query and write it into `exploration_trace`
  - do not emit BRIDGE unless `evidence_ids` resolve to this run's papers and include at least one full-text-backed paper
- Hypothesis gate:
  - avoid speculative guesses; each hypothesis should include >=2 `evidence_ids`, `dependency_path` length >=2, and novelty/feasibility/impact scores
  - before user-facing text, read `status.knowledge_state_summary.hypothesis_gate.accepted`
    - if `accepted == 0`: output factual cycle report only (papers/read-status/changes/gates); do not output speculative "high-value routes"/"deep dive" guidance
    - if `accepted > 0`: include hypothesis details in the current message by default (stable delivery path)
    - only if runtime/channel clearly supports multi-send, optionally split into two consecutive messages (alert first, details second)
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
