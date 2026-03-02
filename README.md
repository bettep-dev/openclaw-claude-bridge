# openclaw-claude-bridge

**Chat with Claude Code from Telegram, Discord, Slack, and more.**

[![npm version](https://img.shields.io/npm/v/openclaw-claude-bridge)](https://www.npmjs.com/package/openclaw-claude-bridge)
[![license](https://img.shields.io/npm/l/openclaw-claude-bridge)](LICENSE)
[![node](https://img.shields.io/node/v/openclaw-claude-bridge)](package.json)

A bridge that connects messaging channels (Telegram, Discord, Slack, etc.) to Claude CLI through [OpenClaw](https://openclaw.ai) as a gateway. Built to use your existing OAuth-based Claude subscription directly — **no separate API billing required**.

```
User (Telegram/Discord/Slack/...)
    -> OpenClaw Gateway
        -> tmux session (Claude CLI)
            -> response via openclaw message send
                -> User
```

## Highlights

- **2-command setup** — install and run the onboard wizard, done
- **Persistent sessions** — Claude keeps context across messages via tmux
- **Multi-channel** — works with Telegram, Discord, Slack, WhatsApp, Signal, IRC, and more
- **Auto-healing daemon** — session restarts automatically if it dies
- **macOS & Linux** — LaunchAgent or systemd, auto-detected

> **Warning**
> Windows is not supported (requires tmux).

## Quick Start

```bash
npm i -g openclaw-claude-bridge
openclaw-claude-bridge onboard
```

The wizard auto-detects your environment. You only need to:

1. Select a channel (default: Telegram)
2. Paste your channel target ID (the wizard opens the dashboard for you)

That's it. Send `/cc "hello"` from your chat to verify.

## Prerequisites

> **Important**
> OpenClaw and Claude CLI must be installed **before** running this tool.

| Dependency                                              | Install                              | Docs                                      |
| ------------------------------------------------------- | ------------------------------------ | ----------------------------------------- |
| [OpenClaw](https://openclaw.ai)                         | `npm i -g openclaw`                  | https://openclaw.ai                       |
| [Claude CLI](https://github.com/anthropics/claude-code) | `npm i -g @anthropic-ai/claude-code` | https://github.com/anthropics/claude-code |

[tmux](https://github.com/tmux/tmux) is installed automatically during `onboard` if missing.

> **Caution**
> This package depends on the CLI interfaces of OpenClaw and Claude CLI. If either tool releases a breaking update, check for a compatible version of `openclaw-claude-bridge`.

## Usage

| Command | Description |
|---|---|
| `/cc "message"` | Send to existing session (keeps context) |
| `/ccn "message"` | Create new session (fresh context) |
| `/ccu` | Check Claude usage/cost |

> **Warning**
> Arguments after `/cc` and `/ccn` **must** be wrapped in double quotes.
> Without quotes, only the first word is sent as the instruction.
>
> ```
> /cc "deploy the app to production"   # Correct
> /cc deploy the app to production     # Wrong
> ```

## Supported Channels

### Built-in

| Channel  | Description            |
| -------- | ---------------------- |
| telegram | Telegram Bot API       |
| discord  | Discord Bot            |
| slack    | Slack Socket Mode      |
| whatsapp | WhatsApp Web (Baileys) |
| signal   | Signal via signal-cli  |
| irc      | Classic IRC            |

> **Note**
> Only Telegram has been tested by the maintainer. Other channels are supported in theory — please [report issues](https://github.com/bettep-dev/openclaw-claude-bridge/issues) if you encounter problems.

### Plugins

```bash
openclaw plugins install matrix
openclaw plugins install line
openclaw plugins install mattermost
openclaw plugins install teams
```

## What is a Target ID?

The target ID tells Claude where to send responses. It varies by channel:

| Channel  | Example              | How to find                           |
| -------- | -------------------- | ------------------------------------- |
| Telegram | `123456789`          | OpenClaw dashboard or `@userinfobot`  |
| Discord  | `123456789012345678` | Right-click channel > Copy Channel ID |
| Slack    | `#general`           | Channel name in Slack                 |

During setup, the wizard opens `http://127.0.0.1:18789/channels` where you can find your target ID.

## Architecture

```
               ┌─────────────────────────────────┐
               │   LaunchAgent / systemd (30s)   │
               │   runs claude-session.sh        │
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

1. A daemon (LaunchAgent on macOS, systemd on Linux) runs `claude-session.sh` every 30 seconds
2. If no `claude-daemon` tmux session exists, it creates one with Claude CLI
3. `/cc "message"` triggers `claude-send.sh` via OpenClaw
4. The script sends the message to tmux with a `[channel:id]` prefix
5. Claude processes the request and responds via `openclaw message send`

## What Gets Installed

| Component   | Location                        | Purpose                                   |
| ----------- | ------------------------------- | ----------------------------------------- |
| Scripts (4) | `~/.openclaw/scripts/`          | Session management and message relay      |
| Skills (3)  | `~/.openclaw/workspace/skills/` | OpenClaw skill definitions (cc, ccn, ccu) |
| CLAUDE.md   | `~/.openclaw/workspace/`        | System prompt for Claude CLI              |
| Daemon      | LaunchAgent or systemd          | Keeps tmux session alive (30s interval)   |

Existing files are patched, not replaced. Existing `CLAUDE.md` is backed up as `CLAUDE.{date}.md`.

## CLI Reference

```bash
openclaw-claude-bridge onboard     # interactive setup wizard
openclaw-claude-bridge check       # verify dependencies
openclaw-claude-bridge uninstall   # remove all installed components
```

## Troubleshooting

**Skills not responding after setup?**

```bash
/restart                # from your chat channel
openclaw gateway restart # from terminal
```

**Session not starting?**

```bash
# check daemon registration
launchctl list | grep openclaw          # macOS
systemctl --user status openclaw-claude  # Linux

# start session manually
~/.openclaw/scripts/claude-session.sh
```

**Message not delivered?**

```bash
# check tmux session
tmux has-session -t claude-daemon && echo "OK" || echo "No session"

# attach to see what's happening
tmux attach -t claude-daemon
```

**Claude CLI not responding?**

```bash
# create a fresh session
~/.openclaw/scripts/claude-new-session.sh "hello"
```

**Wrong target ID?**

```bash
# re-run onboard (existing scripts are patched, not replaced)
openclaw-claude-bridge onboard
```

## Acknowledgments

- [OpenClaw](https://openclaw.ai) — multi-channel messaging gateway
- [Claude CLI](https://github.com/anthropics/claude-code) — Anthropic's CLI for Claude

## License

[MIT](LICENSE)
