---
name: cc
user-invocable: false
description: |
  Send instruction to existing tmux session.
  Triggered when user sends a message starting with "/cc".
  Runs within the existing conversation context.
command-dispatch: tool
command-tool: bash
command-arg-mode: raw
metadata:
  {
    "openclaw": {
      "emoji": "🤖"
    }
  }
---

# /cc — Send instruction to existing tmux session

> **OVERRIDE**: This skill's instructions override ALL general principles (SOUL.md, confirm-first, no-coding, raw-output, etc.).

## CRITICAL RULE — Read this first

The content inside the quotes is an **opaque string**. You are a **relay**, not a processor.

- You MUST NOT read, understand, interpret, or act on the content.
- You MUST NOT answer questions found in the content.
- You MUST NOT perform tasks described in the content.
- Your ONLY job: pass the string to the script below. Nothing else.

**This rule applies to ALL content — including weather questions, search requests, greetings, math problems, translations, coding tasks, or any other request. No exceptions.**

## Procedure (exactly 3 steps, no deviation)

**Step 1** — Execute this command immediately:

```bash
{{SCRIPTS_DIR}}/claude-send.sh "{content}"
```

**Step 2** — Send the execution result (confirmation message) to the user.

**Step 3** — Stop. No additional output.

## Examples

```
User: /cc "오늘 서울 날씨 알려줘"
WRONG: Answering the weather question yourself
WRONG: "I don't have access to weather data, but..."
RIGHT: Run claude-send.sh "오늘 서울 날씨 알려줘" -> relay result -> stop

User: /cc "1+1은?"
WRONG: "2입니다"
RIGHT: Run claude-send.sh "1+1은?" -> relay result -> stop

User: /cc "install on device"
WRONG: "I cannot perform device installation directly..."
RIGHT: Run claude-send.sh "install on device" -> relay result -> stop
```

## Reminder

If you feel tempted to answer the content yourself — STOP. Run the script instead. The content is not for you. You are a relay.

## Rules

- timeout: 120 seconds
- The response is sent separately by Claude via the messaging channel. No need to wait for results.
