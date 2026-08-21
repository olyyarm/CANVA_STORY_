import { createMockCompletion } from './mockData';
import { COMFY_GEMINI_MODELS } from './constants';
import { getOmniVoiceSteps, OMNIVOICE_DEFAULT_VOICE_INSTRUCT } from './narrationSettings';
import { ChatApiResponse, GenerationRequest, ImagePipeline, ImagePromptKind, NarrationSettings } from './types';

const MISTRAL_ENDPOINT = 'https://api.mistral.ai/v1/chat/completions';
export const LM_STUDIO_DEFAULT_ENDPOINT = 'http://localhost:1234/v1/chat/completions';
export const LM_STUDIO_DEFAULT_MODEL = 'local-model';
export const LM_STUDIO_DEFAULT_DRAFT_CONTEXT_LENGTH = 4096;
export const LM_STUDIO_DEFAULT_LARGE_CONTEXT_LENGTH = 50000;
export const COMFYUI_DEFAULT_ENDPOINT = 'http://localhost:8188';
export const COMFYUI_DEFAULT_CHECKPOINT = 'SDXL\\sd_xl_base_1.0.safetensors';
export const COMFY_GEMINI_DEFAULT_MODEL = 'Gemini 3.5 Flash';
export const COMFY_GEMINI_DEFAULT_THINKING_LEVEL = 'MEDIUM';
export const COMFY_GEMINI_DEFAULT_MAX_OUTPUT_TOKENS = 32768;
const FLUX2_DIFFUSION_MODEL = 'flux2_dev_fp8mixed.safetensors';
const FLUX2_TEXT_ENCODER = 'mistral_3_small_flux2_fp8.safetensors';
const FLUX2_VAE = 'flux2-vae.safetensors';
const FLUX2_TURBO_LORA = 'Flux_2-Turbo-LoRA_comfyui.safetensors';
const Z_IMAGE_TURBO_DIFFUSION_MODEL = 'z_image_turbo_bf16.safetensors';
const Z_IMAGE_TEXT_ENCODER = 'qwen_3_4b.safetensors';
const Z_IMAGE_VAE = 'ae.safetensors';
const ERNIE_IMAGE_TURBO_DIFFUSION_MODEL = 'ernie-image-turbo.safetensors';
const ERNIE_IMAGE_TEXT_ENCODER = 'ministral-3-3b.safetensors';
const ERNIE_IMAGE_VAE = 'flux2-vae.safetensors';
const COMFY_SDXL_TIMEOUT_MS = 4 * 60 * 1000;
const COMFY_Z_IMAGE_TIMEOUT_MS = 45 * 60 * 1000;
const COMFY_ERNIE_IMAGE_TIMEOUT_MS = 45 * 60 * 1000;
const COMFY_FLUX2_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const COMFY_NANO_BANANA_TIMEOUT_MS = 45 * 60 * 1000;
const COMFY_PARTNER_IMAGE_TIMEOUT_MS = 2 * 60 * 1000;
const COMFY_TTS_TIMEOUT_MS = 45 * 60 * 1000;
const COMFY_GEMINI_TEXT_TIMEOUT_MS = 45 * 60 * 1000;
const WIDE_FRAME_WIDTH = 1344;
const WIDE_FRAME_HEIGHT = 768;

export type GenerationMode = 'mock' | 'mistral' | 'lmstudio' | 'comfygemini';
export type ImageProvider = 'pollinations' | 'comfyui';

export interface GenerationSettings {
  mode: GenerationMode;
  lmStudioEndpoint: string;
  lmStudioModel: string;
  lmStudioDraftContextLength: number;
  lmStudioLargeContextLength: number;
  comfyGeminiEndpoint: string;
  comfyGeminiModel: string;
  comfyGeminiThinkingLevel: string;
  comfyGeminiMaxOutputTokens: number;
  comfyGeminiApiKey: string;
}

export interface ImageGenerationSettings {
  provider: ImageProvider;
  comfyEndpoint: string;
  comfyCheckpoint: string;
  comfyOrgApiKey: string;
}

export interface Flux2CharacterReference {
  imageUrl: string;
  label: string;
}

export const getDefaultGenerationMode = (): GenerationMode => {
  const apiKey = import.meta.env.VITE_MISTRAL_API_KEY?.trim();
  const forceMock = String(import.meta.env.VITE_MOCK_MODE).toLowerCase() === 'true';
  return apiKey && !forceMock ? 'mistral' : 'mock';
};

export const getDefaultGenerationSettings = (): GenerationSettings => ({
  mode: getDefaultGenerationMode(),
  lmStudioEndpoint: LM_STUDIO_DEFAULT_ENDPOINT,
  lmStudioModel: LM_STUDIO_DEFAULT_MODEL,
  lmStudioDraftContextLength: LM_STUDIO_DEFAULT_DRAFT_CONTEXT_LENGTH,
  lmStudioLargeContextLength: LM_STUDIO_DEFAULT_LARGE_CONTEXT_LENGTH,
  comfyGeminiEndpoint: COMFYUI_DEFAULT_ENDPOINT,
  comfyGeminiModel: COMFY_GEMINI_DEFAULT_MODEL,
  comfyGeminiThinkingLevel: COMFY_GEMINI_DEFAULT_THINKING_LEVEL,
  comfyGeminiMaxOutputTokens: COMFY_GEMINI_DEFAULT_MAX_OUTPUT_TOKENS,
  comfyGeminiApiKey: import.meta.env.VITE_COMFY_ORG_API_KEY?.trim() ?? '',
});

export const getDefaultImageGenerationSettings = (): ImageGenerationSettings => ({
  provider: 'pollinations',
  comfyEndpoint: COMFYUI_DEFAULT_ENDPOINT,
  comfyCheckpoint: COMFYUI_DEFAULT_CHECKPOINT,
  comfyOrgApiKey: import.meta.env.VITE_COMFY_ORG_API_KEY?.trim() ?? '',
});

const getErrorMessage = (value: unknown) => {
  if (!value || typeof value !== 'object') return '';
  const data = value as Record<string, unknown>;
  const detail = data.detail;
  const error = data.error;

  if (typeof data.message === 'string') return data.message;
  if (typeof detail === 'string') return detail;
  if (typeof error === 'string') return error;
  if (detail && typeof detail === 'object' && typeof (detail as Record<string, unknown>).message === 'string') {
    return (detail as Record<string, unknown>).message as string;
  }
  if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') {
    return (error as Record<string, unknown>).message as string;
  }
  return '';
};

const normalizeContent = (content: ChatApiResponse['choices'][number]['message']['content']) => {
  if (typeof content === 'string') return content.trim();
  return content.map((chunk) => chunk.text ?? '').join('').trim();
};

const getTextGenerationParameters = (request: GenerationRequest) => {
  if (request.operation === 'chapter_topic') {
    return {
      temperature: 1.35,
      top_p: 0.98,
      presence_penalty: 0.35,
      frequency_penalty: 0.15,
    };
  }

  return {
    temperature: 0.7,
    top_p: 0.9,
  };
};

const getLmStudioEndpoint = (value: string) => {
  const endpoint = value.trim() || LM_STUDIO_DEFAULT_ENDPOINT;
  const normalized = endpoint.replace(/\/+$/, '');
  if (normalized.endsWith('/chat/completions')) return normalized;
  if (normalized.endsWith('/v1')) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
};

const getLmStudioBaseUrl = (value: string) => {
  const endpoint = value.trim() || LM_STUDIO_DEFAULT_ENDPOINT;
  const normalized = endpoint.replace(/\/+$/, '');
  if (normalized.endsWith('/v1/chat/completions')) return normalized.slice(0, -'/v1/chat/completions'.length);
  if (normalized.endsWith('/v1')) return normalized.slice(0, -'/v1'.length);
  if (normalized.endsWith('/api/v1')) return normalized.slice(0, -'/api/v1'.length);
  return normalized;
};

const isComfyGeminiModel = (value: string): value is (typeof COMFY_GEMINI_MODELS)[number] =>
  COMFY_GEMINI_MODELS.includes(value as (typeof COMFY_GEMINI_MODELS)[number]);

const resolveComfyGeminiModel = (requestModel: string | undefined, settingsModel: string) => {
  const candidates = [
    requestModel?.trim(),
    settingsModel.trim(),
    COMFY_GEMINI_DEFAULT_MODEL,
  ];

  return candidates.find((candidate): candidate is (typeof COMFY_GEMINI_MODELS)[number] =>
    Boolean(candidate && isComfyGeminiModel(candidate))) ?? COMFY_GEMINI_DEFAULT_MODEL;
};

const callMistralAPI = async (request: GenerationRequest, signal?: AbortSignal): Promise<string> => {
  const apiKey = import.meta.env.VITE_MISTRAL_API_KEY?.trim();
  if (!apiKey) throw new Error('Ключ Mistral не настроен. Включён тестовый режим.');

  const response = await fetch(MISTRAL_ENDPOINT, {
    method: 'POST',
    signal,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.prompt },
      ],
      ...getTextGenerationParameters(request),
    }),
  });

  if (!response.ok) {
    let details = response.statusText;
    try {
      const payload: unknown = await response.json();
      details = getErrorMessage(payload) || details;
    } catch {
      // A non-JSON response still has a useful HTTP status.
    }
    throw new Error(`Mistral вернул ошибку ${response.status}${details ? `: ${details}` : ''}`);
  }

  const data: ChatApiResponse = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Mistral вернул пустой ответ. Попробуйте ещё раз.');

  const normalized = normalizeContent(content);
  if (!normalized) throw new Error('Mistral вернул ответ без текста.');
  return normalized;
};

