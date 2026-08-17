import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8');
const geminiNodeMatch = source.match(/class_type: 'GeminiNodeV2'[\s\S]*?class_type: 'SaveText'/);

if (!geminiNodeMatch) {
  console.error('GeminiNodeV2 workflow block was not found in src/api.ts.');
  process.exit(1);
}

const geminiNodeBlock = geminiNodeMatch[0];
const requiredFields = [
  'model',
  "'model.thinking_level'",
  "'model.temperature'",
  "'model.top_p'",
  "'model.max_output_tokens'",
];

const missingFields = requiredFields.filter((field) => !geminiNodeBlock.includes(field));
if (missingFields.length > 0) {
  console.error(`GeminiNodeV2 workflow is missing DynamicCombo fields: ${missingFields.join(', ')}`);
  process.exit(1);
}

const flatModelOptionPattern = /^\s*(thinking_level|temperature|top_p|max_output_tokens):/m;
if (flatModelOptionPattern.test(geminiNodeBlock)) {
  console.error('GeminiNodeV2 workflow has flat model option fields. Use model.* dotted keys instead.');
  process.exit(1);
}

if (/inputShapes|flatGeminiInputs|nestedGeminiInputs/.test(source)) {
  console.error('GeminiNodeV2 workflow should not retry old flat/nested input shapes.');
  process.exit(1);
}

if (!source.includes('resolveComfyGeminiModel(request.model, settings.comfyGeminiModel)')) {
  console.error('GeminiNodeV2 workflow must sanitize request.model through resolveComfyGeminiModel.');
  process.exit(1);
}

if (!source.includes('COMFY_GEMINI_MODELS.includes')) {
  console.error('GeminiNodeV2 workflow must validate model names against COMFY_GEMINI_MODELS.');
  process.exit(1);
}

if (!source.includes('extra_data') || !source.includes('api_key_comfy_org')) {
  console.error('Comfy Gemini workflow must pass Comfy.org API keys through extra_data.api_key_comfy_org.');
  process.exit(1);
}

if (!source.includes('getComfyGeminiAuthMessage')) {
  console.error('Comfy Gemini auth failures must use the dedicated actionable error message.');
  process.exit(1);
}

console.log('Comfy Gemini workflow shape looks OK.');
