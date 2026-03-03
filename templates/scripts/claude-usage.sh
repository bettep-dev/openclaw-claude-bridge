#!/bin/bash
# bridge-version: 1
# Query Claude usage/cost info, send result via channel
# Always uses a temporary session to avoid deadlock with the main claude-daemon session
TMUX="{{TMUX_BIN}}"
CLAUDE="{{CLAUDE_BIN}}"
CHANNEL="{{CHANNEL}}"
TARGET="{{TARGET_ID}}"
MAX_WAIT=60
USE_SESSION="claude-usage-tmp"

cleanup() {
    "$TMUX" send-keys -t "$USE_SESSION" Escape 2>/dev/null
    sleep 1
    "$TMUX" send-keys -t "$USE_SESSION" -l "/exit"
    "$TMUX" send-keys -t "$USE_SESSION" Enter
    sleep 2
    "$TMUX" kill-session -t "$USE_SESSION" 2>/dev/null
}
trap cleanup EXIT

# Create temporary session
"$TMUX" kill-session -t "$USE_SESSION" 2>/dev/null
sleep 1
"$TMUX" new-session -d -s "$USE_SESSION"
"$TMUX" set-option -t "$USE_SESSION" history-limit 5000
"$TMUX" send-keys -t "$USE_SESSION" "unset CLAUDECODE && $CLAUDE --dangerously-skip-permissions" Enter

# Wait for prompt
INIT_WAIT=0
while [ $INIT_WAIT -lt 30 ]; do
    PANE=$("$TMUX" capture-pane -t "$USE_SESSION" -p)
    if echo "$PANE" | grep -q "❯"; then
        break
    fi
    sleep 2
    INIT_WAIT=$((INIT_WAIT + 2))
done

# Clear input, send /usage
"$TMUX" send-keys -t "$USE_SESSION" C-c
sleep 1
"$TMUX" send-keys -t "$USE_SESSION" C-u
sleep 0.5
"$TMUX" send-keys -t "$USE_SESSION" -l "/usage"
"$TMUX" send-keys -t "$USE_SESSION" Enter
sleep 3

# Poll for usage overlay
ELAPSED=3
INTERVAL=2

while [ $ELAPSED -lt $MAX_WAIT ]; do
    PANE=$("$TMUX" capture-pane -t "$USE_SESSION" -p)

    if echo "$PANE" | grep -q "Current session\|Current week\|Resets"; then
        # Send via channel
        openclaw message send --channel "$CHANNEL" --target "$TARGET" -m "$PANE" 2>/dev/null
        echo "$PANE"
        exit 0
    fi

    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
done

# Timeout
PANE=$("$TMUX" capture-pane -t "$USE_SESSION" -p)
echo "$PANE"
echo "[TIMEOUT: ${MAX_WAIT}s exceeded]"
exit 1
