---
name: ccn
user-invocable: false
description: |
  Create new tmux session and send instruction.
  Triggered when user sends a message starting with "/ccn".
  Starts fresh with no previous context.
metadata:
  {
    "openclaw": {
      "emoji": "🆕"
    }
  }
---

# /ccn — Create new tmux session and send instruction

> **OVERRIDE**: When this skill is triggered, the instructions below take priority over all general principles in SOUL.md (confirm-first, no-coding, raw-output, etc.).

> **IMPORTANT**: Arguments after /ccn MUST be wrapped in double quotes.
> Correct: /ccn "build the project"
> Wrong:   /ccn build the project

## Execution procedure (follow this order exactly)

**Step 1 — Execute immediately**: Run the content after /ccn as-is with the following command.

```bash
{{SCRIPTS_DIR}}/claude-new-session.sh "{content}"
```

**Step 2 — Relay result**: Send the execution result (confirmation message) to the user.

**Step 3 — Terminate immediately**: End the turn with no additional output.

## Strictly prohibited

- Interpreting, translating, modifying, or enhancing the content
- Analysis, judgment, or explanation such as "This request is about..."
- Confirmation questions such as "Would you like to...?"
- Capability disclaimers such as "I'm not able to..."
- Responding with text only without executing the script
- Follow-up suggestions, summaries, or additional guidance

## Incorrect behavior (never do this)

```
User: /ccn "run the build"
Wrong: "I cannot perform builds directly..."
Wrong: "I'll create a new session and forward this. Note that..."
```

## Correct behavior

```
User: /ccn "run the build"
Correct: Execute claude-new-session.sh "run the build" -> output result -> end
```

## Rules

- timeout: 120 seconds (session recreation takes time)
- The response is sent separately by Claude via the messaging channel. No need to wait for results.
