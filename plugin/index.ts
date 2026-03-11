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
  "CRITICAL SYSTEM OVERRIDE — HIGHEST PRIORITY.\n" +
  "The previous user message was intercepted by the claude-bridge plugin and is already being handled externally.\n" +
  "You MUST NOT process, interpret, or respond to the user's request.\n" +
  "You MUST NOT call any tools or functions.\n" +
  `Output ONLY this exact text, nothing else: ${DELIVERY_MSG}`;

// NOTE: Single-user assumption — concurrent users may see cross-suppression
let bridgeSuppressUntil = 0;

/**
 * Flag set by message_received (fires FIRST) and consumed by before_prompt_build (fires SECOND).
 * This bypasses the unreliable extractLastUserText approach entirely.
 * message_received gets event.content (raw user text) which always correctly detects @cc prefix.
 */
let pendingBridgeCommand = false;

export default function register(api: OpenClawPluginApi) {
  const config = api.pluginConfig as {
    scriptsDir?: string;
    channel?: string;
    targetId?: string;
  };

  const scriptsDir = config.scriptsDir ?? "";

  // --- Hook 1: message_received (fire-and-forget) ---
  // Fires FIRST. Detect prefix from raw event.content and set pendingBridgeCommand flag.
  // Also executes the bridge script.
  api.on("message_received", async (event, _ctx) => {
    const raw = (event.content ?? "").trim();
    api.logger.debug?.(
      `[claude-bridge] message_received: raw_start=${JSON.stringify(raw.slice(0, 200))}`,
    );
    const match = raw.match(PREFIX_RE);
    if (!match) return;

    const command = match[1];
    const script = SCRIPT_MAP[command];
    if (!script) return;

    // Set flag for before_prompt_build to consume
    pendingBridgeCommand = true;
    // Also set suppression timer as safety net
    bridgeSuppressUntil = Date.now() + EXEC_TIMEOUT + 5_000;

    api.logger.debug?.(
      `[claude-bridge] message_received: command=${command}, pendingBridgeCommand=true`,
    );

    const arg = match[2].trim();

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

  // --- Hook 2: before_prompt_build (modifying) ---
  // Fires SECOND. Consumes the pendingBridgeCommand flag set by message_received.
  // No longer relies on extractLastUserText for prefix detection.
  api.on("before_prompt_build", async (event, ctx) => {
    const shouldSuppress = pendingBridgeCommand;

    api.logger.debug?.(
      `[claude-bridge] before_prompt_build: pendingBridgeCommand=${pendingBridgeCommand}, bridgeSuppressUntil=${bridgeSuppressUntil > Date.now()}`,
    );

    if (shouldSuppress) {
      pendingBridgeCommand = false;
      bridgeSuppressUntil = Date.now() + EXEC_TIMEOUT + 5_000;
      return { systemPrompt: SILENT_PROMPT, prependContext: SILENT_PROMPT };
    } else {
      // Clear suppression for non-bridge messages
      bridgeSuppressUntil = 0;
    }
  });

  // --- Hook 3: message_sending (modifying) ---
  // Replace LLM output with delivery confirmation while bridge suppression is active
  api.on("message_sending", async (_event, _ctx) => {
    const suppressing = Date.now() < bridgeSuppressUntil;
    api.logger.debug?.(
      `[claude-bridge] message_sending: suppressing=${suppressing}`,
    );

    if (suppressing) {
      return { content: DELIVERY_MSG, cancel: false };
    }
  });

  // --- Hook 4: before_tool_call (modifying) ---
  // Block ALL tool calls while bridge suppression is active
  api.on("before_tool_call", async (_event, _ctx) => {
    if (Date.now() < bridgeSuppressUntil) {
      api.logger.debug?.(
        `[claude-bridge] before_tool_call: BLOCKED (suppression active)`,
      );
      return { block: true, blockReason: "claude-bridge: message intercepted, tools disabled" };
    }
  });
}
