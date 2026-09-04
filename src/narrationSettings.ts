import {
  AssetReference,
  ElevenLabsModel,
  ElevenLabsOutputFormat,
  ElevenLabsTextNormalization,
  NarrationSettings,
  NarrationProvider,
  OmniVoiceModel,
  OmniVoiceMode,
  OmniVoiceQuality,
} from './types';

export const OMNIVOICE_DEFAULT_VOICE_INSTRUCT =
  'male, middle-aged, very low pitch';
export const OMNIVOICE_MAX_SEED = 2_147_483_647;
export const ELEVENLABS_MAX_SEED = 4_294_967_295;

export const ELEVENLABS_MODEL_OPTIONS: Array<{
  value: ElevenLabsModel;
  label: string;
  usdPerThousandCharacters: number;
}> = [
  { value: 'eleven_multilingual_v2', label: 'Multilingual v2 · стабильная длинная речь', usdPerThousandCharacters: 0.10 },
  { value: 'eleven_v3', label: 'Eleven v3 · максимальная выразительность', usdPerThousandCharacters: 0.10 },
  { value: 'eleven_flash_v2_5', label: 'Flash v2.5 · экономный режим', usdPerThousandCharacters: 0.05 },
];

export const ELEVENLABS_OUTPUT_FORMAT_OPTIONS: Array<{
  value: ElevenLabsOutputFormat;
  label: string;
}> = [
  { value: 'mp3_44100_128', label: 'MP3 · 44.1 кГц · 128 кбит/с' },
  { value: 'mp3_22050_32', label: 'MP3 · 22.05 кГц · 32 кбит/с' },
  { value: 'mp3_44100_192', label: 'MP3 · 44.1 кГц · 192 кбит/с (может требовать Creator)' },
  { value: 'pcm_44100', label: 'PCM/WAV · 44.1 кГц (может требовать Pro)' },
];

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

const isNarrationProvider = (value: unknown): value is NarrationProvider =>
  value === 'omnivoice' || value === 'elevenlabs';

const isElevenLabsModel = (value: unknown): value is ElevenLabsModel =>
  value === 'eleven_multilingual_v2' || value === 'eleven_v3' || value === 'eleven_flash_v2_5';

const isElevenLabsTextNormalization = (value: unknown): value is ElevenLabsTextNormalization =>
  value === 'auto' || value === 'on' || value === 'off';

const isElevenLabsOutputFormat = (value: unknown): value is ElevenLabsOutputFormat =>
  value === 'mp3_22050_32'
  || value === 'mp3_44100_128'
  || value === 'mp3_44100_192'
  || value === 'pcm_44100';

const clampNumber = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;

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
  provider: 'omnivoice',
  mode: 'design',
  model: 'OmniVoice-bf16',
  quality: 'fast',
  speed: 0.9,
  seed: createSeed(),
  voiceInstruct: OMNIVOICE_DEFAULT_VOICE_INSTRUCT,
  pronunciationDictionary: '',
  elevenLabs: {
    voiceId: '',
    model: 'eleven_multilingual_v2',
    speed: 0.9,
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0,
    useSpeakerBoost: true,
    applyTextNormalization: 'auto',
    languageCode: 'ru',
    seed: createSeed(),
    outputFormat: 'mp3_44100_128',
    pronunciationDictionaryId: '',
    pronunciationDictionaryVersionId: '',
  },
});

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const normalizePronunciation = (value: string) => value
  .replace(/\+([аеёиоуыэюя])/giu, '$1\u0301')
  .normalize('NFC');

const preserveReplacementCase = (source: string, replacement: string) => {
  if (source === source.toLocaleUpperCase('ru')) return replacement.toLocaleUpperCase('ru');
  const firstCharacter = [...source][0] ?? '';
  if (firstCharacter && firstCharacter === firstCharacter.toLocaleUpperCase('ru')) {
    const replacementCharacters = [...replacement];
    if (replacementCharacters[0]) {
      replacementCharacters[0] = replacementCharacters[0].toLocaleUpperCase('ru');
    }
    return replacementCharacters.join('');
  }
  return replacement;
};

