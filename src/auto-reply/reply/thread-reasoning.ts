/**
 * Auto-post thinking blocks as a thread reply to the user's trigger message.
 *
 * "Thread Reasoning" (formerly "Thinking Channel") — the Bicameral Mind.
 */
import fs from "node:fs/promises";
import { logVerbose } from "../../globals.js";
import { extractThinkingFromMessage } from "../../tui/tui-formatters.js";

export type ReasoningConfig = {
  enabled: boolean;
  mode: "thread";
  provider: string;
  accountId?: string;
};

/**
 * Read the session transcript and extract the last assistant message's thinking blocks.
 */
async function extractLastThinking(transcriptPath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(transcriptPath, "utf-8");
    const lines = content.trim().split("\n");

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) {
        continue;
      }

      try {
        const entry = JSON.parse(line);
        if (entry.role === "assistant") {
          const thinking = extractThinkingFromMessage(entry);
          return thinking || null;
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch (err) {
    logVerbose?.(`thread-reasoning: failed to read transcript: ${err}`);
    return null;
  }
}

/**
 * Post thinking content as a thread reply to the trigger message.
 */
async function postThinkingMessage(params: {
  config: ReasoningConfig;
  thinking: string;
  threadContext: { channelId: string; messageId: string };
}): Promise<void> {
  const { config, thinking, threadContext } = params;

  const truncated = thinking.length > 4000 ? thinking.slice(0, 4000) + "\n\n[truncated]" : thinking;
  const message = `🧠 **Thinking:**\n\`\`\`\n${truncated}\n\`\`\``;

  try {
    if (config.provider === "mattermost") {
      const mod = await import(
        /* webpackIgnore: true */ `${"../../../extensions/mattermost/src/mattermost/send.js"}`
      );
      await mod.sendMessageMattermost(threadContext.channelId, message, {
        accountId: config.accountId,
        replyToId: threadContext.messageId,
      });
    } else {
      // For non-Mattermost providers, fall back to generic send with reply semantics.
      const { sendMessage } = await import("../../infra/outbound/message.js");
      await sendMessage({
        to: threadContext.channelId,
        content: message,
        channel: config.provider,
        accountId: config.accountId ?? undefined,
      });
    }

    logVerbose?.(
      `thread-reasoning: posted ${thinking.length} chars as thread reply to ${threadContext.messageId}`,
    );
  } catch (err) {
    logVerbose?.(`thread-reasoning: failed to post: ${err}`);
  }
}

/**
 * Main entry point: extract thinking from transcript and post as thread reply.
 */
export async function maybePostThinkingToThread(params: {
  config?: ReasoningConfig;
  transcriptPath?: string;
  sessionKey?: string;
  threadContext?: { channelId: string; messageId: string };
}): Promise<void> {
  const { config, transcriptPath, threadContext } = params;

  if (!config?.enabled || !transcriptPath || !threadContext?.messageId) {
    return;
  }

  const thinking = await extractLastThinking(transcriptPath);
  if (!thinking) {
    return;
  }

  await postThinkingMessage({ config, thinking, threadContext });
}
