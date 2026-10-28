import type { Config } from '../../config';
import { RuleBasedProvider } from './ruleBasedProvider';

export interface AiRequest {
  system: string;
  user: string;
}

/** Replaceable AI backend. Implementations must return the raw model text. */
export interface AiProvider {
  readonly name: string;
  generate(req: AiRequest): Promise<string>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: 'timeout' | 'http' | 'empty' | 'network'
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

/** Calls the Anthropic Messages API from the backend only; the key never reaches the browser. */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  constructor(private readonly opts: AnthropicOptions) {}

  async generate({ system, user }: AiRequest): Promise<string> {
    const f = this.opts.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    try {
      const res = await f(`${this.opts.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': this.opts.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: this.opts.model, max_tokens: 8000, system, messages: [{ role: 'user', content: user }] }),
        signal: controller.signal
      });
      if (!res.ok) throw new AiProviderError(`AI provider responded with HTTP ${res.status}.`, 'http');
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
      if (!text.trim()) throw new AiProviderError('AI provider returned an empty response.', 'empty');
      return text;
    } catch (err) {
      if (err instanceof AiProviderError) throw err;
      if (err instanceof Error && err.name === 'AbortError') throw new AiProviderError('AI provider timed out.', 'timeout');
      throw new AiProviderError('Could not reach the AI provider.', 'network');
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createAiProvider(config: Pick<Config, 'aiProvider' | 'anthropicApiKey' | 'anthropicModel' | 'aiTimeoutMs'>): AiProvider {
  const wantAnthropic = config.aiProvider === 'anthropic' || (config.aiProvider === 'auto' && !!config.anthropicApiKey);
  if (wantAnthropic) {
    if (!config.anthropicApiKey) throw new Error('AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY.');
    return new AnthropicProvider({ apiKey: config.anthropicApiKey, model: config.anthropicModel, timeoutMs: config.aiTimeoutMs });
  }
  return new RuleBasedProvider();
}
