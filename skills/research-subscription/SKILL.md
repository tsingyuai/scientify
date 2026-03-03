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

## Tool to call

`scientify_cron_job`

- `action: "upsert"`: create or update a schedule
- `action: "list"`: show current schedules
- `action: "remove"`: cancel schedules

Routing rules:

- Research digest / paper tracking request: pass `topic`, leave `message` unset.
- Plain reminder request: pass `message`, do not set `topic`.
- If request is ambiguous, ask one concise clarification question before tool call.

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
- Optional `to`: channel-specific user or chat id
- Optional `no_deliver: true`: run in background without push

If the user does not specify destination, leave `channel` and `to` unset to use default routing.

## Topic field

If the user gives a clear topic, pass it as `topic` (for example, `"LLM alignment"`).
This focuses scheduled research content on that topic.

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
