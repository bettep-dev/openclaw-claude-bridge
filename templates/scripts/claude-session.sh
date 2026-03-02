#!/bin/bash
# Keep claude-daemon tmux session alive (daemon runs every 30s)
TMUX="{{TMUX_BIN}}"
CLAUDE="{{CLAUDE_BIN}}"
WORKSPACE="{{WORKSPACE}}"
SESSION="{{SESSION_NAME}}"

# Exit if session already exists
if "$TMUX" has-session -t "$SESSION" 2>/dev/null; then
    exit 0
fi

# Create new session + start Claude CLI
"$TMUX" new-session -d -s "$SESSION"
"$TMUX" set-option -t "$SESSION" history-limit 10000
"$TMUX" send-keys -t "$SESSION" \
  "unset CLAUDECODE && cd $WORKSPACE && $CLAUDE --dangerously-skip-permissions" Enter
