/**
 * Pre-dispatch classifier hook.
 * 
 * Intercepts messages before they reach the LLM, allowing cheap local
 * classification to filter simple messages and save API costs.
 * 
 * Configuration:
 *   preClassifier: {
 *     enabled: true,
 *     url: "http://localhost:8000/gatekeeper"
 *   }
 */

import type { OpenClawConfig } from "../config/config.js";
import type { FinalizedMsgContext } from "./templating.js";

export type PreClassifierAction = "PROCESS" | "STOP" | "SIMPLE" | "WAIT" | "APPEND";

export type PreClassifierResult = {
  action: PreClassifierAction;
  text?: string;  // Response text for SIMPLE action
  reason?: string;
  confidence?: number;
};

export type PreClassifierConfig = {
  enabled: boolean;
  url: string;
  timeoutMs?: number;
};

/**
 * Get pre-classifier config from OpenClaw config.
 */
export function getPreClassifierConfig(cfg: OpenClawConfig): PreClassifierConfig | undefined {
  const preClassifier = (cfg as unknown as { preClassifier?: PreClassifierConfig }).preClassifier;
  if (!preClassifier?.enabled || !preClassifier?.url) {
    return undefined;
  }
  return preClassifier;
}

/**
 * Call the pre-classifier hook.
 * Returns undefined if hook is not configured or fails (fallback to normal processing).
 */
export async function callPreClassifier(
  ctx: FinalizedMsgContext,
  cfg: OpenClawConfig,
): Promise<PreClassifierResult | undefined> {
  const config = getPreClassifierConfig(cfg);
  if (!config) {
    return undefined;
  }

  const timeoutMs = config.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: ctx.rawBody,
        sender: ctx.senderId,
        channel: ctx.channel,
        sessionKey: ctx.sessionKey,
        timestamp: Date.now(),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[pre-classifier] Hook returned ${response.status}, falling back to PROCESS`);
      return undefined;
    }

    const result = await response.json() as PreClassifierResult;
    
    // Validate action
    const validActions: PreClassifierAction[] = ["PROCESS", "STOP", "SIMPLE", "WAIT", "APPEND"];
    if (!validActions.includes(result.action)) {
      console.warn(`[pre-classifier] Invalid action "${result.action}", falling back to PROCESS`);
      return undefined;
    }

    return result;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      console.warn(`[pre-classifier] Hook timed out after ${timeoutMs}ms, falling back to PROCESS`);
    } else {
      console.warn(`[pre-classifier] Hook failed: ${error}, falling back to PROCESS`);
    }
    return undefined;
  }
}

/**
 * Check if a pre-classifier result should skip the LLM.
 */
export function shouldSkipLLM(result: PreClassifierResult | undefined): boolean {
  if (!result) return false;
  return result.action === "STOP" || result.action === "SIMPLE";
}

/**
 * Get the direct response for a SIMPLE action.
 */
export function getSimpleResponse(result: PreClassifierResult): string {
  return result.text ?? "👍";
}
