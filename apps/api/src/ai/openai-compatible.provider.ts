import type { ModelCompletion, ModelMessage, ModelProvider } from './model-provider.js';

/**
 * Minimal provider adapter for APIs exposing an OpenAI-compatible chat endpoint.
 * File contents must be filtered by the caller before entering this boundary.
 */
export class OpenAiCompatibleProvider implements ModelProvider {
  readonly name: string;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    providerName = 'openai-compatible',
  ) {
    this.name = providerName;
  }

  async complete(messages: ModelMessage[], signal?: AbortSignal): Promise<ModelCompletion> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: this.model, messages }),
      signal: signal ?? null,
    });
    if (!response.ok) throw new Error(`Model provider returned ${response.status}`);
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = payload.choices?.[0]?.message?.content;
    if (!text) throw new Error('Model provider returned no text');
    return {
      text,
      provider: this.name,
      model: this.model,
      ...(payload.usage?.prompt_tokens === undefined
        ? {}
        : { inputTokens: payload.usage.prompt_tokens }),
      ...(payload.usage?.completion_tokens === undefined
        ? {}
        : { outputTokens: payload.usage.completion_tokens }),
    };
  }
}
