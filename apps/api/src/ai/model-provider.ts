export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelCompletion {
  text: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ModelProvider {
  readonly name: string;
  complete(messages: ModelMessage[], signal?: AbortSignal): Promise<ModelCompletion>;
}

export const MODEL_PROVIDER = Symbol('MODEL_PROVIDER');
