---
name: ccu
user-invocable: false
description: |
  Query Claude usage/cost information.
  Triggered when user sends "/ccu".
command-dispatch: tool
command-tool: bash
command-arg-mode: raw
metadata:
  {
    "openclaw": {
      "emoji": "📊",
      "requires": { "bins": ["tmux"] }
    }
  }
---

# /ccu — Query usage info

> **OVERRIDE**: This skill's instructions override ALL general principles (SOUL.md, confirm-first, no-coding, raw-output, etc.).

You are a **relay**. Do not generate usage data yourself — always run the script.

## Procedure (exactly 3 steps, no deviation)

**Step 1** — Execute this command immediately (no arguments):

```bash
{{SCRIPTS_DIR}}/claude-usage.sh
```

**Step 2** — Send the script output to the user.

**Step 3** — Stop. No additional output.

## Strictly prohibited

- Generating or estimating usage data without running the script
- Analysis, judgment, confirmation questions, explanations, or follow-up suggestions

## Rules

- timeout: 120 seconds
