#!/bin/bash
# Query Claude usage/cost info, send result via channel
TMUX="{{TMUX_BIN}}"
CLAUDE="{{CLAUDE_BIN}}"
CHANNEL="{{CHANNEL}}"
TARGET="{{TARGET_ID}}"
SESSION="{{SESSION_NAME}}"
MAX_WAIT=60
CREATED_TMP=false

# Check for existing claude-daemon session
if "$TMUX" has-session -t "$SESSION" 2>/dev/null; then
    USE_SESSION="$SESSION"
else
    # Create temporary session
    USE_SESSION="claude-usage-tmp"
    CREATED_TMP=true
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
fi

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
        # Close overlay
        "$TMUX" send-keys -t "$USE_SESSION" Escape
        sleep 1

        # Send via channel
        openclaw message send --channel "$CHANNEL" --target "$TARGET" -m "$PANE" 2>/dev/null

        # Clean up temp session
        if [ "$CREATED_TMP" = true ]; then
            "$TMUX" send-keys -t "$USE_SESSION" -l "/exit"
            "$TMUX" send-keys -t "$USE_SESSION" Enter
            sleep 2
            "$TMUX" kill-session -t "$USE_SESSION" 2>/dev/null
        fi

        echo "$PANE"
        exit 0
    fi

    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
done

# Timeout
PANE=$("$TMUX" capture-pane -t "$USE_SESSION" -p)
"$TMUX" send-keys -t "$USE_SESSION" Escape

if [ "$CREATED_TMP" = true ]; then
    "$TMUX" send-keys -t "$USE_SESSION" -l "/exit"
    "$TMUX" send-keys -t "$USE_SESSION" Enter
    sleep 2
    "$TMUX" kill-session -t "$USE_SESSION" 2>/dev/null
fi

echo "$PANE"
echo "[TIMEOUT: ${MAX_WAIT}s exceeded]"
exit 1