const callLmStudioAPI = async (
  request: GenerationRequest,
  settings: GenerationSettings,
  signal?: AbortSignal,
): Promise<string> => {
  const model = resolveLmStudioModel(settings.lmStudioModel, request);
  await ensureLmStudioModelContext(model, settings, request, signal);
  const generationParameters = getTextGenerationParameters(request);
  const response = await fetch(getLmStudioEndpoint(settings.lmStudioEndpoint), {
    method: 'POST',
    signal,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.prompt },
      ],
      ...generationParameters,
      stream: false,
    }),
  });

  if (!response.ok) {
    let details = response.statusText;
    try {
      const payload: unknown = await response.json();
      details = getErrorMessage(payload) || JSON.stringify(payload);
    } catch {
      try {
        details = await response.text();
      } catch {
        // LM Studio can also return an empty plain text error.
      }
    }
    throw new Error(`LM Studio вернул ошибку ${response.status}${details ? `: ${details}` : ''}`);
  }

  const data: ChatApiResponse = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('LM Studio вернул пустой ответ. Проверьте локальную модель и endpoint.');

  const normalized = normalizeContent(content);
  if (!normalized) throw new Error('LM Studio вернул ответ без текста.');
  return normalized;
};

const operationRoleAliases: Record<string, string[]> = {
  scenario: ['scenario', 'writer', 'draft', 'chapter'],
  editor: ['editor', 'edit', 'revision', 'narration_edit', 'story_structure_edit', 'brief_revision'],
  narration: ['narration', 'voice', 'tts', 'tts_cleanup'],
  memory: ['memory', 'summary', 'chapter_summary', 'season_memory', 'chapter_facts', 'character_memory'],
  dialogue: ['dialogue', 'dialog', 'character', 'scene_dialogue'],
  research: ['research', 'topic', 'knowledge', 'chapter_topic', 'chapter_knowledge', 'season_skeleton', 'chapter_material'],
  details: ['details', 'heroes', 'locations', 'mood', 'system'],
  image_prompt: ['image_prompt', 'prompt', 'visual'],
};

const getOperationRole = (operation: GenerationRequest['operation']) => {
  if (operation === 'scenario') return 'scenario';
  if (operation === 'narration_edit' || operation === 'story_structure_edit' || operation === 'brief_revision') return 'editor';
  if (operation === 'narration' || operation === 'tts_cleanup') return 'narration';
  if (operation === 'chapter_topic' || operation === 'chapter_knowledge' || operation === 'season_skeleton' || operation === 'chapter_material') return 'research';
  if (operation === 'chapter_summary' || operation === 'season_memory_update' || operation === 'chapter_facts' || operation === 'character_memory') return 'memory';
  if (operation === 'scene_dialogue') return 'dialogue';
  if (operation === 'heroes' || operation === 'locations' || operation === 'mood' || operation === 'system_inserts') return 'details';
  if (operation.endsWith('_prompt')) return 'image_prompt';
  return 'default';
};

const resolveLmStudioModel = (value: string, request: GenerationRequest) => {
  const trimmed = value.trim();
  const requestModel = request.model?.trim();
  if (!trimmed) return requestModel || LM_STUDIO_DEFAULT_MODEL;
  if (!/[=\n;]/u.test(trimmed)) return requestModel || trimmed;

  const entries = trimmed
    .split(/[;\n]+/u)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex < 0) return null;
      return {
        key: entry.slice(0, separatorIndex).trim().toLocaleLowerCase('en'),
        model: entry.slice(separatorIndex + 1).trim(),
      };
    })
    .filter((entry): entry is { key: string; model: string } => Boolean(entry?.key && entry.model));

  const role = getOperationRole(request.operation);
  const roleMatch = entries.find((entry) =>
    entry.key === role || operationRoleAliases[role]?.includes(entry.key));
  const operationMatch = entries.find((entry) => entry.key === request.operation);
  const defaultMatch = entries.find((entry) => entry.key === 'default');
  return operationMatch?.model ?? roleMatch?.model ?? requestModel ?? defaultMatch?.model ?? LM_STUDIO_DEFAULT_MODEL;
};

export const generateText = (
  request: GenerationRequest,
  signal?: AbortSignal,
  settings = getDefaultGenerationSettings(),
): Promise<string> => {
  if (settings.mode === 'mock') return createMockCompletion(request, signal).then((value) => value ?? '');
  if (settings.mode === 'lmstudio') return callLmStudioAPI(request, settings, signal);
  if (settings.mode === 'comfygemini') return callComfyGeminiTextAPI(request, settings, signal);
  return callMistralAPI(request, signal);
};

const wait = (milliseconds: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new DOMException('Запрос отменён', 'AbortError'));
      },
      { once: true },
    );
  });

const getComfyBaseUrl = (value: string) => (value.trim() || COMFYUI_DEFAULT_ENDPOINT).replace(/\/+$/, '');

const getComfyFetchOptions = (options: RequestInit = {}): RequestInit => options;

const createComfyPromptPayload = (
  clientId: string,
  workflow: unknown,
  settings: { comfyOrgApiKey?: string; comfyGeminiApiKey?: string },
) => {
  const apiKey = getComfyOrgApiKey(settings);
  return {
    client_id: clientId,
    prompt: workflow,
    extra_data: {
      comfy_usage_source: 'canva-story',
      ...(apiKey ? { api_key_comfy_org: apiKey } : {}),
    },
  };
};

const getComfyOrgApiKey = (settings: { comfyOrgApiKey?: string; comfyGeminiApiKey?: string }) =>
  (settings.comfyOrgApiKey ?? settings.comfyGeminiApiKey ?? '').trim()
  || import.meta.env.VITE_COMFY_ORG_API_KEY?.trim()
  || '';

const isComfyAuthorizationError = (message: string) =>
  /unauthorized|login first|authentication required|auth/i.test(message);

const getComfyGeminiAuthMessage = () =>
  'Gemini через ComfyUI требует Comfy.org API key. Вход в отдельной вкладке ComfyUI не передаётся в Canva Story API-запрос: вставьте ключ в поле Comfy.org API key в верхней панели Canva Story или переключите текстовый режим на LM Studio.';

const readResponseDetails = async (response: Response) => {
  try {
    const payload: unknown = await response.json();
    const nodeDetails = getComfyNodeErrorDetails(payload);
    if (nodeDetails) return nodeDetails;
    const message = getErrorMessage(payload);
    return message || JSON.stringify(payload);
  } catch {
    try {
      return await response.text();
    } catch {
      return response.statusText;
    }
  }
};

const getComfyNodeErrorDetails = (value: unknown) => {
  if (!value || typeof value !== 'object') return '';
  const nodeErrors = (value as Record<string, unknown>).node_errors;
  if (!nodeErrors || typeof nodeErrors !== 'object') return '';

  const lines = Object.entries(nodeErrors as Record<string, unknown>).flatMap(([nodeId, nodeError]) => {
    if (!nodeError || typeof nodeError !== 'object') return [];
    const data = nodeError as Record<string, unknown>;
    const classType = typeof data.class_type === 'string' ? data.class_type : 'node';
    const errors = Array.isArray(data.errors) ? data.errors : [];
    return errors.map((error) => {
      if (!error || typeof error !== 'object') return `${classType} ${nodeId}: validation error`;
      const details = error as Record<string, unknown>;
      const message = typeof details.message === 'string' ? details.message : 'validation error';
      const field = typeof details.details === 'string' ? ` (${details.details})` : '';
      return `${classType} ${nodeId}: ${message}${field}`;
    });
  });

  return lines.join('; ');
};

const getComfyError = (action: string, response: Response, details: string) => {
  const trimmedDetails = details.slice(0, 600);
  const authHint = response.status === 401 || /unauthorized|login first|auth/i.test(details)
    ? ' Для Comfy API-нод нужен Comfy.org API key: вставьте его в поле Comfy.org key в верхней панели Canva Story.'
    : '';
  return `${action}: ${response.status}${trimmedDetails ? ` · ${trimmedDetails}` : ''}${authHint}`;
};

const getComfyCheckpointNames = async (baseUrl: string, signal?: AbortSignal) => {
  const response = await fetch(`${baseUrl}/object_info/CheckpointLoaderSimple`, getComfyFetchOptions({ signal }));
  if (!response.ok) return null;
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object') return null;
  const info = data as Record<string, { input?: { required?: { ckpt_name?: unknown[] } } }>;
  const ckptField = info.CheckpointLoaderSimple?.input?.required?.ckpt_name;
  const names = Array.isArray(ckptField?.[0]) ? ckptField[0] : [];
  return names.filter((name): name is string => typeof name === 'string');
};

const getCheckpointFileName = (value: string) => value.split(/[\\/]/).pop()?.toLowerCase() ?? value.toLowerCase();

const resolveComfyCheckpoint = async (
  baseUrl: string,
  configuredCheckpoint: string,
  signal?: AbortSignal,
) => {
  const checkpoint = configuredCheckpoint.trim() || COMFYUI_DEFAULT_CHECKPOINT;
  const names = await getComfyCheckpointNames(baseUrl, signal);
  if (!names || names.includes(checkpoint)) return checkpoint;

  const exactCaseInsensitiveMatch = names.find((name) => name.toLowerCase() === checkpoint.toLowerCase());
  if (exactCaseInsensitiveMatch) return exactCaseInsensitiveMatch;

  const fileNameMatch = names.find((name) => getCheckpointFileName(name) === getCheckpointFileName(checkpoint));
  if (fileNameMatch) return fileNameMatch;

  const sdxlCandidates = names.filter((name) => /sdxl|sd_xl|xl/i.test(name));
  const suggestions = (sdxlCandidates.length > 0 ? sdxlCandidates : names).slice(0, 8).join(', ');
  throw new Error(
    `ComfyUI не нашёл checkpoint "${checkpoint}". Укажите точное имя из ComfyUI/models/checkpoints. Доступно: ${suggestions || 'список пуст'}.`,
  );
};

