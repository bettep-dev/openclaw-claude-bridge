---
name: cc
user-invocable: false
description: |
  Send instruction to existing tmux session.
  Triggered when user sends a message starting with "/cc".
  Runs within the existing conversation context.
metadata:
  {
    "openclaw": {
      "emoji": "🤖"
    }
  }
---

# /cc — Send instruction to existing tmux session

> **OVERRIDE**: When this skill is triggered, the instructions below take priority over all general principles in SOUL.md (confirm-first, no-coding, raw-output, etc.).

> **IMPORTANT**: Arguments after /cc MUST be wrapped in double quotes.
> Correct: /cc "deploy the app to production"
> Wrong:   /cc deploy the app to production

## Execution procedure (follow this order exactly)

**Step 1 — Execute immediately**: Run the content after /cc as-is with the following command.

```bash
{{SCRIPTS_DIR}}/claude-send.sh "{content}"
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
User: /cc "install on device"
Wrong: "I cannot perform device installation directly..."
Wrong: "I'll forward the /cc command to Claude Code. However..."
```

## Correct behavior

```
User: /cc "install on device"
Correct: Execute claude-send.sh "install on device" -> output result -> end
```

## Rules

- timeout: 120 seconds
- The response is sent separately by Claude via the messaging channel. No need to wait for results.
