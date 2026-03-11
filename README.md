# openclaw-claude-bridge

[![npm version](https://img.shields.io/npm/v/openclaw-claude-bridge)](https://www.npmjs.com/package/openclaw-claude-bridge)
[![license](https://img.shields.io/npm/l/openclaw-claude-bridge)](LICENSE)
[![node](https://img.shields.io/node/v/openclaw-claude-bridge)](package.json)

Bridge OpenClaw messaging channels (Telegram, Discord, Slack, etc.) to Claude CLI via persistent tmux sessions.

Routes commands directly to the Claude CLI in your terminal, avoiding OAuth issues and separate API costs.

<img src="DEMO_1.png" alt="Telegram demo 1" width="400" /> 
<img src="DEMO_2.png" alt="Telegram demo 2" width="400" />

## How It Works

Messages prefixed with `@cc` or `/cc` are intercepted by an OpenClaw **plugin** before reaching the LLM agent. The plugin suppresses the default LLM response and routes the message to a Claude CLI instance running in a persistent tmux session. Claude processes the request and replies back through the same channel.

## Prerequisites

| Dependency                                              | Install                                  |
| ------------------------------------------------------- | ---------------------------------------- |
| [OpenClaw](https://openclaw.ai)                         | `npm i -g openclaw`                      |
| [Claude CLI](https://github.com/anthropics/claude-code) | `npm i -g @anthropic-ai/claude-code`     |
| [tmux](https://github.com/tmux/tmux)                    | Auto-installed during onboard if missing |

> **Note:** macOS and Linux only. Windows is not supported (tmux dependency).

> **Warning:** This plugin has only been tested with the **Telegram** channel. Other channels (Discord, Slack, etc.) may have different message formats or metadata wrapping, which could cause the prefix detection or LLM suppression to fail. If you encounter issues on other channels, please report them.

## Quick Start

```bash
npm i -g openclaw-claude-bridge
openclaw-claude-bridge onboard
```

The interactive wizard handles everything — plugin install, shell scripts, CLAUDE.md, daemon, and channel config.

Once complete, send `/cc hello` from your chat to verify the connection.

## Commands

| Command                          | Description                              |
| -------------------------------- | ---------------------------------------- |
| `@cc message` or `/cc message`   | Send to existing session (keeps context) |
| `@ccn message` or `/ccn message` | Start a new session (fresh context)      |
| `@ccu` or `/ccu`                 | Show Claude usage info                   |

Quotes are not needed around messages:

```
/cc deploy the app to production
@ccn refactor the auth module
/ccu
```

## Architecture

```
               +---------------------------------+
               |   LaunchAgent / systemd (30s)   |
               |   runs claude-session.sh        |
               +---------------+-----------------+
                               | creates if missing
                               v
+--------+    +------------+   +-------------------+
|  User  |--->|  OpenClaw  |-->|  tmux session     |
| (chat) |    |  (plugin)  |   |  "claude-daemon"  |
|        |<---|            |<--|  (Claude CLI)     |
+--------+    +------------+   +-------------------+
```

The plugin uses three hooks:

| Hook                  | Purpose                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `before_prompt_build` | Detects prefix commands and overrides the system prompt to suppress the LLM                               |
| `message_sending`     | Cancels the LLM's outgoing message for bridge-handled commands                                            |
| `message_received`    | Executes the corresponding shell script (`claude-send.sh`, `claude-new-session.sh`, or `claude-usage.sh`) |

A daemon (LaunchAgent on macOS, systemd on Linux) runs `claude-session.sh` every 30 seconds to keep the tmux session alive. Claude CLI responds via `openclaw message send` back through the originating channel.

## Migration from v1

v2.0 replaces the legacy skill/hook system with a single OpenClaw plugin. Migration is automatic:

```bash
npm i -g openclaw-claude-bridge
openclaw-claude-bridge onboard
```

The onboard wizard detects and removes legacy skills and hooks, then installs the plugin. No manual cleanup needed.

## Uninstall

```bash
openclaw-claude-bridge uninstall
```

Removes all installed components — plugin, shell scripts, CLAUDE.md additions, and daemon.

## License

[MIT](LICENSE)
