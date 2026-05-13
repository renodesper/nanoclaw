# Custom Anthropic-Compatible Endpoint

NanoClaw supports routing agent API calls to a custom Anthropic-compatible endpoint
(e.g. GrowthCircle, corporate proxy, local LLM gateway) instead of `api.anthropic.com`.

## How it works

```
Agent container
  → ANTHROPIC_AUTH_TOKEN=placeholder  →  Authorization: Bearer placeholder
  → ANTHROPIC_BASE_URL=<endpoint>
        ↓
OneCLI proxy (host.docker.internal:10255)
  → matches hostPattern + pathPattern on secret
  → replaces Authorization: Bearer placeholder  →  Bearer <real-key>
        ↓
Custom endpoint  ←  receives valid auth
```

The container never holds the real API key. OneCLI injects it per-request based
on the secret's host + path pattern.

## Configuration

### 1. Add the secret in OneCLI

```bash
onecli secrets create \
  --name "MyEndpoint" \
  --type openai \
  --host-pattern "my-endpoint.com" \
  --path-pattern "/anthropic/v1/*" \
  --value "sk-my-real-api-key"
```

`--path-pattern` must match the full path that the Anthropic SDK calls.
With `ANTHROPIC_BASE_URL=https://my-endpoint.com/anthropic`, the SDK calls
`/anthropic/v1/messages` — so the pattern is `/anthropic/v1/*`.

### 2. Set ANTHROPIC_BASE_URL in .env

```
ANTHROPIC_BASE_URL=https://my-endpoint.com/anthropic
```

The SDK appends `/v1/messages` to this value. The `/anthropic` suffix routes to the
endpoint's Anthropic-compatible layer (as opposed to its OpenAI-compatible `/v1/` layer).

### 3. Grant all agents access to the secret

```bash
# List agents to get their IDs
onecli agents list

# Set each agent to inject all matching secrets
onecli agents set-secret-mode --id <agent-id> --mode all
```

### 4. Verify

After restarting the host, check the env inside a running container:

```bash
docker exec $(docker ps --format "{{.Names}}" | grep nanoclaw | head -1) env | grep ANTHROPIC
# Expected:
# ANTHROPIC_BASE_URL=https://my-endpoint.com/anthropic
# ANTHROPIC_AUTH_TOKEN=placeholder
```

Test that the endpoint receives real credentials (not the placeholder):

```bash
docker exec $(docker ps --format "{{.Names}}" | grep nanoclaw | head -1) \
  curl -s "https://my-endpoint.com/anthropic/v1/messages" \
  -H "Authorization: Bearer placeholder" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-sonnet-4-6","max_tokens":5,"messages":[{"role":"user","content":"hi"}]}'
```

If OneCLI injection is working, the endpoint will respond with a real API response —
not a 401 or `credential_not_found` error.

## Changing the model

Models are configured per agent group in the `container_configs` table.

### Change model for one agent group

```bash
ncl groups config update --id <group-id> --model <model-name>
ncl groups restart --id <group-id>
```

### Change model for all agent groups

```bash
for id in $(pnpm exec tsx scripts/q.ts data/v2.db "SELECT id FROM agent_groups"); do
  ncl groups config update --id "$id" --model <model-name>
done
# Restart all containers by restarting the host
launchctl kickstart -k gui/$(id -u)/com.nanoclaw   # macOS
# systemctl --user restart nanoclaw                 # Linux
```

### List available models on the custom endpoint

```bash
docker exec $(docker ps --format "{{.Names}}" | grep nanoclaw | head -1) \
  curl -s "https://my-endpoint.com/v1/models" \
  -H "Authorization: Bearer placeholder" | python3 -m json.tool | grep '"id"'
```

### Supported model names

The Claude Code CLI only accepts model names it recognises — typically `claude-*` models.
GPT-style names (`gpt-4o`, `gpt-5.4`, etc.) will be rejected at the CLI level even if
the endpoint supports them.

| Model | Notes |
|-------|-------|
| `claude-opus-4-7` | Most capable |
| `claude-sonnet-4-6` | Balanced speed / quality |
| `claude-haiku-4-5-20251001` | Fastest |

### Verify active model

```bash
pnpm exec tsx scripts/q.ts data/v2.db \
  "SELECT ag.name, cc.model FROM agent_groups ag JOIN container_configs cc ON ag.id = cc.agent_group_id ORDER BY ag.name"
```

## Switching endpoints

To switch to a different endpoint:

1. Update `ANTHROPIC_BASE_URL` in `.env`
2. Ensure an OneCLI secret exists for the new host + path pattern
3. Restart the host — all new containers pick up the new URL automatically

Running containers are unaffected until they next restart. Active containers can be
killed immediately with `ncl groups restart --id <group-id>`.

## Reverting to api.anthropic.com

Remove `ANTHROPIC_BASE_URL` from `.env` and restart the host. Containers will fall back
to the Anthropic SDK default (`api.anthropic.com`) using the existing Anthropic secret
in OneCLI.
