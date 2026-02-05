import type { OpenClawConfig } from "../config/config.js";
import type { DispatchFromConfigResult } from "./reply/dispatch-from-config.js";
import type { FinalizedMsgContext, MsgContext } from "./templating.js";
import type { GetReplyOptions } from "./types.js";
import { dispatchReplyFromConfig } from "./reply/dispatch-from-config.js";
import { finalizeInboundContext } from "./reply/inbound-context.js";
import {
  createReplyDispatcher,
  createReplyDispatcherWithTyping,
  type ReplyDispatcher,
  type ReplyDispatcherOptions,
  type ReplyDispatcherWithTypingOptions,
} from "./reply/reply-dispatcher.js";
import {
  callPreClassifier,
  shouldSkipLLM,
  getSimpleResponse,
} from "./pre-classifier.js";

export type DispatchInboundResult = DispatchFromConfigResult;

export async function dispatchInboundMessage(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcher: ReplyDispatcher;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyResolver?: typeof import("./reply.js").getReplyFromConfig;
}): Promise<DispatchInboundResult> {
  const finalized = finalizeInboundContext(params.ctx);

  // === PRE-CLASSIFIER HOOK ===
  // Call local classifier before expensive LLM call
  const classifierResult = await callPreClassifier(finalized, params.cfg);
  
  if (classifierResult) {
    // STOP: Drop the message silently
    if (classifierResult.action === "STOP") {
      console.log(`[pre-classifier] STOP action - dropping message`);
      return {
        replied: false,
        skipped: true,
        skipReason: "pre-classifier-stop",
      } as DispatchFromConfigResult;
    }

    // SIMPLE: Send direct response without LLM
    if (classifierResult.action === "SIMPLE") {
      const response = getSimpleResponse(classifierResult);
      console.log(`[pre-classifier] SIMPLE action - sending: "${response}"`);
      await params.dispatcher.send(response);
      return {
        replied: true,
        skipped: false,
        preClassified: true,
      } as DispatchFromConfigResult;
    }

    // WAIT/APPEND: For now, treat as PROCESS (future: implement buffering)
    if (classifierResult.action === "WAIT" || classifierResult.action === "APPEND") {
      console.log(`[pre-classifier] ${classifierResult.action} action - proceeding to LLM (buffering not yet implemented)`);
    }

    // PROCESS: Continue to LLM (default path)
  }
  // === END PRE-CLASSIFIER HOOK ===

  return await dispatchReplyFromConfig({
    ctx: finalized,
    cfg: params.cfg,
    dispatcher: params.dispatcher,
    replyOptions: params.replyOptions,
    replyResolver: params.replyResolver,
  });
}

export async function dispatchInboundMessageWithBufferedDispatcher(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcherOptions: ReplyDispatcherWithTypingOptions;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyResolver?: typeof import("./reply.js").getReplyFromConfig;
}): Promise<DispatchInboundResult> {
  const { dispatcher, replyOptions, markDispatchIdle } = createReplyDispatcherWithTyping(
    params.dispatcherOptions,
  );

  const result = await dispatchInboundMessage({
    ctx: params.ctx,
    cfg: params.cfg,
    dispatcher,
    replyResolver: params.replyResolver,
    replyOptions: {
      ...params.replyOptions,
      ...replyOptions,
    },
  });

  markDispatchIdle();
  return result;
}

export async function dispatchInboundMessageWithDispatcher(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcherOptions: ReplyDispatcherOptions;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyResolver?: typeof import("./reply.js").getReplyFromConfig;
}): Promise<DispatchInboundResult> {
  const dispatcher = createReplyDispatcher(params.dispatcherOptions);
  const result = await dispatchInboundMessage({
    ctx: params.ctx,
    cfg: params.cfg,
    dispatcher,
    replyResolver: params.replyResolver,
    replyOptions: params.replyOptions,
  });
  await dispatcher.waitForIdle();
  return result;
}
