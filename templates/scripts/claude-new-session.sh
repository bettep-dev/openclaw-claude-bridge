#!/bin/bash
# bridge-version: 1
# Kill existing session -> create new session -> send instruction
MSG="$1"
TMUX="{{TMUX_BIN}}"
CLAUDE="{{CLAUDE_BIN}}"
WORKSPACE="{{WORKSPACE}}"
CHANNEL="{{CHANNEL}}"
TARGET="{{TARGET_ID}}"
SESSION="{{SESSION_NAME}}"

if [ -z "$MSG" ]; then
    echo "ERROR: No message provided"
    exit 1
fi

# Kill existing session
if "$TMUX" has-session -t "$SESSION" 2>/dev/null; then
    "$TMUX" send-keys -t "$SESSION" -l "/exit"
    "$TMUX" send-keys -t "$SESSION" Enter
    sleep 3
    "$TMUX" kill-session -t "$SESSION" 2>/dev/null
fi

# Create new session
"$TMUX" new-session -d -s "$SESSION"
"$TMUX" set-option -t "$SESSION" history-limit 10000
"$TMUX" send-keys -t "$SESSION" \
  "unset CLAUDECODE && cd $WORKSPACE && $CLAUDE --dangerously-skip-permissions" Enter

# Wait for Claude CLI prompt
WAIT=0
while [ $WAIT -lt 60 ]; do
    PANE=$("$TMUX" capture-pane -t "$SESSION" -p)
    if echo "$PANE" | grep -q "❯"; then
        break
    fi
    sleep 2
    WAIT=$((WAIT + 2))
done

# Send instruction
sleep 1
printf '%s' "[${CHANNEL}:${TARGET}] $MSG" | "$TMUX" load-buffer -
"$TMUX" paste-buffer -t "$SESSION" -d -p
sleep 0.3
"$TMUX" send-keys -t "$SESSION" Enter

echo "✅ New session started. Reply will arrive shortly."