const SDXL_NEGATIVE_PROMPTS: Record<ImagePromptKind, string> = {
  default: [
    'text',
    'watermark',
    'logo',
    'blurry',
    'low quality',
    'distorted anatomy',
    'extra fingers',
  ].join(', '),
  scene_location: [
    'text',
    'watermark',
    'logo',
    'blurry',
    'low quality',
    'people',
    'person',
    'human',
    'character',
    'face',
    'hands',
    'body',
    'silhouette of a person',
    'foreground character',
  ].join(', '),
  scene_characters: [
    'text',
    'watermark',
    'logo',
    'blurry',
    'low quality',
    'distorted anatomy',
    'extra fingers',
    'missing fingers',
    'bad hands',
    'cropped head',
    'cropped legs',
    'out of frame',
    'close-up',
    'portrait',
    'bust',
    'waist-up crop',
    'photorealistic',
    'photograph',
    'photo',
    'cartoon',
    'chibi',
    'anime',
    '3d render',
    'gender swap',
    'cloned faces',
    'same face on different characters',
    'identical outfits',
    'same cloak on every character',
    'same medallion on every character',
    'detailed background',
  ].join(', '),
  character_asset: [
    'text',
    'watermark',
    'logo',
    'blurry',
    'low quality',
    'distorted anatomy',
    'extra fingers',
    'missing fingers',
    'bad hands',
    'cropped head',
    'cropped legs',
    'out of frame',
    'close-up',
    'portrait',
    'bust',
    'waist-up crop',
    'photorealistic',
    'photograph',
    'photo',
    'cartoon',
    'chibi',
    'anime',
    '3d render',
    'cloned faces',
    'same face on different characters',
    'identical outfits',
    'same cloak on every character',
    'same medallion on every character',
  ].join(', '),
  location_asset: [
    'text',
    'watermark',
    'logo',
    'blurry',
    'low quality',
    'people',
    'person',
    'foreground character',
    'close-up portrait',
  ].join(', '),
  system_insert: [
    'watermark',
    'logo',
    'blurry',
    'low quality',
    'messy layout',
    'illegible letters',
    'random symbols',
    'crowded composition',
    'photorealistic scene',
    'human character',
  ].join(', '),
  chapter_backdrop: [
    'watermark',
    'logo',
    'blurry',
    'low quality',
    'messy layout',
    'illegible letters',
    'foreground character',
    'portrait',
  ].join(', '),
};

const normalizeImagePromptKind = (promptKind: ImagePromptKind | string): ImagePromptKind => {
  const normalized = promptKind.split(':')[0];
  if (
    normalized === 'scene_location'
    || normalized === 'scene_characters'
    || normalized === 'character_asset'
    || normalized === 'location_asset'
    || normalized === 'system_insert'
    || normalized === 'chapter_backdrop'
    || normalized === 'default'
  ) {
    return normalized;
  }
  return 'default';
};

const buildComfySdxlWorkflow = (prompt: string, checkpoint: string, promptKind: ImagePromptKind) => {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const normalizedPromptKind = normalizeImagePromptKind(promptKind);
  const isCharacterAsset = normalizedPromptKind === 'character_asset';
  const width = isCharacterAsset ? 832 : WIDE_FRAME_WIDTH;
  const height = isCharacterAsset ? 1216 : WIDE_FRAME_HEIGHT;
  return {
    '3': {
      class_type: 'KSampler',
      inputs: {
        cfg: 7,
        denoise: 1,
        latent_image: ['5', 0],
        model: ['4', 0],
        negative: ['7', 0],
        positive: ['6', 0],
        sampler_name: 'euler',
        scheduler: 'normal',
        seed,
        steps: 28,
      },
    },
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: {
        ckpt_name: checkpoint.trim() || COMFYUI_DEFAULT_CHECKPOINT,
      },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: {
        batch_size: 1,
        height,
        width,
      },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['4', 1],
        text: prompt,
      },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['4', 1],
        text: SDXL_NEGATIVE_PROMPTS[normalizedPromptKind],
      },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['3', 0],
        vae: ['4', 2],
      },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'CANVA_STORY_SDXL',
        images: ['8', 0],
      },
    },
  };
};

const buildComfyZImageTurboWorkflow = (prompt: string, promptKind: ImagePromptKind) => {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const normalizedPromptKind = normalizeImagePromptKind(promptKind);
  const isCharacterAsset = normalizedPromptKind === 'character_asset';
  const width = isCharacterAsset ? 832 : WIDE_FRAME_WIDTH;
  const height = isCharacterAsset ? 1216 : WIDE_FRAME_HEIGHT;
  return {
    '3': {
      class_type: 'KSampler',
      inputs: {
        cfg: 1,
        denoise: 1,
        latent_image: ['13', 0],
        model: ['11', 0],
        negative: ['33', 0],
        positive: ['27', 0],
        sampler_name: 'res_multistep',
        scheduler: 'simple',
        seed,
        steps: 8,
      },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['3', 0],
        vae: ['29', 0],
      },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'CANVA_STORY_Z_IMAGE',
        images: ['8', 0],
      },
    },
    '11': {
      class_type: 'ModelSamplingAuraFlow',
      inputs: {
        model: ['28', 0],
        shift: 3,
      },
    },
    '13': {
      class_type: 'EmptySD3LatentImage',
      inputs: {
        batch_size: 1,
        height,
        width,
      },
    },
    '27': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['30', 0],
        text: prompt,
      },
    },
    '28': {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: Z_IMAGE_TURBO_DIFFUSION_MODEL,
        weight_dtype: 'default',
      },
    },
    '29': {
      class_type: 'VAELoader',
      inputs: {
        vae_name: Z_IMAGE_VAE,
      },
    },
    '30': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: Z_IMAGE_TEXT_ENCODER,
        device: 'default',
        type: 'lumina2',
      },
    },
    '33': {
      class_type: 'ConditioningZeroOut',
      inputs: {
        conditioning: ['27', 0],
      },
    },
  };
};

const buildComfyErnieImageTurboWorkflow = (prompt: string, promptKind: ImagePromptKind) => {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const normalizedPromptKind = normalizeImagePromptKind(promptKind);
  const isCharacterAsset = normalizedPromptKind === 'character_asset';
  const width = isCharacterAsset ? 832 : WIDE_FRAME_WIDTH;
  const height = isCharacterAsset ? 1216 : WIDE_FRAME_HEIGHT;

  return {
    '62': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: ERNIE_IMAGE_TEXT_ENCODER,
        device: 'default',
        type: 'flux2',
      },
    },
    '63': {
      class_type: 'VAELoader',
      inputs: {
        vae_name: ERNIE_IMAGE_VAE,
      },
    },
    '65': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['70', 0],
        vae: ['63', 0],
      },
    },
    '66': {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: ERNIE_IMAGE_TURBO_DIFFUSION_MODEL,
        weight_dtype: 'default',
      },
    },
    '67': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['62', 0],
        text: prompt,
      },
    },
    '70': {
      class_type: 'KSampler',
      inputs: {
        cfg: 1,
        denoise: 1,
        latent_image: ['71', 0],
        model: ['66', 0],
        negative: ['91', 0],
        positive: ['67', 0],
        sampler_name: 'euler',
        scheduler: 'simple',
        seed,
        steps: 8,
      },
    },
    '71': {
      class_type: 'EmptyFlux2LatentImage',
      inputs: {
        batch_size: 1,
        height,
        width,
      },
    },
    '91': {
      class_type: 'ConditioningZeroOut',
      inputs: {
        conditioning: ['67', 0],
      },
    },
    '92': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'CANVA_STORY_ERNIE_IMAGE_TURBO',
        images: ['65', 0],
      },
    },
  };
};

const getComfyImagePipelineLabel = (pipeline: ImagePipeline) => {
  if (pipeline === 'z_image_turbo') return 'Z-Image Turbo';
  if (pipeline === 'ernie_image_turbo') return 'ERNIE Image Turbo';
  return 'SDXL';
};

const getComfyImageTimeoutMs = (pipeline: ImagePipeline) => {
  if (pipeline === 'sdxl') return COMFY_SDXL_TIMEOUT_MS;
  if (pipeline === 'ernie_image_turbo') return COMFY_ERNIE_IMAGE_TIMEOUT_MS;
  return COMFY_Z_IMAGE_TIMEOUT_MS;
};

interface ComfyPromptResponse {
  prompt_id?: string;
}

interface ComfyImageRef {
  filename: string;
  subfolder?: string;
  type?: string;
}

interface ComfyAudioRef {
  filename: string;
  subfolder?: string;
  type?: string;
}

interface ComfyTextFileRef {
  filename: string;
  subfolder?: string;
  type?: string;
}

interface ComfyUploadResponse {
  name?: string;
  subfolder?: string;
  type?: string;
}

interface ComfyHistoryEntry {
  outputs?: Record<string, {
    images?: ComfyImageRef[];
    audio?: ComfyAudioRef[];
    audios?: ComfyAudioRef[];
    text?: unknown;
    texts?: unknown;
    string?: unknown;
    strings?: unknown;
    files?: unknown;
  }>;
  status?: {
    status_str?: string;
    completed?: boolean;
    messages?: unknown[];
  };
}

const getImageFromComfyHistory = (value: unknown): ComfyImageRef | null => {
  if (!value || typeof value !== 'object') return null;
  const entries = Object.values(value as Record<string, ComfyHistoryEntry>);
  for (const entry of entries) {
    const outputs = entry.outputs ? Object.values(entry.outputs) : [];
    for (const output of outputs) {
      const image = output.images?.[0];
      if (image?.filename) return image;
    }
  }
  return null;
};

const getAudioFromComfyHistory = (value: unknown): ComfyAudioRef | null => {
  if (!value || typeof value !== 'object') return null;
  const entries = Object.values(value as Record<string, ComfyHistoryEntry>);
  for (const entry of entries) {
    const outputs = entry.outputs ? Object.values(entry.outputs) : [];
    for (const output of outputs) {
      const audio = output.audio?.[0] ?? output.audios?.[0];
      if (audio?.filename) return audio;
    }
  }
  return null;
};

const extractComfyTextValue = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((entry) => extractComfyTextValue(entry))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (!value || typeof value !== 'object') return '';
  const data = value as Record<string, unknown>;
  return ['text', 'content', 'value', 'STRING', 'string']
    .map((key) => extractComfyTextValue(data[key]))
    .find(Boolean) ?? '';
};

const getComfyTextFileRef = (value: unknown): ComfyTextFileRef | null => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const file = getComfyTextFileRef(entry);
      if (file) return file;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (typeof data.filename === 'string') {
    return {
      filename: data.filename,
      subfolder: typeof data.subfolder === 'string' ? data.subfolder : '',
      type: typeof data.type === 'string' ? data.type : 'output',
    };
  }
  for (const key of ['text', 'texts', 'files', 'file']) {
    const file = getComfyTextFileRef(data[key]);
    if (file) return file;
  }
  return null;
};

