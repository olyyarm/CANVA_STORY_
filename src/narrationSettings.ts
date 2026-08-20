import {
  AssetReference,
  NarrationSettings,
  OmniVoiceModel,
  OmniVoiceMode,
  OmniVoiceQuality,
} from './types';

export const OMNIVOICE_DEFAULT_VOICE_INSTRUCT =
  'male, middle-aged, very low pitch';
export const OMNIVOICE_MAX_SEED = 2_147_483_647;

export const OMNIVOICE_NARRATOR_PRESETS = [
  {
    value: OMNIVOICE_DEFAULT_VOICE_INSTRUCT,
    label: 'Фактурный · зрелый · очень низкий',
  },
  {
    value: 'male, middle-aged, low pitch',
    label: 'Фактурный · зрелый · низкий',
  },
  {
    value: 'male, elderly, very low pitch',
    label: 'Фактурный · возрастной · очень низкий',
  },
  {
    value: 'male, elderly, low pitch',
    label: 'Фактурный · возрастной · низкий',
  },
] as const;

const OMNIVOICE_VALID_ENGLISH_INSTRUCT_TAGS = new Set([
  'male',
  'female',
  'child',
  'teenager',
  'young adult',
  'middle-aged',
  'elderly',
  'very low pitch',
  'low pitch',
  'moderate pitch',
  'high pitch',
  'very high pitch',
  'whisper',
  'american accent',
  'british accent',
  'australian accent',
  'chinese accent',
  'canadian accent',
  'indian accent',
  'korean accent',
  'portuguese accent',
  'russian accent',
  'japanese accent',
]);

const OMNIVOICE_EXCLUSIVE_INSTRUCT_CATEGORIES = [
  new Set(['male', 'female']),
  new Set(['child', 'teenager', 'young adult', 'middle-aged', 'elderly']),
  new Set(['very low pitch', 'low pitch', 'moderate pitch', 'high pitch', 'very high pitch']),
  new Set(['whisper']),
  new Set([
    'american accent',
    'british accent',
    'australian accent',
    'chinese accent',
    'canadian accent',
    'indian accent',
    'korean accent',
    'portuguese accent',
    'russian accent',
    'japanese accent',
  ]),
];

const OMNIVOICE_LEGACY_NARRATOR_INSTRUCTS = new Set([
  'male, middle-aged, low pitch',
  'male, middle-aged, low pitch, russian accent',
]);

export const OMNIVOICE_MODEL_OPTIONS: Array<{ value: OmniVoiceModel; label: string }> = [
  { value: 'OmniVoice-bf16', label: 'Быстрая · BF16 · ≈ 2 ГБ' },
  { value: 'OmniVoice', label: 'Качественная · FP32 · ≈ 4 ГБ' },
];

export const OMNIVOICE_QUALITY_OPTIONS: Array<{
  value: OmniVoiceQuality;
  label: string;
  steps: 32 | 48 | 64;
}> = [
  { value: 'fast', label: 'Быстро · 32 шага', steps: 32 },
  { value: 'balanced', label: 'Точно · 48 шагов', steps: 48 },
  { value: 'quality', label: 'Максимум · 64 шага', steps: 64 },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isOmniVoiceMode = (value: unknown): value is OmniVoiceMode =>
  value === 'design' || value === 'clone';

const isOmniVoiceModel = (value: unknown): value is OmniVoiceModel =>
  value === 'OmniVoice-bf16' || value === 'OmniVoice';

const isOmniVoiceQuality = (value: unknown): value is OmniVoiceQuality =>
  value === 'fast' || value === 'balanced' || value === 'quality';

const createSeed = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return Math.max(1, values[0] % OMNIVOICE_MAX_SEED);
  }
  return Math.max(1, Date.now() % OMNIVOICE_MAX_SEED);
};

const normalizeOmniVoiceInstruct = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const tags = value
    .split(/[,，]/u)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  if (tags.length === 0 || tags.some((tag) => !OMNIVOICE_VALID_ENGLISH_INSTRUCT_TAGS.has(tag))) {
    return null;
  }
  const tagsWithoutRussianAccent = tags.filter((tag) => tag !== 'russian accent');
  if (tagsWithoutRussianAccent.length === 0) return null;
  const hasConflict = OMNIVOICE_EXCLUSIVE_INSTRUCT_CATEGORIES.some((category) =>
    tagsWithoutRussianAccent.filter((tag) => category.has(tag)).length > 1,
  );
  if (hasConflict) return null;
  return tagsWithoutRussianAccent.join(', ');
};

export const isOmniVoiceNarratorPreset = (value: string) =>
  OMNIVOICE_NARRATOR_PRESETS.some((preset) => preset.value === value);

export const getRandomOmniVoiceNarratorPreset = (currentValue: string) => {
  const candidates = OMNIVOICE_NARRATOR_PRESETS.filter((preset) => preset.value !== currentValue);
  if (candidates.length === 0) return OMNIVOICE_NARRATOR_PRESETS[0];
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return candidates[values[0] % candidates.length];
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
};

export const createDefaultNarrationSettings = (): NarrationSettings => ({
  mode: 'design',
  model: 'OmniVoice-bf16',
  quality: 'fast',
  seed: createSeed(),
  voiceInstruct: OMNIVOICE_DEFAULT_VOICE_INSTRUCT,
});

export const sanitizeNarrationSettings = (
  value: unknown,
  referenceAudio?: AssetReference,
): NarrationSettings => {
  const fallback = createDefaultNarrationSettings();
  const data = isRecord(value) ? value : {};
  const seed = typeof data.seed === 'number' && Number.isFinite(data.seed)
    ? Math.min(OMNIVOICE_MAX_SEED, Math.max(1, Math.floor(data.seed)))
    : fallback.seed;
  const normalizedVoiceInstruct = normalizeOmniVoiceInstruct(data.voiceInstruct);
  const voiceInstruct = normalizedVoiceInstruct
    && !OMNIVOICE_LEGACY_NARRATOR_INSTRUCTS.has(normalizedVoiceInstruct)
    ? normalizedVoiceInstruct
    : fallback.voiceInstruct;
  return {
    mode: isOmniVoiceMode(data.mode) ? data.mode : fallback.mode,
    model: isOmniVoiceModel(data.model) ? data.model : fallback.model,
    quality: isOmniVoiceQuality(data.quality) ? data.quality : fallback.quality,
    seed,
    voiceInstruct,
    ...(referenceAudio ? { referenceAudio } : {}),
    ...(typeof data.referenceFileName === 'string' && data.referenceFileName.trim()
      ? { referenceFileName: data.referenceFileName.trim().slice(0, 260) }
      : {}),
    ...(typeof data.referenceText === 'string' && data.referenceText.trim()
      ? { referenceText: data.referenceText.trim().slice(0, 4_000) }
      : {}),
  };
};

export const getOmniVoiceSteps = (quality: OmniVoiceQuality) =>
  OMNIVOICE_QUALITY_OPTIONS.find((option) => option.value === quality)?.steps ?? 32;

export const getNextNarrationSeed = (seed: number) => {
  const current = Math.min(OMNIVOICE_MAX_SEED, Math.max(1, Math.floor(seed)));
  const next = (Math.imul(current, 1_103_515_245) + 12_345) & OMNIVOICE_MAX_SEED;
  return Math.max(1, next);
};
