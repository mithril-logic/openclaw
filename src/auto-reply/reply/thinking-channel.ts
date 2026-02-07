/**
 * Auto-post thinking blocks to a configured channel after agent runs.
 */
import fs from "node:fs/promises";
import { getChannelDock } from "../../channels/dock.js";
import { logVerbose } from "../../globals.js";
import { extractThinkingFromMessage } from "../../tui/tui-formatters.js";

export type ThinkingChannelConfig = {
  provider: string;
  channelId: string;
  accountId?: string;
};

/**
 * Read the session transcript and extract the last assistant message's thinking blocks.
 */
async function extractLastThinking(transcriptPath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(transcriptPath, "utf-8");
    const lines = content.trim().split("\n");

    // Find the last assistant message (reading backwards)
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const entry = JSON.parse(line);
        if (entry.role === "assistant") {
          const thinking = extractThinkingFromMessage(entry);
          return thinking || null;
        }
      } catch {
        // Skip malformed lines
        continue;
      }
    }
    return null;
  } catch (err) {
    logVerbose?.(`thinking-channel: failed to read transcript: ${err}`);
    return null;
  }
}

/**
 * Post thinking content to the configured channel.
 */
async function postThinkingToChannel(
  config: ThinkingChannelConfig,
  thinking: string,
  sessionKey?: string,
): Promise<void> {
  const dock = getChannelDock(config.provider);
  if (!dock?.outbound?.send) {
    logVerbose?.(`thinking-channel: no outbound send for provider ${config.provider}`);
    return;
  }

  const truncated = thinking.length > 4000 ? thinking.slice(0, 4000) + "\n\n[truncated]" : thinking;

  const message = `🧠 **Thinking** (${sessionKey ?? "unknown session"}):\n\`\`\`\n${truncated}\n\`\`\``;

  try {
    await dock.outbound.send({
      to: config.channelId,
      accountId: config.accountId,
      message,
    });
    logVerbose?.(
      `thinking-channel: posted ${thinking.length} chars to ${config.provider}/${config.channelId}`,
    );
  } catch (err) {
    logVerbose?.(`thinking-channel: failed to post: ${err}`);
  }
}

/**
 * Main entry point: extract thinking from transcript and post to channel.
 */
export async function maybePostThinkingToChannel(params: {
  config?: ThinkingChannelConfig;
  transcriptPath?: string;
  sessionKey?: string;
}): Promise<void> {
  const { config, transcriptPath, sessionKey } = params;

  if (!config || !transcriptPath) {
    return;
  }

  const thinking = await extractLastThinking(transcriptPath);
  if (!thinking) {
    return;
  }

  await postThinkingToChannel(config, thinking, sessionKey);
}