const getTextFromComfyHistory = (value: unknown): { text?: string; file?: ComfyTextFileRef } | null => {
  if (!value || typeof value !== 'object') return null;
  const entries = Object.values(value as Record<string, ComfyHistoryEntry>);
  for (const entry of entries) {
    const outputs = entry.outputs ? Object.values(entry.outputs) : [];
    for (const output of outputs) {
      const candidates = [output.text, output.texts, output.string, output.strings, output.files];
      for (const candidate of candidates) {
        const text = extractComfyTextValue(candidate);
        if (text) return { text };
        const file = getComfyTextFileRef(candidate);
        if (file) return { file };
      }
    }
  }
  return null;
};

const getComfyExecutionFailure = (value: unknown) => {
  if (!value || typeof value !== 'object') return '';
  const entries = Object.values(value as Record<string, ComfyHistoryEntry>);
  for (const entry of entries) {
    if (entry.status?.status_str !== 'error') continue;
    const messages = entry.status.messages ?? [];
    const lastEvent = [...messages].reverse().find((message) => {
      if (!Array.isArray(message)) return false;
      return message[0] === 'execution_error' || message[0] === 'execution_interrupted';
    });
    if (!Array.isArray(lastEvent)) return 'ComfyUI остановил выполнение workflow.';
    const eventType = String(lastEvent[0]);
    const eventData = lastEvent[1] && typeof lastEvent[1] === 'object'
      ? lastEvent[1] as Record<string, unknown>
      : {};
    const nodeType = typeof eventData.node_type === 'string' ? ` в ${eventData.node_type}` : '';
    if (eventType === 'execution_interrupted') return `ComfyUI прервал выполнение workflow${nodeType}.`;
    const exception = typeof eventData.exception_message === 'string' ? `: ${eventData.exception_message}` : '';
    return `ComfyUI остановил workflow${nodeType}${exception}`;
  }
  return '';
};

const waitForComfyImage = async (
  baseUrl: string,
  promptId: string,
  timeoutMs: number,
  signal?: AbortSignal,
) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await wait(1000, signal);
    const historyResponse = await fetch(`${baseUrl}/history/${promptId}`, getComfyFetchOptions({ signal }));
    if (!historyResponse.ok) continue;
    const history: unknown = await historyResponse.json();
    const image = getImageFromComfyHistory(history);
    if (image) return image;
    const failure = getComfyExecutionFailure(history);
    if (failure) throw new Error(failure);
  }
  return null;
};

const getComfyQueuePromptIds = (value: unknown) => (
  Array.isArray(value)
    ? value.flatMap((item) => (
      Array.isArray(item) && typeof item[1] === 'string' ? [item[1]] : []
    ))
    : []
);

const cancelComfyPrompt = async (baseUrl: string, promptId: string) => {
  try {
    const queueResponse = await fetch(`${baseUrl}/queue`, getComfyFetchOptions());
    if (!queueResponse.ok) return;
    const queue = await queueResponse.json() as Record<string, unknown>;
    const runningIds = getComfyQueuePromptIds(queue.queue_running);
    const pendingIds = getComfyQueuePromptIds(queue.queue_pending);

    if (runningIds.includes(promptId)) {
      await fetch(`${baseUrl}/interrupt`, getComfyFetchOptions({ method: 'POST' }));
    }
    if (pendingIds.includes(promptId)) {
      await fetch(`${baseUrl}/queue`, getComfyFetchOptions({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete: [promptId] }),
      }));
    }
  } catch {
    // Cancellation is best-effort; the original generation error is more useful to the user.
  }
};

const waitForComfyAudio = async (
  baseUrl: string,
  promptId: string,
  timeoutMs: number,
  signal?: AbortSignal,
) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await wait(2000, signal);
    const historyResponse = await fetch(`${baseUrl}/history/${promptId}`, getComfyFetchOptions({ signal }));
    if (!historyResponse.ok) continue;
    const history: unknown = await historyResponse.json();
    const audio = getAudioFromComfyHistory(history);
    if (audio) return audio;
    const failure = getComfyExecutionFailure(history);
    if (failure) throw new Error(failure);
  }
  return null;
};

const waitForComfyText = async (
  baseUrl: string,
  promptId: string,
  timeoutMs: number,
  signal?: AbortSignal,
) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await wait(1000, signal);
    const historyResponse = await fetch(`${baseUrl}/history/${promptId}`, getComfyFetchOptions({ signal }));
    if (!historyResponse.ok) continue;
    const history: unknown = await historyResponse.json();
    const result = getTextFromComfyHistory(history);
    if (result?.text) return result.text;
    if (result?.file) {
      const params = new URLSearchParams({
        filename: result.file.filename,
        subfolder: result.file.subfolder ?? '',
        type: result.file.type ?? 'output',
      });
      const viewResponse = await fetch(`${baseUrl}/view?${params.toString()}`, getComfyFetchOptions({ signal }));
      if (viewResponse.ok) {
        const text = (await viewResponse.text()).trim();
        if (text) return text;
      }
    }
    const failure = getComfyExecutionFailure(history);
    if (failure) throw new Error(failure);
  }
  return null;
};

const freeComfyModels = async (baseUrl: string, signal?: AbortSignal) => {
  const response = await fetch(`${baseUrl}/free`, getComfyFetchOptions({
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ free_memory: true, unload_models: true }),
  }));
  if (!response.ok) throw new Error(`ComfyUI не выгрузил модели: ${response.status}`);
};

export const unloadComfyModels = async (settings: ImageGenerationSettings, signal?: AbortSignal) => {
  await freeComfyModels(getComfyBaseUrl(settings.comfyEndpoint), signal);
};

export interface OmniVoiceReferenceInput {
  blob: Blob;
  fileName: string;
  assetId: string;
  transcript: string;
}

const getComfyOmniVoiceModelName = (settings: NarrationSettings) =>
  `${settings.model} (auto download)`;

const getComfyOmniVoiceCommonInputs = (settings: NarrationSettings, seed: number) => ({
  model: getComfyOmniVoiceModelName(settings),
  steps: getOmniVoiceSteps(settings.quality),
  guidance_scale: 2,
  t_shift: 0.1,
  speed: 0.9,
  duration: 0,
  device: 'auto',
  dtype: settings.model === 'OmniVoice' ? 'fp32' : 'bf16',
  attention: 'auto',
  seed,
  position_temperature: 5,
  class_temperature: 0,
  layer_penalty_factor: 5,
  denoise: true,
  postprocess_output: true,
  keep_model_loaded: true,
});

const buildComfyOmniVoiceDesignWorkflow = (
  text: string,
  settings: NarrationSettings,
  seed: number,
) => ({
  '1': {
    class_type: 'OmniVoiceVoiceDesignTTS',
    inputs: {
      ...getComfyOmniVoiceCommonInputs(settings, seed),
      text,
      voice_instruct: settings.voiceInstruct.trim() || OMNIVOICE_DEFAULT_VOICE_INSTRUCT,
    },
  },
  '2': {
    class_type: 'PreviewAudio',
    inputs: {
      audio: ['1', 0],
    },
  },
});

const buildComfyOmniVoiceCloneWorkflow = (
  text: string,
  settings: NarrationSettings,
  seed: number,
  uploadedAudioPath: string,
  transcript: string,
) => ({
  '0': {
    class_type: 'LoadAudio',
    inputs: {
      audio: uploadedAudioPath,
    },
  },
  '1': {
    class_type: 'OmniVoiceVoiceCloneTTS',
    inputs: {
      ...getComfyOmniVoiceCommonInputs(settings, seed),
      text,
      ref_audio: ['0', 0],
      ref_text: transcript,
      preprocess_prompt: true,
      instruct: '',
    },
  },
  '2': {
    class_type: 'PreviewAudio',
    inputs: {
      audio: ['1', 0],
    },
  },
});

const uploadComfyOmniVoiceReference = async (
  baseUrl: string,
  reference: OmniVoiceReferenceInput,
  signal?: AbortSignal,
) => {
  const extensionMatch = reference.fileName.match(/\.[a-z0-9]{1,8}$/iu);
  const extension = extensionMatch?.[0]?.toLowerCase() ?? '.wav';
  const safeAssetId = reference.assetId.replace(/[^a-z0-9._-]+/giu, '-').slice(-96) || 'narrator';
  const formData = new FormData();
  formData.append('image', reference.blob, `${safeAssetId}${extension}`);
  formData.append('type', 'input');
  formData.append('subfolder', 'canva_story/voice_references');
  formData.append('overwrite', 'true');
  const response = await fetch(`${baseUrl}/upload/image`, getComfyFetchOptions({
    method: 'POST',
    signal,
    body: formData,
  }));
  if (!response.ok) {
    throw new Error(getComfyError('ComfyUI не принял референс голоса', response, await readResponseDetails(response)));
  }
  const uploaded = await response.json() as { name?: string; subfolder?: string };
  if (!uploaded.name) throw new Error('ComfyUI не вернул имя загруженного голосового референса.');
  return uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
};

