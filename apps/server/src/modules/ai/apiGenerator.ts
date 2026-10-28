import type { Config } from '../../config';
import type { ApiDefinition, ValidationIssue } from '../../types';
import { HttpError } from '../../utils/errors';
import { extractJson } from '../../utils/json';
import { validateDefinition } from '../validation/definitionValidator';
import { AiProviderError, type AiProvider } from './aiClient';
import { buildRepairPrompt, buildUserPrompt, SYSTEM_PROMPT } from './prompts';

export interface GenerationResult {
  definition: ApiDefinition;
  provider: string;
  attempts: number;
}

type Limits = Pick<Config, 'maxEndpoints' | 'maxResources' | 'maxSeedCount'>;

/** Fill in omitted top-level defaults only; everything else must be correct as generated. */
function normalize(raw: unknown, name: string | undefined): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const o = { ...(raw as Record<string, unknown>) };
  o.name ??= name ?? 'Generated API';
  o.version ??= '1.0.0';
  o.apiType ??= 'REST';
  o.basePath ??= '/api';
  return o;
}

/** Turns natural language into a *validated* definition. AI output is untrusted until it passes validation. */
export class ApiGenerator {
  constructor(
    private readonly provider: AiProvider,
    private readonly limits: Limits,
    private readonly maxAttempts = 2
  ) {}

  private async ask(system: string, user: string): Promise<string> {
    try {
      return await this.provider.generate({ system, user });
    } catch (err) {
      if (err instanceof AiProviderError)
        throw new HttpError(err.kind === 'timeout' ? 504 : 502, err.kind === 'timeout' ? 'AI_TIMEOUT' : 'AI_PROVIDER_ERROR', err.message);
      throw new HttpError(502, 'AI_PROVIDER_ERROR', 'The AI provider failed.');
    }
  }

  async generate(input: { name?: string; description: string }): Promise<GenerationResult> {
    let user = buildUserPrompt(input.name, input.description);
    let issues: ValidationIssue[] = [];
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const text = await this.ask(SYSTEM_PROMPT, user);
      let parsed: unknown;
      try {
        parsed = normalize(extractJson(text), input.name);
      } catch {
        issues = [{ field: '(root)', message: 'The model output was not valid JSON.' }];
        user = buildRepairPrompt(text, issues);
        continue;
      }
      const result = validateDefinition(parsed, this.limits);
      if (result.valid) return { definition: parsed as ApiDefinition, provider: this.provider.name, attempts: attempt };
      issues = result.issues;
      user = buildRepairPrompt(text, issues);
    }
    throw new HttpError(422, 'AI_OUTPUT_INVALID', 'The AI output could not be turned into a valid API definition.', issues.slice(0, 20));
  }
}