export const applyPronunciationDictionary = (text: string, dictionary = '') => {
  const entries = dictionary
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) return null;
      const source = line.slice(0, separatorIndex).trim().normalize('NFC');
      const replacement = normalizePronunciation(line.slice(separatorIndex + 1).trim());
      return source && replacement ? { source, replacement } : null;
    })
    .filter((entry): entry is { source: string; replacement: string } => Boolean(entry))
    .sort((left, right) => right.source.length - left.source.length);

  return entries.reduce((result, entry) => {
    const pattern = new RegExp(
      '(?<![\\p{L}\\p{N}_])' + escapeRegExp(entry.source) + '(?![\\p{L}\\p{N}_])',
      'giu',
    );
    return result.replace(pattern, (match) => preserveReplacementCase(match, entry.replacement));
  }, text).normalize('NFC');
};

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
  const elevenLabsData = isRecord(data.elevenLabs) ? data.elevenLabs : {};
  const elevenLabsFallback = fallback.elevenLabs;
  return {
    provider: isNarrationProvider(data.provider) ? data.provider : fallback.provider,
    mode: isOmniVoiceMode(data.mode) ? data.mode : fallback.mode,
    model: isOmniVoiceModel(data.model) ? data.model : fallback.model,
    quality: isOmniVoiceQuality(data.quality) ? data.quality : fallback.quality,
    speed: clampNumber(data.speed, fallback.speed, 0.5, 2),
    seed,
    voiceInstruct,
    pronunciationDictionary: typeof data.pronunciationDictionary === 'string'
      ? data.pronunciationDictionary.slice(0, 12_000)
      : fallback.pronunciationDictionary,
    ...(referenceAudio ? { referenceAudio } : {}),
    ...(typeof data.referenceFileName === 'string' && data.referenceFileName.trim()
      ? { referenceFileName: data.referenceFileName.trim().slice(0, 260) }
      : {}),
    ...(typeof data.referenceText === 'string' && data.referenceText.trim()
      ? { referenceText: data.referenceText.trim().slice(0, 4_000) }
      : {}),
    elevenLabs: {
      voiceId: typeof elevenLabsData.voiceId === 'string'
        ? elevenLabsData.voiceId.trim().slice(0, 160)
        : elevenLabsFallback.voiceId,
      model: isElevenLabsModel(elevenLabsData.model)
        ? elevenLabsData.model
        : elevenLabsFallback.model,
      speed: clampNumber(elevenLabsData.speed, elevenLabsFallback.speed, 0.7, 1.2),
      stability: clampNumber(elevenLabsData.stability, elevenLabsFallback.stability, 0, 1),
      similarityBoost: clampNumber(elevenLabsData.similarityBoost, elevenLabsFallback.similarityBoost, 0, 1),
      style: clampNumber(elevenLabsData.style, elevenLabsFallback.style, 0, 1),
      useSpeakerBoost: typeof elevenLabsData.useSpeakerBoost === 'boolean'
        ? elevenLabsData.useSpeakerBoost
        : elevenLabsFallback.useSpeakerBoost,
      applyTextNormalization: isElevenLabsTextNormalization(elevenLabsData.applyTextNormalization)
        ? elevenLabsData.applyTextNormalization
        : elevenLabsFallback.applyTextNormalization,
      languageCode: typeof elevenLabsData.languageCode === 'string'
        ? elevenLabsData.languageCode.trim().toLowerCase().slice(0, 12)
        : elevenLabsFallback.languageCode,
      seed: Math.floor(clampNumber(elevenLabsData.seed, elevenLabsFallback.seed, 0, ELEVENLABS_MAX_SEED)),
      outputFormat: isElevenLabsOutputFormat(elevenLabsData.outputFormat)
        ? elevenLabsData.outputFormat
        : elevenLabsFallback.outputFormat,
      pronunciationDictionaryId: typeof elevenLabsData.pronunciationDictionaryId === 'string'
        ? elevenLabsData.pronunciationDictionaryId.trim().slice(0, 180)
        : elevenLabsFallback.pronunciationDictionaryId,
      pronunciationDictionaryVersionId: typeof elevenLabsData.pronunciationDictionaryVersionId === 'string'
        ? elevenLabsData.pronunciationDictionaryVersionId.trim().slice(0, 180)
        : elevenLabsFallback.pronunciationDictionaryVersionId,
    },
  };
};

export const prepareNarrationText = (text: string, settings: NarrationSettings) => {
  const cleaned = text.trim().normalize('NFC');
  if (settings.provider === 'omnivoice' || settings.elevenLabs.model === 'eleven_multilingual_v2') {
    return applyPronunciationDictionary(cleaned, settings.pronunciationDictionary);
  }
  return cleaned;
};

export const getElevenLabsUsdPerThousandCharacters = (model: ElevenLabsModel) =>
  ELEVENLABS_MODEL_OPTIONS.find((option) => option.value === model)?.usdPerThousandCharacters ?? 0.10;

export const estimateElevenLabsCostUsd = (characterCount: number, model: ElevenLabsModel) =>
  (Math.max(0, characterCount) / 1_000) * getElevenLabsUsdPerThousandCharacters(model);

export const getOmniVoiceSteps = (quality: OmniVoiceQuality) =>
  OMNIVOICE_QUALITY_OPTIONS.find((option) => option.value === quality)?.steps ?? 32;

export const getNextNarrationSeed = (seed: number) => {
  const current = Math.min(OMNIVOICE_MAX_SEED, Math.max(1, Math.floor(seed)));
  const next = (Math.imul(current, 1_103_515_245) + 12_345) & OMNIVOICE_MAX_SEED;
  return Math.max(1, next);
};