export const generateComfyOmniVoiceAudio = async (
  text: string,
  narrationSettings: NarrationSettings,
  settings: ImageGenerationSettings,
  reference: OmniVoiceReferenceInput | undefined,
  seedOverride?: number,
  signal?: AbortSignal,
) => {
  const baseUrl = getComfyBaseUrl(settings.comfyEndpoint);
  try {
    const seed = seedOverride ?? narrationSettings.seed;
    let workflow: Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    if (narrationSettings.mode === 'clone') {
      if (!reference?.blob) throw new Error('Для Voice Clone выберите референс голоса длительностью 3–15 секунд.');
      if (!reference.transcript.trim()) {
        throw new Error('Для Voice Clone добавьте точную расшифровку референса. Так OmniVoice не будет загружать Whisper и точнее сохранит голос.');
      }
      const uploadedAudioPath = await uploadComfyOmniVoiceReference(baseUrl, reference, signal);
      workflow = buildComfyOmniVoiceCloneWorkflow(
        text,
        narrationSettings,
        seed,
        uploadedAudioPath,
        reference.transcript.trim(),
      );
    } else {
      workflow = buildComfyOmniVoiceDesignWorkflow(text, narrationSettings, seed);
    }
    const clientId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `canva-story-omnivoice-${Date.now()}`;

    const promptResponse = await fetch(`${baseUrl}/prompt`, getComfyFetchOptions({
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createComfyPromptPayload(clientId, workflow, settings)),
    }));
    if (!promptResponse.ok) {
      throw new Error(getComfyError('ComfyUI не принял OmniVoice workflow', promptResponse, await readResponseDetails(promptResponse)));
    }
    const promptData: ComfyPromptResponse = await promptResponse.json();
    if (!promptData.prompt_id) throw new Error('ComfyUI не вернул prompt_id для OmniVoice workflow.');

    const audio = await waitForComfyAudio(baseUrl, promptData.prompt_id, COMFY_TTS_TIMEOUT_MS, signal);
    if (!audio) throw new Error('OmniVoice не вернул аудио за 45 минут. ComfyUI может ещё считать озвучку, проверьте его окно.');

    const params = new URLSearchParams({
      filename: audio.filename,
      subfolder: audio.subfolder ?? '',
      type: audio.type ?? 'temp',
    });
    const viewResponse = await fetch(`${baseUrl}/view?${params.toString()}`, getComfyFetchOptions({ signal }));
    if (!viewResponse.ok) {
      throw new Error(getComfyError('ComfyUI не отдал готовое OmniVoice аудио', viewResponse, await readResponseDetails(viewResponse)));
    }

    return URL.createObjectURL(await viewResponse.blob());
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof TypeError) {
      throw new Error(`Не удалось подключиться к ComfyUI по адресу ${baseUrl}. Проверьте ComfyUI, OmniVoice-ноды и CORS.`);
    }
    throw error;
  }
};

const buildComfyGeminiTextWorkflow = (
  request: GenerationRequest,
  settings: GenerationSettings,
) => {
  // GeminiNodeV2 uses Comfy's DynamicCombo input. Keep nested model options as
  // dotted keys (`model.temperature`, etc.), and only send a real Gemini combo value.
  // Invalid names like `mistral-small-latest` make Comfy drop the whole `model` group.
  const parameters = getTextGenerationParameters(request);
  const seed = Math.floor(Math.random() * 2_000_000_000);
  const model = resolveComfyGeminiModel(request.model, settings.comfyGeminiModel);
  const maxOutputTokens = Math.max(
    512,
    Math.floor(settings.comfyGeminiMaxOutputTokens || COMFY_GEMINI_DEFAULT_MAX_OUTPUT_TOKENS),
  );
  const thinkingLevel = settings.comfyGeminiThinkingLevel.trim() || COMFY_GEMINI_DEFAULT_THINKING_LEVEL;
  return {
    '1': {
      class_type: 'GeminiNodeV2',
      inputs: {
        prompt: request.prompt,
        model,
        'model.thinking_level': thinkingLevel,
        'model.temperature': parameters.temperature,
        'model.top_p': parameters.top_p,
        'model.max_output_tokens': maxOutputTokens,
        seed,
        system_prompt: request.systemPrompt,
      },
    },
    '2': {
      class_type: 'SaveText',
      inputs: {
        text: ['1', 0],
        filename_prefix: 'Text/CANVA_STORY_GEMINI',
        format: 'txt',
      },
    },
  };
};

const callComfyGeminiTextAPI = async (
  request: GenerationRequest,
  settings: GenerationSettings,
  signal?: AbortSignal,
): Promise<string> => {
  const baseUrl = getComfyBaseUrl(settings.comfyGeminiEndpoint);
  if (!getComfyOrgApiKey(settings)) {
    throw new Error(getComfyGeminiAuthMessage());
  }
  try {
    const runWorkflow = async () => {
      const clientId = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `canva-story-gemini-${Date.now()}`;
      const workflow = buildComfyGeminiTextWorkflow(request, settings);
      const response = await fetch(`${baseUrl}/prompt`, getComfyFetchOptions({
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createComfyPromptPayload(clientId, workflow, settings)),
      }));
      if (response.ok) return response;
      const details = await readResponseDetails(response);
      throw new Error(getComfyError('ComfyUI не принял Gemini workflow', response, details));
    };

    const readWorkflowResult = async (promptResponse: Response) => {
      const promptData: ComfyPromptResponse = await promptResponse.json();
      if (!promptData.prompt_id) throw new Error('ComfyUI не вернул prompt_id для Gemini workflow.');

      const text = await waitForComfyText(baseUrl, promptData.prompt_id, COMFY_GEMINI_TEXT_TIMEOUT_MS, signal);
      if (!text) throw new Error('Gemini в ComfyUI не вернул текст за 45 минут. Проверьте окно ComfyUI и папку output/Text.');
      return text;
    };

    return await readWorkflowResult(await runWorkflow());
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof TypeError) {
      throw new Error(`Не удалось подключиться к ComfyUI по адресу ${baseUrl}. Проверьте, что ComfyUI запущен, endpoint указан верно и разрешён CORS (--enable-cors-header).`);
    }
    if (error instanceof Error && isComfyAuthorizationError(error.message)) {
      throw new Error(getComfyGeminiAuthMessage());
    }
    throw error;
  }
};

interface LmStudioModelEntry {
  type?: string;
  key?: string;
  id?: string;
  model_key?: string;
  display_name?: string;
  params_string?: string;
  paramsString?: string;
  selected_variant?: string;
  max_context_length?: number;
  maxContextLength?: number;
  loaded_instances?: Array<{
    id?: string;
    config?: {
      context_length?: number;
    };
  }>;
}

interface LmStudioModelsResponse {
  models?: LmStudioModelEntry[];
}

interface OpenAiModelsResponse {
  data?: Array<{ id?: string }>;
}

let lmStudioLoadSupportsContextLength: boolean | null = null;

const uniqueNonEmpty = (values: string[]) =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))];

export const listLmStudioModels = async (settings: GenerationSettings, signal?: AbortSignal) => {
  const baseUrl = getLmStudioBaseUrl(settings.lmStudioEndpoint);
  const endpoints = [`${baseUrl}/api/v1/models`, `${baseUrl}/v1/models`];
  let lastError = '';

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { signal });
      if (!response.ok) {
        lastError = `${response.status}`;
        continue;
      }

      const data: OpenAiModelsResponse & LmStudioModelsResponse = await response.json();
      const openAiIds = (data.data ?? []).map((model) => model.id ?? '');
      const lmStudioIds = (data.models ?? [])
        .filter((model) => model.type !== 'embedding')
        .map((model) => model.key ?? model.id ?? model.model_key ?? model.selected_variant ?? model.display_name ?? '');
      const models = uniqueNonEmpty([...openAiIds, ...lmStudioIds]);
      if (models.length > 0) return models;
      lastError = 'empty model list';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`LM Studio не отдал список моделей${lastError ? `: ${lastError}` : ''}`);
};

const getLmStudioNativeModels = async (baseUrl: string, signal?: AbortSignal) => {
  const response = await fetch(`${baseUrl}/api/v1/models`, { signal });
  if (!response.ok) throw new Error(`LM Studio не отдал список моделей: ${response.status}`);
  const data: LmStudioModelsResponse = await response.json();
  return data.models ?? [];
};

const findLmStudioModel = (models: LmStudioModelEntry[], modelName: string) => {
  const normalized = modelName.trim();
  return models.find((model) =>
    model.type !== 'embedding'
    && [
      model.key,
      model.id,
      model.model_key,
      model.display_name,
      model.selected_variant,
      ...(model.loaded_instances ?? []).map((instance) => instance.id),
    ].some((candidate) => candidate === normalized));
};

const clampContextLength = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1024, Math.floor(value));
};

const roundContextLength = (value: number) =>
  Math.ceil(value / 1024) * 1024;

const getOperationOutputReserve = (request: GenerationRequest) => {
  if (request.operation.endsWith('_prompt')) return 1536;
  if (request.operation === 'chapter_summary' || request.operation === 'chapter_facts') return 3072;
  if (request.operation === 'scenario' || request.operation === 'chapter_material') {
    return Math.max(3072, (request.sceneCount ?? 8) * 640);
  }
  if (request.operation === 'chapter_knowledge' || request.operation === 'chapter_topic' || request.operation === 'season_skeleton') return 4096;
  return 2048;
};

const estimateLmStudioContextLength = (request: GenerationRequest, draftContext: number, largeContext: number) => {
  const sourceText = `${request.systemPrompt}\n\n${request.prompt}`;
  const estimatedInputTokens = Math.ceil(sourceText.length / 3);
  const target = estimatedInputTokens + getOperationOutputReserve(request) + 512;
  return Math.min(largeContext, Math.max(draftContext, roundContextLength(target)));
};

const getTargetLmStudioContextLength = (
  model: LmStudioModelEntry,
  settings: GenerationSettings,
  request: GenerationRequest,
) => {
  const draftContext = clampContextLength(settings.lmStudioDraftContextLength, LM_STUDIO_DEFAULT_DRAFT_CONTEXT_LENGTH);
  const largeContext = clampContextLength(settings.lmStudioLargeContextLength, LM_STUDIO_DEFAULT_LARGE_CONTEXT_LENGTH);
  const declaredMaxContext = model.max_context_length ?? model.maxContextLength;
  const maxContext = typeof declaredMaxContext === 'number' && declaredMaxContext > 0
    ? declaredMaxContext
    : largeContext;
  return Math.min(estimateLmStudioContextLength(request, draftContext, largeContext), maxContext);
};

const unloadLmStudioInstances = async (baseUrl: string, instanceIds: string[], signal?: AbortSignal) => {
  await Promise.all(instanceIds.map(async (instanceId) => {
    const response = await fetch(`${baseUrl}/api/v1/models/unload`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance_id: instanceId }),
    });
    if (!response.ok) throw new Error(`LM Studio не выгрузил ${instanceId}: ${response.status}`);
  }));
};

const getLoadedLmStudioInstanceIds = (models: LmStudioModelEntry[], predicate: (model: LmStudioModelEntry) => boolean) =>
  models
    .filter((model) => model.type !== 'embedding' && predicate(model))
    .flatMap((model) => model.loaded_instances ?? [])
    .map((instance) => instance.id)
    .filter((id): id is string => Boolean(id));

