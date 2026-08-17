/**
 * TD-054: the {@link ChatModel} implementation, backed by Bedrock.
 *
 * Uses `AnthropicBedrockMantle` — the Messages-API Bedrock endpoint —
 * rather than the legacy `bedrock-runtime` `InvokeModel` path, so the
 * request body is the ordinary Messages shape and `tools` /
 * `output_config` need no translation.
 *
 * Electron-free: the region, model id and credentials arrive as
 * options. `main/ipc/chat.ts` resolves them from settings and TD-052's
 * `resolveCredentials()`.
 */

import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk'
import type { ContentBlock, Message, ToolUnion } from '@anthropic-ai/sdk/resources/messages/index'
import type { StoredAwsCredentials } from '../ipc/aws-creds-io'
import { isPlainObject } from '../lib/json'
import type { ChatModel, ModelRequest, ModelToolUse, ModelTurn } from './agent-loop'

/**
 * Adaptive thinking is on by default on Sonnet 5 and `max_tokens` caps
 * thinking *plus* response text, so a tool-heavy turn needs real
 * headroom or it truncates mid-answer.
 */
export const CHAT_MAX_TOKENS = 8192

/**
 * Sonnet 5 rejects `temperature`, `top_p`, `top_k` and
 * `thinking.budget_tokens` with a 400 — effort is the only steering
 * knob. Raise to `high` if answers come back shallow.
 */
export const CHAT_EFFORT = 'medium'

export interface BedrockModelOptions {
  region: string
  modelId: string
  /** Omitted → the SDK falls through to the default AWS provider chain. */
  credentials?: StoredAwsCredentials
}

function toModelToolUse(block: ContentBlock): ModelToolUse[] {
  if (block.type !== 'tool_use') return []
  return [{ id: block.id, name: block.name, input: isPlainObject(block.input) ? block.input : {} }]
}

export function toModelTurn(message: Message): ModelTurn {
  return {
    stopReason: message.stop_reason,
    content: message.content,
    text: message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .filter((chunk) => chunk.length > 0)
      .join('\n'),
    toolUses: message.content.flatMap(toModelToolUse)
  }
}

export function createBedrockModel({
  region,
  modelId,
  credentials
}: BedrockModelOptions): ChatModel {
  const client = new AnthropicBedrockMantle({
    awsRegion: region,
    ...(credentials !== undefined && {
      awsAccessKey: credentials.accessKeyId,
      awsSecretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken !== undefined && { awsSessionToken: credentials.sessionToken })
    })
  })

  return {
    async send(request: ModelRequest, signal?: AbortSignal): Promise<ModelTurn> {
      const stream = client.messages.stream(
        {
          model: modelId,
          max_tokens: CHAT_MAX_TOKENS,
          output_config: { effort: CHAT_EFFORT },
          system: request.system,
          // halo-mcp authors these schemas at runtime, so there is
          // nothing here for the compiler to check against the SDK's
          // narrower `Tool.InputSchema` — a malformed one is caught by
          // Bedrock's 400, not by TypeScript.
          tools: request.tools as unknown as ToolUnion[],
          messages: [...request.messages]
        },
        // `.stream()` rather than `.create()`: a multi-tool turn can sit
        // well past the SDK's non-streaming HTTP timeout.
        { signal }
      )
      return toModelTurn(await stream.finalMessage())
    }
  }
}
