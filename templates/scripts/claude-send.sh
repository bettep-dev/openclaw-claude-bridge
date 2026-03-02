#!/bin/bash
# Send instruction to existing claude-daemon tmux session
MSG="$1"
TMUX="{{TMUX_BIN}}"
CHANNEL="{{CHANNEL}}"
TARGET="{{TARGET_ID}}"
SESSION="{{SESSION_NAME}}"

if [ -z "$MSG" ]; then
    echo "ERROR: No message provided"
    exit 1
fi

# Check session exists
if ! "$TMUX" has-session -t "$SESSION" 2>/dev/null; then
    echo "ERROR: $SESSION session not found. It will be auto-created within 30 seconds."
    exit 1
fi

# Clear input line, then send message with channel prefix
"$TMUX" send-keys -t "$SESSION" C-c
sleep 0.5
"$TMUX" send-keys -t "$SESSION" C-u
sleep 0.3
"$TMUX" send-keys -t "$SESSION" -l "[${CHANNEL}:${TARGET}] $MSG"
"$TMUX" send-keys -t "$SESSION" Enter

echo "Instruction sent."
