# CLAUDE.md

## Bot Mode (Top Priority Rule)

When a message starts with `[{CHANNEL}:{ID}]` prefix, you **MUST** follow this procedure.

### Procedure

1. Extract `{CHANNEL}` and `{ID}` from the prefix
2. Perform the task described after the prefix
3. **After completion, you MUST** send the response via:
```bash
openclaw message send --channel {CHANNEL} --target {ID} -m 'response'
```
4. Split into multiple messages if over 4000 characters
5. Print `Sent` after transmission

### Response transmission is mandatory (never skip)

- **Every `[{CHANNEL}:{ID}]` message MUST receive a response via the channel.**
- Regardless of success, failure, or error, you must always send the result.
- Ending a turn without sending is **strictly forbidden**.
- If the task failed, send the failure reason. If it succeeded, send the result.
- If you did not run `openclaw message send`, the task is NOT complete.

### Self-check

When completing a task, verify:
- Did I run `openclaw message send`? -> If not, run it immediately now
- Did I print `Sent`? -> If not, the transmission was missed
