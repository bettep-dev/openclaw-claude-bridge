import { execFile } from "node:child_process";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const PREFIX_RE = /^[@\/](cc|ccn|ccu)\b\s*([\s\S]*)/;

const SCRIPT_MAP: Record<string, string> = {
  cc: "claude-send.sh",
  ccn: "claude-new-session.sh",
  ccu: "claude-usage.sh",
};

const REQUIRES_ARG = new Set(["cc", "ccn"]);
const EXEC_TIMEOUT = 120_000;

const DELIVERY_MSG = "🔗 Claude CLI will reply shortly.";

const SILENT_PROMPT =
  "SYSTEM OVERRIDE: The previous user message was intercepted by the claude-bridge plugin and is already being handled externally. " +
  `You MUST NOT process, interpret, or respond to it. Output ONLY this exact text, nothing else: ${DELIVERY_MSG}`;

// NOTE: Single-user assumption — concurrent users may see cross-suppression
let bridgeSuppressUntil = 0;

export default function register(api: OpenClawPluginApi) {
  const config = api.pluginConfig as {
    scriptsDir?: string;
    channel?: string;
    targetId?: string;
  };

  const scriptsDir = config.scriptsDir ?? "";

  // --- Hook 1: before_prompt_build (modifying) ---
  // Detect prefix in user messages and override system prompt to suppress LLM
  api.on("before_prompt_build", async (event, ctx) => {
    const lastUserText = extractLastUserText(event.messages);

    if (lastUserText && PREFIX_RE.test(lastUserText)) {
      bridgeSuppressUntil = Date.now() + EXEC_TIMEOUT + 5_000;
      return { systemPrompt: SILENT_PROMPT, prependContext: SILENT_PROMPT };
    }
  });

  // --- Hook 2: message_sending (modifying) ---
  // Replace LLM output with delivery confirmation while bridge suppression is active
  api.on("message_sending", async (_event, _ctx) => {
    if (Date.now() < bridgeSuppressUntil) {
      return { content: DELIVERY_MSG };
    }
  });

  // --- Hook 3: message_received (fire-and-forget) ---
  // Detect prefix and execute the bridge script
  api.on("message_received", async (event, _ctx) => {
    const raw = (event.content ?? "").trim();
    const match = raw.match(PREFIX_RE);
    if (!match) return;

    const command = match[1];
    const script = SCRIPT_MAP[command];
    if (!script) return;

    const arg = match[2].replace(/^"([\s\S]*)"$/, "$1").trim();

    if (REQUIRES_ARG.has(command) && !arg) {
      api.logger.warn?.(`[claude-bridge] /${command} requires an argument`);
      return;
    }

    const scriptPath = `${scriptsDir}/${script}`;
    const args = arg ? [arg] : [];

    execFile(
      scriptPath,
      args,
      { timeout: EXEC_TIMEOUT },
      (error, _stdout, stderr) => {
        if (error) {
          api.logger.error?.(
            `[claude-bridge] ${script} failed: ${stderr?.trim() || error.message}`,
          );
        }
      },
    );
  });
}

/**
 * Extract the actual user message text from the last user message.
 * OpenClaw wraps Telegram messages with metadata:
 *   "Conversation info (untrusted metadata):\n```json\n{...}\n```\n\n@cc hello"
 * The real message is after the closing ``` block.
 */
function extractLastUserText(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) return undefined;

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as any;
    if (m?.role !== "user") continue;

    let raw: string | undefined;
    if (typeof m.content === "string") {
      raw = m.content;
    } else if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (typeof block === "string") {
          raw = block;
          break;
        }
        if (block?.type === "text" && typeof block.text === "string") {
          raw = block.text;
          break;
        }
      }
    } else if (typeof m.text === "string") {
      raw = m.text;
    }
    if (!raw) continue;

    // Strip metadata wrapper: everything before the closing ``` + blank lines
    const metaEnd = raw.lastIndexOf("```");
    if (metaEnd >= 0) {
      const afterMeta = raw.slice(metaEnd + 3).trim();
      if (afterMeta) return afterMeta;
    }
    return raw.trim();
  }
  return undefined;
}