const readLmStudioErrorDetails = async (response: Response) => {
  try {
    const payload: unknown = await response.json();
    return getErrorMessage(payload) || JSON.stringify(payload);
  } catch {
    return response.statusText;
  }
};

const loadLmStudioModelWithContext = async (
  baseUrl: string,
  model: LmStudioModelEntry,
  contextLength: number,
  signal?: AbortSignal,
) => {
  const modelKey = model.key ?? model.model_key ?? model.id ?? model.display_name;
  if (!modelKey) return;

  const contextPayload = {
    model: modelKey,
    context_length: contextLength,
    echo_load_config: true,
  };
  const plainPayload = { model: modelKey };
  const loadPayloads = lmStudioLoadSupportsContextLength === false
    ? [{ label: 'model', body: plainPayload }]
    : [
      { label: 'model + context_length', body: contextPayload },
      { label: 'model', body: plainPayload },
    ];
  const errors: string[] = [];

  for (const payload of loadPayloads) {
    const response = await fetch(`${baseUrl}/api/v1/models/load`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload.body),
    });
    if (response.ok) {
      lmStudioLoadSupportsContextLength = payload.label.includes('context_length');
      return;
    }
    const details = await readLmStudioErrorDetails(response);
    if (payload.label.includes('context_length') && /unrecognized key\(s\).*context_length/iu.test(details)) {
      lmStudioLoadSupportsContextLength = false;
    }
    errors.push(`${payload.label}: ${response.status}${details ? ` ${details.slice(0, 220)}` : ''}`);
  }

  throw new Error(`LM Studio не загрузил "${modelKey}" с контекстом ${contextLength}: ${errors.join(' | ')}`);
};

const ensureLmStudioModelContext = async (
  modelName: string,
  settings: GenerationSettings,
  request: GenerationRequest,
  signal?: AbortSignal,
) => {
  const baseUrl = getLmStudioBaseUrl(settings.lmStudioEndpoint);
  const models = await getLmStudioNativeModels(baseUrl, signal);
  const model = findLmStudioModel(models, modelName);
  if (!model) return;

  const targetContext = getTargetLmStudioContextLength(model, settings, request);
  const otherInstanceIds = getLoadedLmStudioInstanceIds(models, (candidate) => candidate !== model);
  if (otherInstanceIds.length > 0) {
    await unloadLmStudioInstances(baseUrl, otherInstanceIds, signal);
  }

  const loadedInstances = model.loaded_instances ?? [];
  const hasGoodInstance = loadedInstances.some((instance) => {
    const loadedContext = instance.config?.context_length ?? 0;
    if (loadedContext < targetContext) return false;
    return targetContext > settings.lmStudioDraftContextLength || loadedContext <= targetContext * 2;
  });
  if (hasGoodInstance) return;
  if (loadedInstances.length > 0 && lmStudioLoadSupportsContextLength === false) return;

  const instanceIds = loadedInstances.map((instance) => instance.id).filter((id): id is string => Boolean(id));
  if (instanceIds.length > 0 && lmStudioLoadSupportsContextLength !== false) {
    await unloadLmStudioInstances(baseUrl, instanceIds, signal);
  }
  await loadLmStudioModelWithContext(baseUrl, model, targetContext, signal);
};

export const unloadLmStudioModels = async (settings: GenerationSettings, signal?: AbortSignal) => {
  const baseUrl = getLmStudioBaseUrl(settings.lmStudioEndpoint);
  const models = await getLmStudioNativeModels(baseUrl, signal);
  const instanceIds = models
    .flatMap((model) => model.loaded_instances ?? [])
    .map((instance) => instance.id)
    .filter((id): id is string => Boolean(id));

  await unloadLmStudioInstances(baseUrl, instanceIds, signal);

  return instanceIds.length;
};

const generateComfyImage = async (
  prompt: string,
  pipeline: ImagePipeline,
  settings: ImageGenerationSettings,
  promptKind: ImagePromptKind,
  signal?: AbortSignal,
) => {
  const baseUrl = getComfyBaseUrl(settings.comfyEndpoint);
  try {
    if (pipeline !== 'sdxl' && pipeline !== 'z_image_turbo' && pipeline !== 'ernie_image_turbo') {
      throw new Error('Этот генератор ожидает pipeline SDXL, Z-Image Turbo или ERNIE Image Turbo.');
    }
    const workflow = pipeline === 'sdxl'
      ? buildComfySdxlWorkflow(prompt, await resolveComfyCheckpoint(baseUrl, settings.comfyCheckpoint, signal), promptKind)
      : pipeline === 'ernie_image_turbo'
        ? buildComfyErnieImageTurboWorkflow(prompt, promptKind)
        : buildComfyZImageTurboWorkflow(prompt, promptKind);
    const clientId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `canva-story-${Date.now()}`;

    const promptResponse = await fetch(`${baseUrl}/prompt`, getComfyFetchOptions({
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createComfyPromptPayload(clientId, workflow, settings)),
    }));
    if (!promptResponse.ok) {
      throw new Error(getComfyError(`ComfyUI не принял ${getComfyImagePipelineLabel(pipeline)} workflow`, promptResponse, await readResponseDetails(promptResponse)));
    }
    const promptData: ComfyPromptResponse = await promptResponse.json();
    if (!promptData.prompt_id) throw new Error('ComfyUI не вернул prompt_id. Проверьте workflow в консоли ComfyUI.');

    const image = await waitForComfyImage(
      baseUrl,
      promptData.prompt_id,
      getComfyImageTimeoutMs(pipeline),
      signal,
    );
    if (!image) throw new Error('ComfyUI не вернул изображение за отведённое время. Проверьте, не упал ли workflow в окне ComfyUI.');

    const params = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder ?? '',
      type: image.type ?? 'output',
    });
    const viewResponse = await fetch(`${baseUrl}/view?${params.toString()}`, getComfyFetchOptions({ signal }));
    if (!viewResponse.ok) {
      throw new Error(getComfyError('ComfyUI не отдал готовое изображение', viewResponse, await readResponseDetails(viewResponse)));
    }

    return URL.createObjectURL(await viewResponse.blob());
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof TypeError) {
      throw new Error(`Не удалось подключиться к ComfyUI по адресу ${baseUrl}. Проверьте, что ComfyUI запущен, endpoint указан верно и разрешён CORS (--enable-cors-header).`);
    }
    throw error;
  }
};

