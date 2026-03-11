# openclaw-claude-bridge

[![npm version](https://img.shields.io/npm/v/openclaw-claude-bridge)](https://www.npmjs.com/package/openclaw-claude-bridge)
[![license](https://img.shields.io/npm/l/openclaw-claude-bridge)](LICENSE)
[![node](https://img.shields.io/node/v/openclaw-claude-bridge)](package.json)

Bridge [OpenClaw](https://openclaw.ai) messaging channels to [Claude CLI](https://github.com/anthropics/claude-code) via persistent tmux sessions.

Send `@cc` or `/cc` from any chat — your message is routed directly to Claude CLI running in your terminal, bypassing the gateway LLM entirely. No separate API keys, no OAuth, no extra costs.

<p>
  <img src="DEMO_1.png" alt="Telegram demo — sending a command" width="400" />
  <img src="DEMO_2.png" alt="Telegram demo — receiving a response" width="400" />
</p>

> **⚠️ Telegram only.** This plugin has been developed and tested exclusively with the Telegram channel. Other channels (Discord, Slack, etc.) may use different message formats or metadata wrapping that could break prefix detection or LLM suppression. Community contributions for additional channels are welcome — please open an issue if you encounter problems.

## How It Works

<img alt="Architecture" src="https://mermaid.ink/img/Z3JhcGggVEQKICAgIEFbIkNoYXQiXSAtLT58IkBjYyBtZXNzYWdlInwgQlsiT3BlbkNsYXcgR2F0ZXdheSJdCiAgICBCIC0tPiBDWyJjbGF1ZGUtYnJpZGdlIHBsdWdpbiJdCiAgICBDIC0tPnxzdXBwcmVzcyBMTE18IEIKICAgIEMgLS0+fGV4ZWNGaWxlfCBEWyJTaGVsbCBTY3JpcHQiXQogICAgRCAtLT58dG11eCBwYXN0ZS1idWZmZXJ8IEVbIkNsYXVkZSBDTEkgLyB0bXV4Il0KICAgIEUgLS0+fCJvcGVuY2xhdyBtZXNzYWdlIHNlbmQifCBB" />

1. User sends a prefixed message (e.g. `@cc deploy the app`)
2. The plugin intercepts the message and suppresses the gateway LLM
3. A shell script forwards the message to Claude CLI in a persistent tmux session
4. Claude CLI replies back through the same channel via `openclaw message send`

## Prerequisites

| Dependency | Install |
|---|---|
| [OpenClaw](https://openclaw.ai) | `npm i -g openclaw` |
| [Claude CLI](https://github.com/anthropics/claude-code) | `npm i -g @anthropic-ai/claude-code` |
| [tmux](https://github.com/tmux/tmux) | Auto-installed during onboard if missing |

> **Note:** macOS and Linux only. Windows is not supported (tmux dependency).

## Quick Start

```bash
npm i -g openclaw-claude-bridge
openclaw-claude-bridge onboard
```

The interactive wizard configures everything — plugin, shell scripts, CLAUDE.md, daemon, and channel settings.

Verify the connection:

```
@cc hello
```

## Commands

| Prefix | Description |
|---|---|
| `@cc` · `/cc` | Send to the current session (retains conversation context) |
| `@ccn` · `/ccn` | Start a fresh session (kills existing, creates new) |
| `@ccu` · `/ccu` | Show Claude CLI usage stats |

Messages are sent as-is — no quoting needed:

```
@cc refactor the auth module and add tests
@ccn review this PR: https://github.com/org/repo/pull/42
@ccu
```

Multiline messages and special characters (`$`, `` ` ``, `\`, quotes) are preserved exactly as typed.

## Migration from v1

v2 replaces the legacy skill/hook system with a single OpenClaw plugin:

```bash
npm i -g openclaw-claude-bridge
openclaw-claude-bridge onboard
```

The wizard detects and removes legacy components automatically.

## Uninstall

```bash
openclaw-claude-bridge uninstall
```

Removes all installed components — plugin, shell scripts, CLAUDE.md additions, and daemon.

## Troubleshooting

| Symptom | Fix |
|---|---|
| LLM responds instead of delivery message | `openclaw gateway restart` |
| Delivery confirmed but no reply | Check `tmux ls` — session may have crashed |
| Multiline sends only first line | Re-run `openclaw-claude-bridge onboard` (v2.0.5+) |

## License

[MIT](LICENSE)
