# openclaw-claude-bridge

Bridge OpenClaw messaging channels to Claude CLI via tmux persistent sessions.

```
User (Telegram/Discord/Slack/...)
    -> OpenClaw Gateway
        -> tmux send-keys
            -> claude-daemon session (Claude CLI)
                -> openclaw message send --channel {channel} --target {id}
                    -> User
```

## Prerequisites

> **IMPORTANT**: OpenClaw and Claude CLI must be installed and configured **before** running this tool.
> This package does **not** install them for you.

### Required (install first)

| Dependency | Install | Docs |
|------------|---------|------|
| [OpenClaw](https://openclaw.ai) | `npm i -g openclaw` | https://openclaw.ai |
| [Claude CLI](https://github.com/anthropics/claude-code) | `npm i -g @anthropic-ai/claude-code` | https://github.com/anthropics/claude-code |

Make sure both `openclaw` and `claude` commands are available in your terminal before proceeding.

> **WARNING**: This package depends on the CLI interfaces of OpenClaw and Claude CLI.
> If either tool releases a breaking update, this bridge may stop working correctly.
> Always check for a compatible version of `openclaw-claude-bridge` after updating OpenClaw or Claude CLI.

> **NOTE**: Only the **Telegram** channel has been tested and verified by the developer.
> Other channels (Discord, Slack, WhatsApp, etc.) are supported in theory but have **not been tested**.
> If you encounter issues with non-Telegram channels, please report them.

### Auto-installed

| Dependency | Description |
|------------|-------------|
| [tmux](https://github.com/tmux/tmux) | Terminal multiplexer - automatically installed during `onboard` if missing |

## Quick Start

```bash
npm i -g openclaw-claude-bridge
openclaw-claude-bridge onboard
```

The wizard auto-detects your environment. You only need to:

1. Select a channel with arrow keys (default: telegram)
2. Enter your channel target ID (the wizard opens the OpenClaw dashboard for you)

The setup wizard automatically restarts the OpenClaw Gateway to load the new skills. If the auto-restart fails, you can restart manually:

```bash
openclaw gateway restart    # from terminal
/restart                    # from your chat channel
```

## **Double Quotes are REQUIRED**

> **IMPORTANT**: Arguments after `/cc` and `/ccn` MUST be wrapped in double quotes.

```
Correct: /cc "deploy the app to production"
Wrong:   /cc deploy the app to production
```

Without double quotes, only the first word is sent as the instruction.

## Supported Channels

### Core (built-in)

| Channel | Description |
|---------|-------------|
| telegram | Telegram Bot API |
| discord | Discord Bot |
| slack | Slack Socket Mode |
| whatsapp | WhatsApp Web (Baileys) |
| signal | Signal via signal-cli |
| irc | Classic IRC |

### Plugin (install separately)

| Channel | Install |
|---------|---------|
| matrix | `openclaw plugins install matrix` |
| line | `openclaw plugins install line` |
| mattermost | `openclaw plugins install mattermost` |
| teams | `openclaw plugins install teams` |

## What is a Target ID?

The **target ID** tells Claude where to send responses. It varies by channel:

| Channel | Target ID | How to find |
|---------|-----------|-------------|
| Telegram | Chat ID (e.g. `123456789`) | Open the OpenClaw dashboard or use `@userinfobot` |
| Discord | Channel ID (e.g. `123456789012345678`) | Right-click channel > Copy Channel ID |
| Slack | Channel name (e.g. `#general`) | Check channel name in Slack |

During setup, the wizard opens **http://127.0.0.1:18789/channels** where you can find your channel's target ID in the OpenClaw dashboard.

## Skills Reference

| Skill | Description | Example |
|-------|-------------|---------|
| `/cc "msg"` | Send to existing session (keeps context) | `/cc "fix the login bug"` |
| `/ccn "msg"` | Create new session (fresh context) | `/ccn "refactor the auth module"` |
| `/ccu` | Query Claude usage/cost info | `/ccu` |

## How It Works

```
               ┌─────────────────────────────────┐
               │   LaunchAgent / systemd (30s)    │
               │   runs claude-session.sh         │
               └──────────────┬──────────────────┘
                              │ creates if missing
                              v
┌────────┐    ┌──────────┐    ┌───────────────────┐
│  User  │───>│ OpenClaw │───>│  tmux session     │
│ (chat) │    │ Gateway  │    │  "claude-daemon"  │
│        │<───│          │<───│  (Claude CLI)     │
└────────┘    └──────────┘    └───────────────────┘
  response via                  openclaw message
  channel                       send --channel ...
```

1. A **LaunchAgent** (macOS) or **systemd unit** (Linux) runs `claude-session.sh` every 30 seconds
2. If no `claude-daemon` tmux session exists, it creates one and starts Claude CLI
3. When you send `/cc "message"` via your channel, OpenClaw runs `claude-send.sh`
4. The script sends the message to the tmux session with a `[channel:id]` prefix
5. Claude processes the request and sends the result back via `openclaw message send`
6. The response arrives in your chat

## What Gets Installed

| Component | Location | Purpose |
|-----------|----------|---------|
| Scripts (4) | `~/.openclaw/scripts/` | Session management and message relay |
| Skills (3) | `~/.openclaw/workspace/skills/` | OpenClaw skill definitions (cc, ccn, ccu) |
| CLAUDE.md | `~/.openclaw/workspace/` | Bot mode prompt for Claude CLI |
| Daemon | LaunchAgent or systemd | Keeps tmux session alive |

If files already exist, only configuration values are updated (paths, channel, target ID). Existing CLAUDE.md is backed up as `CLAUDE.{date}.md` before replacement.

## CLI Commands

```bash
openclaw-claude-bridge onboard     # Interactive setup wizard
openclaw-claude-bridge check       # Verify all dependencies are installed
openclaw-claude-bridge uninstall   # Remove daemon, scripts, skills, CLAUDE.md
```

## Troubleshooting

**Skills not working after setup?**
```bash
# Restart OpenClaw to load new skills
/restart              # from your chat channel
# or
openclaw restart      # from terminal
```

**Session not starting?**
```bash
# Check if daemon is registered
launchctl list | grep openclaw          # macOS
systemctl --user status openclaw-claude  # Linux

# Manually start session
~/.openclaw/scripts/claude-session.sh
```

**Message not delivered?**
```bash
# Check tmux session exists
tmux has-session -t claude-daemon && echo "OK" || echo "No session"

# Attach to see what's happening
tmux attach -t claude-daemon
```

**Claude CLI not responding?**
```bash
# Create a fresh session
~/.openclaw/scripts/claude-new-session.sh "hello"
```

**Wrong target ID?**
```bash
# Re-run onboard to update settings (existing scripts are patched, not replaced)
openclaw-claude-bridge onboard
```

## Acknowledgments

- [OpenClaw](https://openclaw.ai) - Multi-channel messaging gateway that powers this bridge
- [Claude CLI](https://github.com/anthropics/claude-code) - Anthropic's CLI for Claude

## License

MIT
