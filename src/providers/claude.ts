/**
 * Claude provider container config — only registered when the user has
 * configured a custom Anthropic-compatible endpoint via setup. Setup
 * appends `import './claude.js'` to providers/index.ts at that point;
 * standard installs hitting api.anthropic.com don't need this file
 * loaded.
 *
 * Auth token: two modes depending on what's in .env:
 *   - ANTHROPIC_AUTH_TOKEN set: forwarded directly into the container.
 *     Simpler setup; the real key is visible in the container environment.
 *   - ANTHROPIC_AUTH_TOKEN absent: container gets "placeholder" and
 *     OneCLI rewrites the Authorization header on the wire. The real key
 *     never enters the container (preferred for security).
 */
import { readEnvFile } from '../env.js';
import { registerProviderContainerConfig } from './provider-container-registry.js';

registerProviderContainerConfig('claude', () => {
  const dotenv = readEnvFile([
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
  ]);
  const env: Record<string, string> = {};
  if (dotenv.ANTHROPIC_BASE_URL) {
    env.ANTHROPIC_BASE_URL = dotenv.ANTHROPIC_BASE_URL;
    env.ANTHROPIC_AUTH_TOKEN = dotenv.ANTHROPIC_AUTH_TOKEN || 'placeholder';
  }
  for (const key of [
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
  ] as const) {
    if (dotenv[key]) env[key] = dotenv[key];
  }
  return { env };
});