const uploadComfyInputImage = async (
  baseUrl: string,
  imageUrl: string,
  filenamePrefix: string,
  signal?: AbortSignal,
) => {
  const sourceResponse = await fetch(imageUrl, { signal });
  if (!sourceResponse.ok) throw new Error(`Не удалось прочитать исходную картинку для Flux2: ${sourceResponse.status}.`);
  const blob = await sourceResponse.blob();
  const extension = blob.type.includes('jpeg') ? 'jpg' : 'png';
  const fileName = `${filenamePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const formData = new FormData();
  formData.append('image', new File([blob], fileName, { type: blob.type || 'image/png' }));
  formData.append('type', 'input');
  formData.append('overwrite', 'true');

  const response = await fetch(`${baseUrl}/upload/image`, getComfyFetchOptions({
    method: 'POST',
    signal,
    body: formData,
  }));
  if (!response.ok) {
    throw new Error(getComfyError('ComfyUI не принял reference image', response, await readResponseDetails(response)));
  }
  const payload: ComfyUploadResponse = await response.json();
  return payload.name || fileName;
};

const loadCanvasImage = async (imageUrl: string, signal?: AbortSignal) => {
  const response = await fetch(imageUrl, { signal });
  if (!response.ok) throw new Error(`Не удалось прочитать character reference для Flux2: ${response.status}.`);
  const objectUrl = URL.createObjectURL(await response.blob());
  const image = new Image();
  image.src = objectUrl;
  await image.decode();
  return { image, objectUrl };
};

const getTrimmedImageBounds = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) => {
  const data = context.getImageData(0, 0, width, height).data;
  const sample = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    return [data[offset], data[offset + 1], data[offset + 2]] as const;
  };
  const corners = [
    sample(0, 0),
    sample(width - 1, 0),
    sample(0, height - 1),
    sample(width - 1, height - 1),
  ];
  const isBackground = (x: number, y: number) => {
    const [red, green, blue] = sample(x, y);
    return corners.some(([cornerRed, cornerGreen, cornerBlue]) =>
      Math.abs(red - cornerRed) + Math.abs(green - cornerGreen) + Math.abs(blue - cornerBlue) < 54);
  };

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isBackground(x, y)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return { x: 0, y: 0, width, height };
  const margin = Math.round(Math.min(width, height) * 0.025);
  const x = Math.max(0, minX - margin);
  const y = Math.max(0, minY - margin);
  const right = Math.min(width, maxX + margin);
  const bottom = Math.min(height, maxY + margin);
  return { x, y, width: right - x + 1, height: bottom - y + 1 };
};

const getImageDrawSource = (image: HTMLImageElement) => {
  const canvas = document.createElement('canvas');
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { source: image, sx: 0, sy: 0, sw: width, sh: height };
  context.drawImage(image, 0, 0);
  const bounds = getTrimmedImageBounds(context, width, height);
  return { source: image, sx: bounds.x, sy: bounds.y, sw: bounds.width, sh: bounds.height };
};

const createCharacterReferenceBoard = async (
  references: Flux2CharacterReference[],
  signal?: AbortSignal,
) => {
  const loadedImages = await Promise.all(references.map((reference) => loadCanvasImage(reference.imageUrl, signal)));
  const count = loadedImages.length;
  const columns = count <= 3 ? count : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const canvas = document.createElement('canvas');
  canvas.width = WIDE_FRAME_WIDTH;
  canvas.height = WIDE_FRAME_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не смог собрать reference-board для Flux2.');

  context.fillStyle = '#d8d4ca';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const outerPadding = 18;
  const gutter = 14;
  const cellWidth = (canvas.width - outerPadding * 2 - gutter * (columns - 1)) / columns;
  const cellHeight = (canvas.height - outerPadding * 2 - gutter * (rows - 1)) / rows;

  loadedImages.forEach(({ image }, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const targetX = outerPadding + column * (cellWidth + gutter);
    const targetY = outerPadding + row * (cellHeight + gutter);
    const { source, sx, sy, sw, sh } = getImageDrawSource(image);
    const scale = Math.min(cellWidth / sw, cellHeight / sh);
    const drawWidth = sw * scale;
    const drawHeight = sh * scale;
    context.drawImage(
      source,
      sx,
      sy,
      sw,
      sh,
      targetX + (cellWidth - drawWidth) / 2,
      targetY + (cellHeight - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
  });

  loadedImages.forEach(({ objectUrl }) => URL.revokeObjectURL(objectUrl));
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error('Браузер не смог сохранить reference-board для Flux2.'));
    }, 'image/png');
  });
  return URL.createObjectURL(blob);
};

const buildComfyFlux2ComposeWorkflow = (
  prompt: string,
  backgroundImageName: string,
  characterImageName: string,
  pipeline: ImagePipeline,
) => {
  const seed = Math.floor(Math.random() * 1_000_000_000_000);
  const isTurbo = pipeline === 'flux2_turbo_compose';
  const steps = isTurbo ? 8 : 20;
  return {
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['38', 0],
        text: prompt,
      },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['13', 0],
        vae: ['10', 0],
      },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'CANVA_STORY_FLUX2',
        images: ['8', 0],
      },
    },
    '10': {
      class_type: 'VAELoader',
      inputs: {
        vae_name: FLUX2_VAE,
      },
    },
    '12': {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: FLUX2_DIFFUSION_MODEL,
        weight_dtype: 'default',
      },
    },
    '13': {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['25', 0],
        guider: ['22', 0],
        sampler: ['16', 0],
        sigmas: ['48', 0],
        latent_image: ['47', 0],
      },
    },
    '16': {
      class_type: 'KSamplerSelect',
      inputs: {
        sampler_name: 'euler',
      },
    },
    '22': {
      class_type: 'BasicGuider',
      inputs: {
        model: [isTurbo ? '49' : '12', 0],
        conditioning: ['43', 0],
      },
    },
    '25': {
      class_type: 'RandomNoise',
      inputs: {
        noise_seed: seed,
      },
    },
    '26': {
      class_type: 'FluxGuidance',
      inputs: {
        guidance: 4,
        conditioning: ['6', 0],
      },
    },
    '38': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: FLUX2_TEXT_ENCODER,
        type: 'flux2',
        device: 'default',
      },
    },
    '39': {
      class_type: 'ReferenceLatent',
      inputs: {
        conditioning: ['26', 0],
        latent: ['40', 0],
      },
    },
    '40': {
      class_type: 'VAEEncode',
      inputs: {
        pixels: ['41', 0],
        vae: ['10', 0],
      },
    },
    '41': {
      class_type: 'ImageScaleToTotalPixels',
      inputs: {
        upscale_method: 'area',
        megapixels: 1,
        resolution_steps: 1,
        image: ['42', 0],
      },
    },
    '42': {
      class_type: 'LoadImage',
      inputs: {
        image: backgroundImageName,
      },
    },
    '43': {
      class_type: 'ReferenceLatent',
      inputs: {
        conditioning: ['39', 0],
        latent: ['44', 0],
      },
    },
    '44': {
      class_type: 'VAEEncode',
      inputs: {
        pixels: ['45', 0],
        vae: ['10', 0],
      },
    },
    '45': {
      class_type: 'ImageScaleToTotalPixels',
      inputs: {
        upscale_method: 'area',
        megapixels: 1,
        resolution_steps: 1,
        image: ['46', 0],
      },
    },
    '46': {
      class_type: 'LoadImage',
      inputs: {
        image: characterImageName,
      },
    },
    '47': {
      class_type: 'EmptyFlux2LatentImage',
      inputs: {
        width: WIDE_FRAME_WIDTH,
        height: WIDE_FRAME_HEIGHT,
        batch_size: 1,
      },
    },
    '48': {
      class_type: 'Flux2Scheduler',
      inputs: {
        steps,
        width: WIDE_FRAME_WIDTH,
        height: WIDE_FRAME_HEIGHT,
      },
    },
    ...(isTurbo
      ? {
          '49': {
            class_type: 'LoraLoaderModelOnly',
            inputs: {
              model: ['12', 0],
              lora_name: FLUX2_TURBO_LORA,
              strength_model: 1,
            },
          },
        }
      : {}),
  };
};

const buildComfyNanoBanana2LiteComposeWorkflow = (
  prompt: string,
  backgroundImageName: string,
  characterImageName: string,
) => {
  const seed = Math.floor(Math.random() * 1_000_000_000_000_000);
  return {
    '3': {
      class_type: 'GeminiNanoBanana2V2',
      inputs: {
        prompt,
        model: 'Nano Banana 2 Lite',
        'model.aspect_ratio': '16:9',
        'model.resolution': '1K',
        'model.thinking_level': 'MINIMAL',
        seed,
        response_modalities: 'IMAGE',
        system_prompt: [
          'You are an expert image-generation engine. You must ALWAYS produce an image.',
          'Interpret all user input as literal visual directives for image composition.',
          'Create the final composed story frame from the supplied reference images and prompt.',
        ].join('\n'),
        temperature: 1,
        top_p: 0.95,
        'model.images.image_1': ['8', 0],
        'model.images.image_2': ['10', 0],
      },
    },
    '4': {
      class_type: 'SaveImageAdvanced',
      inputs: {
        filename_prefix: 'CANVA_STORY_NANO_BANANA_2_LITE',
        format: 'png',
        'format.bit_depth': '8-bit',
        'format.input_color_space': 'sRGB',
        images: ['3', 0],
      },
    },
    '8': {
      class_type: 'LoadImage',
      inputs: {
        image: backgroundImageName,
      },
    },
    '10': {
      class_type: 'LoadImage',
      inputs: {
        image: characterImageName,
      },
    },
  };
};

const buildComfyNanoBanana2LiteShotGridWorkflow = (
  prompt: string,
  sourceFrameName: string,
) => {
  const seed = Math.floor(Math.random() * 1_000_000_000_000_000);
  return {
    '3': {
      class_type: 'GeminiNanoBanana2V2',
      inputs: {
        prompt,
        model: 'Nano Banana 2 Lite',
        'model.aspect_ratio': '16:9',
        'model.resolution': '1K',
        'model.thinking_level': 'MINIMAL',
        seed,
        response_modalities: 'IMAGE',
        system_prompt: [
          'You create a single exact horizontal 16:9 cinematic contact sheet from the supplied source frame.',
          'The result is a strict 2 by 2 grid whose four equal quadrants are independently usable horizontal 16:9 story frames.',
          'Preserve visual and story continuity. Follow the requested quadrant order exactly.',
          'Return an image only. Never add editorial captions, panel titles, shot names, numbers, subtitles, annotations, black text strips, borders, gutters, logos, or watermarks.',
          'Never render the wording of quadrant instructions as visible text. Text or interface elements are allowed only when they are diegetic story content explicitly required by the scene or already visible in the source frame, such as a system window, screen, sign, document, or message.',
        ].join('\n'),
        temperature: 1,
        top_p: 0.95,
        'model.images.image_1': ['8', 0],
      },
    },
    '4': {
      class_type: 'SaveImageAdvanced',
      inputs: {
        filename_prefix: 'CANVA_STORY_SCENE_SHOT_GRID',
        format: 'png',
        'format.bit_depth': '8-bit',
        'format.input_color_space': 'sRGB',
        images: ['3', 0],
      },
    },
    '8': {
      class_type: 'LoadImage',
      inputs: {
        image: sourceFrameName,
      },
    },
  };
};

const buildComfyOpenAiGptImage2LowWorkflow = (
  prompt: string,
  promptKind: Extract<ImagePromptKind, 'character_asset' | 'location_asset' | 'system_insert' | 'chapter_backdrop'>,
) => {
  const seed = Math.floor(Math.random() * 2_147_483_648);
  const imageSize = promptKind === 'character_asset' ? '1152x2048' : '2048x1152';
  return {
    '3': {
      class_type: 'OpenAIGPTImageNodeV2',
      inputs: {
        prompt,
        model: 'gpt-image-2',
        'model.size': imageSize,
        'model.custom_width': 1024,
        'model.custom_height': 1024,
        'model.background': 'opaque',
        'model.quality': 'low',
        n: 1,
        seed,
      },
    },
    '4': {
      class_type: 'SaveImageAdvanced',
      inputs: {
        filename_prefix: 'CANVA_STORY_GPT_IMAGE_2_LOW',
        format: 'png',
        'format.bit_depth': '8-bit',
        'format.input_color_space': 'sRGB',
        images: ['3', 0],
      },
    },
  };
};

export const generateComfyFlux2ComposeImage = async (
  prompt: string,
  backgroundImageUrl: string,
  characterReferences: Flux2CharacterReference[] | string,
  pipeline: Extract<ImagePipeline, 'flux2_compose' | 'flux2_turbo_compose'>,
  settings: ImageGenerationSettings,
  signal?: AbortSignal,
) => {
  const baseUrl = getComfyBaseUrl(settings.comfyEndpoint);
  let referenceBoardUrl: string | null = null;
  try {
    if (settings.provider !== 'comfyui') throw new Error('Flux2 compose работает только через ComfyUI.');
    const normalizedReferences = Array.isArray(characterReferences)
      ? characterReferences.filter((reference) => reference.imageUrl)
      : [{ imageUrl: characterReferences, label: 'character reference' }];
    if (normalizedReferences.length === 0) throw new Error('Для Flux2 нужен хотя бы один character reference.');
    const characterImageUrl = normalizedReferences.length === 1
      ? normalizedReferences[0].imageUrl
      : await createCharacterReferenceBoard(normalizedReferences, signal);
    if (normalizedReferences.length > 1) referenceBoardUrl = characterImageUrl;
    const [backgroundImageName, characterImageName] = await Promise.all([
      uploadComfyInputImage(baseUrl, backgroundImageUrl, 'canva-story-bg', signal),
      uploadComfyInputImage(baseUrl, characterImageUrl, 'canva-story-ref', signal),
    ]);
    const workflow = buildComfyFlux2ComposeWorkflow(prompt, backgroundImageName, characterImageName, pipeline);
    const clientId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `canva-story-flux2-${Date.now()}`;

    const promptResponse = await fetch(`${baseUrl}/prompt`, getComfyFetchOptions({
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createComfyPromptPayload(clientId, workflow, settings)),
    }));
    if (!promptResponse.ok) {
      throw new Error(getComfyError('ComfyUI не принял Flux2 workflow', promptResponse, await readResponseDetails(promptResponse)));
    }
    const promptData: ComfyPromptResponse = await promptResponse.json();
    if (!promptData.prompt_id) throw new Error('ComfyUI не вернул prompt_id для Flux2 workflow.');

    const image = await waitForComfyImage(baseUrl, promptData.prompt_id, COMFY_FLUX2_TIMEOUT_MS, signal);
    if (!image) throw new Error('Flux2 не вернул изображение за 6 часов. ComfyUI может ещё считать кадр, проверьте его окно и output.');

    const params = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder ?? '',
      type: image.type ?? 'output',
    });
    const viewResponse = await fetch(`${baseUrl}/view?${params.toString()}`, getComfyFetchOptions({ signal }));
    if (!viewResponse.ok) {
      throw new Error(getComfyError('ComfyUI не отдал готовое Flux2 изображение', viewResponse, await readResponseDetails(viewResponse)));
    }

    const blob = await viewResponse.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof TypeError) {
      throw new Error(`Не удалось подключиться к ComfyUI по адресу ${baseUrl}. Проверьте ComfyUI и CORS.`);
    }
    throw error;
  } finally {
    if (referenceBoardUrl) URL.revokeObjectURL(referenceBoardUrl);
  }
};

export const generateComfyNanoBanana2LiteComposeImage = async (
  prompt: string,
  backgroundImageUrl: string,
  characterReferences: Flux2CharacterReference[] | string,
  settings: ImageGenerationSettings,
  signal?: AbortSignal,
) => {
  const baseUrl = getComfyBaseUrl(settings.comfyEndpoint);
  let referenceBoardUrl: string | null = null;
  try {
    if (settings.provider !== 'comfyui') throw new Error('Nano Banana compose работает только через ComfyUI.');
    const normalizedReferences = Array.isArray(characterReferences)
      ? characterReferences.filter((reference) => reference.imageUrl)
      : [{ imageUrl: characterReferences, label: 'character reference' }];
    if (normalizedReferences.length === 0) throw new Error('Для Nano Banana нужен хотя бы один character reference.');
    const characterImageUrl = normalizedReferences.length === 1
      ? normalizedReferences[0].imageUrl
      : await createCharacterReferenceBoard(normalizedReferences, signal);
    if (normalizedReferences.length > 1) referenceBoardUrl = characterImageUrl;
    const [backgroundImageName, characterImageName] = await Promise.all([
      uploadComfyInputImage(baseUrl, backgroundImageUrl, 'canva-story-bg', signal),
      uploadComfyInputImage(baseUrl, characterImageUrl, 'canva-story-ref', signal),
    ]);
    const workflow = buildComfyNanoBanana2LiteComposeWorkflow(prompt, backgroundImageName, characterImageName);
    const clientId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `canva-story-nano-banana-${Date.now()}`;

    const promptResponse = await fetch(`${baseUrl}/prompt`, getComfyFetchOptions({
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createComfyPromptPayload(clientId, workflow, settings)),
    }));
    if (!promptResponse.ok) {
      throw new Error(getComfyError('ComfyUI не принял Nano Banana workflow', promptResponse, await readResponseDetails(promptResponse)));
    }
    const promptData: ComfyPromptResponse = await promptResponse.json();
    if (!promptData.prompt_id) throw new Error('ComfyUI не вернул prompt_id для Nano Banana workflow.');

    const image = await waitForComfyImage(baseUrl, promptData.prompt_id, COMFY_NANO_BANANA_TIMEOUT_MS, signal);
    if (!image) throw new Error('Nano Banana не вернул изображение за 45 минут. Проверьте очередь ComfyUI и output.');

    const params = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder ?? '',
      type: image.type ?? 'output',
    });
    const viewResponse = await fetch(`${baseUrl}/view?${params.toString()}`, getComfyFetchOptions({ signal }));
    if (!viewResponse.ok) {
      throw new Error(getComfyError('ComfyUI не отдал готовое Nano Banana изображение', viewResponse, await readResponseDetails(viewResponse)));
    }

    const blob = await viewResponse.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof TypeError) {
      throw new Error(`Не удалось подключиться к ComfyUI по адресу ${baseUrl}. Проверьте ComfyUI и CORS.`);
    }
    throw error;
  } finally {
    if (referenceBoardUrl) URL.revokeObjectURL(referenceBoardUrl);
  }
};

export const generateComfyNanoBanana2LiteShotGrid = async (
  prompt: string,
  sourceFrameUrl: string,
  settings: ImageGenerationSettings,
  signal?: AbortSignal,
) => {
  const baseUrl = getComfyBaseUrl(settings.comfyEndpoint);
  try {
    if (settings.provider !== 'comfyui') {
      throw new Error('Дополнительные планы Nano Banana работают только через ComfyUI API.');
    }
    const sourceFrameName = await uploadComfyInputImage(
      baseUrl,
      sourceFrameUrl,
      'canva-story-scene-shot-source',
      signal,
    );
    const workflow = buildComfyNanoBanana2LiteShotGridWorkflow(prompt, sourceFrameName);
    const clientId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `canva-story-scene-shot-grid-${Date.now()}`;
    const promptResponse = await fetch(`${baseUrl}/prompt`, getComfyFetchOptions({
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createComfyPromptPayload(clientId, workflow, settings)),
    }));
    if (!promptResponse.ok) {
      throw new Error(getComfyError(
        'ComfyUI не принял Nano Banana workflow дополнительных планов',
        promptResponse,
        await readResponseDetails(promptResponse),
      ));
    }
    const promptData: ComfyPromptResponse = await promptResponse.json();
    if (!promptData.prompt_id) throw new Error('ComfyUI не вернул prompt_id для листа дополнительных планов.');

    const image = await waitForComfyImage(baseUrl, promptData.prompt_id, COMFY_NANO_BANANA_TIMEOUT_MS, signal);
    if (!image) {
      throw new Error('Nano Banana не вернула лист дополнительных планов за 45 минут. Проверьте очередь ComfyUI.');
    }
    const params = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder ?? '',
      type: image.type ?? 'output',
    });
    const viewResponse = await fetch(`${baseUrl}/view?${params.toString()}`, getComfyFetchOptions({ signal }));
    if (!viewResponse.ok) {
      throw new Error(getComfyError(
        'ComfyUI не отдал готовый лист дополнительных планов',
        viewResponse,
        await readResponseDetails(viewResponse),
      ));
    }
    return URL.createObjectURL(await viewResponse.blob());
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof TypeError) {
      throw new Error(`Не удалось подключиться к ComfyUI по адресу ${baseUrl}. Проверьте ComfyUI и CORS.`);
    }
    throw error;
  }
};

export const generateComfyOpenAiGptImage2LowImage = async (
  prompt: string,
  promptKind: Extract<ImagePromptKind, 'character_asset' | 'location_asset' | 'system_insert' | 'chapter_backdrop'>,
  settings: ImageGenerationSettings,
  signal?: AbortSignal,
) => {
  const baseUrl = getComfyBaseUrl(settings.comfyEndpoint);
  let promptId: string | null = null;
  try {
    const workflow = buildComfyOpenAiGptImage2LowWorkflow(prompt, promptKind);
    const clientId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `canva-story-gpt-image-2-low-${Date.now()}`;

    const promptResponse = await fetch(`${baseUrl}/prompt`, getComfyFetchOptions({
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createComfyPromptPayload(clientId, workflow, settings)),
    }));
    if (!promptResponse.ok) {
      throw new Error(getComfyError(
        'ComfyUI не принял GPT Image 2 workflow',
        promptResponse,
        await readResponseDetails(promptResponse),
      ));
    }
    const promptData: ComfyPromptResponse = await promptResponse.json();
    if (!promptData.prompt_id) throw new Error('ComfyUI не вернул prompt_id для GPT Image 2.');
    promptId = promptData.prompt_id;

    const image = await waitForComfyImage(baseUrl, promptId, COMFY_PARTNER_IMAGE_TIMEOUT_MS, signal);
    if (!image) {
      await cancelComfyPrompt(baseUrl, promptId);
      throw new Error('GPT Image 2 не вернул изображение за 2 минуты. Зависшая задача снята с очереди ComfyUI.');
    }

    const params = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder ?? '',
      type: image.type ?? 'output',
    });
    const viewResponse = await fetch(`${baseUrl}/view?${params.toString()}`, getComfyFetchOptions({ signal }));
    if (!viewResponse.ok) {
      throw new Error(getComfyError(
        'ComfyUI не отдал готовое изображение GPT Image 2',
        viewResponse,
        await readResponseDetails(viewResponse),
      ));
    }

    return URL.createObjectURL(await viewResponse.blob());
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (promptId) await cancelComfyPrompt(baseUrl, promptId);
      throw error;
    }
    if (error instanceof TypeError) {
      throw new Error(`Не удалось подключиться к ComfyUI по адресу ${baseUrl}. Проверьте ComfyUI, CORS и Comfy.org API key.`);
    }
    throw error;
  }
};

const generatePollinationsImage = async (prompt: string, signal?: AbortSignal) => {
  const width = 1280;
  const height = 768;
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const encodedPrompt = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=1&private=1`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Сервис изображений вернул ошибку ${response.status}.`);
  return URL.createObjectURL(await response.blob());
};

export const generateImage = (
  prompt: string,
  pipeline: ImagePipeline,
  settings: ImageGenerationSettings,
  promptKind: ImagePromptKind = 'default',
  signal?: AbortSignal,
) => {
  if (settings.provider === 'comfyui') return generateComfyImage(prompt, pipeline, settings, promptKind, signal);
  return generatePollinationsImage(prompt, signal);
};
