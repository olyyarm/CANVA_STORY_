# ComfyUI GeminiNodeV2 DynamicCombo

## Symptom

ComfyUI accepts the workflow, but execution fails immediately:

```text
GeminiNodeV2.execute() missing 1 required positional argument: 'model'
```

Sometimes validation complains about missing Gemini fields:

```text
Required input is missing (temperature)
Required input is missing (top_p)
Required input is missing (thinking_level)
Required input is missing (max_output_tokens)
```

Another related failure means the workflow shape is valid, but Comfy.org
credentials were not passed into the API run:

```text
GeminiNodeV2: Unauthorized: Please login first to use this node.
```

## Cause

`GeminiNodeV2` is a Comfy API node with a `COMFY_DYNAMICCOMBO_V3` input named `model`.

The Python node receives `model` as a dictionary:

```python
async def execute(cls, prompt: str, model: dict, seed: int, system_prompt: str = "")
```

But in the API workflow JSON we must not send that dictionary directly, and we must not send nested options as flat top-level keys.

Comfy builds the final `model` dictionary from the selected combo value plus dotted fields.

The selected combo value must also be one of the real Gemini options exposed by
the node. If the app sends an old text model name such as `mistral-small-latest`
or an LM Studio model id, Comfy silently ignores the dynamic combo selection,
drops the whole `model.*` group, and execution fails with the same missing
`model` Python argument.

## Correct Shape

Use this exact pattern:

```ts
inputs: {
  prompt,
  model: 'Gemini 3.5 Flash',
  'model.thinking_level': 'MEDIUM',
  'model.temperature': 1,
  'model.top_p': 0.95,
  'model.max_output_tokens': 32768,
  seed,
  system_prompt,
}
```

This is the same shape used by the working `GeminiNanoBanana2V2` workflow.

Allowed text models for this node:

```text
Gemini 3.5 Flash
Gemini 3.1 Pro
Gemini 3.1 Flash-Lite
```

When `generationSettings.mode === 'comfygemini'`, sanitize `request.model`
against this list before building the workflow. If it is not in the list, fall
back to `settings.comfyGeminiModel`, then `Gemini 3.5 Flash`.

## Wrong Shapes

Do not send model options flat:

```ts
inputs: {
  model: 'Gemini 3.5 Flash',
  thinking_level: 'MEDIUM',
  temperature: 1,
  top_p: 0.95,
  max_output_tokens: 32768,
}
```

Do not try to send a handmade nested object unless Comfy changes its API:

```ts
inputs: {
  model: {
    model: 'Gemini 3.5 Flash',
    thinking_level: 'MEDIUM',
  },
}
```

## Regression Check

Run:

```bash
npm run check:comfy-gemini
```

This check does not contact ComfyUI and does not spend credits. It only verifies that `src/api.ts` still builds `GeminiNodeV2` with the dotted DynamicCombo fields.

## Authorization Check

`GeminiNodeV2` is an API node. Browser login in the ComfyUI tab is not enough
for a workflow queued by Canva Story, because the Canva Story request is sent
through `/prompt` and must include the Comfy.org key in payload `extra_data`.

The payload must include:

```json
{
  "extra_data": {
    "api_key_comfy_org": "comfyui-..."
  }
}
```

In Canva Story this value is stored in localStorage and mirrored between:

```text
Generation settings -> Gemini · ComfyUI -> Comfy.org API key
Image settings -> ComfyUI -> Comfy.org API key
```

If one field is filled, the other should be updated too. If text generation
still returns `Unauthorized`, paste a fresh key from `https://platform.comfy.org/profile/api-keys`
and retry. Do not change the Gemini workflow shape while fixing auth.

## Local Source Of Truth

Installed ComfyUI files that explain this behavior:

```text
D:\ComfyUI-Omnivorous-T2.6-P312-Cu126\ComfyUI\comfy_api_nodes\nodes_gemini.py
D:\ComfyUI-Omnivorous-T2.6-P312-Cu126\ComfyUI\comfy_api\latest\_io.py
```
