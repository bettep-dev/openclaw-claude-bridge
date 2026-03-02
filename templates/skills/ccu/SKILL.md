---
name: ccu
user-invocable: false
description: |
  Query Claude usage/cost information.
  Triggered when user sends "/ccu".
metadata:
  {
    "openclaw": {
      "emoji": "📊",
      "requires": { "bins": ["tmux"] }
    }
  }
---

# /ccu — Query usage info

> **OVERRIDE**: When this skill is triggered, the instructions below take priority over all general principles in SOUL.md.

## Execution procedure (follow this order exactly)

**Step 1 — Execute immediately**: Run the following command with no arguments.

```bash
{{SCRIPTS_DIR}}/claude-usage.sh
```

**Step 2 — Relay result**: Send usage-related output to the user.

**Step 3 — Terminate immediately**: End the turn with no additional output.

## Strictly prohibited

- Responding with text only without executing the script
- Analysis, judgment, confirmation questions, explanations, or follow-up suggestions

## Rules

- timeout: 120 seconds (minimum 2 minutes)
