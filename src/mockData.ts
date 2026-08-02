import { GenerationRequest } from './types';

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

const splitSentences = (text: string) => {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const sentences = cleanText.split(/(?<=[.!?…])\s+/u).filter(Boolean);
  return sentences.length > 0 ? sentences : [cleanText || 'Визуальное действие развивается в кадре.'];
};

const formatTime = (seconds: number) => `0:${String(seconds).padStart(2, '0')}`;

const createScenario = (request: GenerationRequest) => {
  const sceneCount = Math.max(1, request.sceneCount ?? 4);
  const sentences = splitSentences(request.prompt);

  return Array.from({ length: sceneCount }, (_, index) => {
    const start = index * 6;
    const source = sentences[index % sentences.length];
    const plans = ['общий план', 'средний план', 'крупный план', 'деталь'];
    const plan = plans[index % plans.length];
    return [
      `Сцена ${index + 1}: ${formatTime(start)}–${formatTime(start + 6)}`,
      `План: ${plan}.`,
      `Действие: ${source}`,
      `Визуальный акцент: ${index % 2 === 0 ? 'направленный свет и выразительный силуэт' : 'движение камеры и деталь окружения'}.`,
    ].join('\n');
  }).join('\n\n');
};

const createAssociations = (prompt: string) => {
  const subject = prompt.trim() || 'образ';
  return [
    `эхо «${subject}»`,
    'след на запотевшем стекле',
    'световой разлом',
    'бумажная карта памяти',
    'тишина перед движением',
    'контраст масштаба',
    'отражение вне кадра',
    'случайный ритм теней',
    'предмет-свидетель',
    'повторяющийся цветовой мотив',
  ].join(', ');
};

const createHeroes = (prompt: string) => {
  const feminine = /девуш|женщ|героин|(?:^|\s)(?:она|лера)(?=\s|[.,!?;:]|$)/iu.test(prompt);
  const role = feminine ? 'Главная героиня' : 'Главный герой';
  const gender = feminine ? 'женщина' : 'мужчина';
  const anchor = feminine
    ? 'same young woman, dark bob hair, layered charcoal jacket, thin metal bracelet'
    : 'same young man, dark short hair, layered charcoal jacket, thin metal bracelet';
  return `${role} — ${gender}; молодой взрослый; собранная пластика и стройный узнаваемый силуэт; естественные черты лица и внимательный взгляд; тёмные волосы; практичная многослойная одежда нейтральных тонов; отличительная деталь — тонкий металлический браслет; visual anchor: ${anchor}; появляется во всех ключевых сценах.`;
};

const createLocations = (prompt: string) => {
  if (/балкон/iu.test(prompt)) {
    return 'Городской балкон: компактная бетонная площадка с металлическим ограждением, раннее утро, мягкий боковой свет, холодно-серая палитра с тёплым солнечным акцентом; центральная деталь — бумажный предмет на перилах.';
  }
  return 'Основная локация: лаконичное современное пространство, несколько предметов с ясным силуэтом, рассеянный естественный свет, нейтральная палитра; центральная деталь поддерживает действие сцены.';
};

const createMood = (sceneCount: number) =>
  Array.from({ length: sceneCount }, (_, index) =>
    `Сцена ${index + 1}: ${index === 0 ? 'тихое ожидание' : 'нарастающее любопытство'}, спокойный темп, мягкий контраст, приглушённые холодные оттенки и один тёплый световой акцент.`,
  ).join('\n');

const createNarration = (sceneCount: number) =>
  Array.from({ length: sceneCount }, (_, index) =>
    [
      `Сцена ${index + 1}:`,
      `Закадровый текст: ${index === 0
        ? 'Иногда история начинается не с громкого события, а с маленького выбора, который уже нельзя отменить.'
        : 'Каждый следующий шаг делает прежний мир менее надёжным, и герой начинает понимать цену своего решения.'}`,
      `Смысловой акцент: ${index === 0 ? 'завязка внутреннего конфликта' : 'нарастание ставки и ожидания следующего поворота'}.`,
    ].join(' '),
  ).join('\n');

const createScenePrompt = (request: GenerationRequest) => {
  const scene = request.sceneLabel || 'Scene';
  return `${scene}, cinematic visual storytelling, a clear subject performing the described action, grounded contemporary environment, expressive composition, medium-wide camera framing, subtle depth of field, soft directional dawn light, neutral charcoal and cool gray palette with one restrained amber accent, tactile realistic materials, coherent character and location details, quiet atmospheric tension, no text, no watermark`;
};

const createSceneLocationPrompt = (request: GenerationRequest) => {
  const scene = request.sceneLabel || 'Scene';
  return `${scene} background plate, empty location for a story scene, no people, no characters, medium-wide establishing view, clear spatial layout with room for characters to be composited later, cinematic natural light, coherent architecture and props from the scene description, atmospheric but readable, production background concept art, no text, no watermark, source context: ${request.prompt}`;
};

const createSceneCharacterLayerPrompt = (request: GenerationRequest) => {
  const scene = request.sceneLabel || 'Scene';
  return `${scene} character layer, use the hero description as a strict identity bible, include only characters whose listed scene numbers include the current scene, main male protagonist first if present, preserve the exact same gender, age, face, hair, silhouette, outfit, and distinctive details for the same character ID, make different character IDs clearly distinct from each other with different faces, ages, heights, body shapes, hairstyles, clothing silhouettes, color accents, and signature accessories, no cloned faces, no identical outfits, all relevant scene characters as separate full-body figures, full body only, head-to-toe visible, entire body in frame, no close-up, no portrait, no bust, no waist-up crop, no cropped legs, clean light studio background for easy cutout, coherent lighting matching the scene location, readable poses and emotions for the action, single coherent semi-realistic illustrated production concept art style consistent with the character sheet, not photorealistic, not a photograph, no detailed background, no text, no watermark, source context: ${request.prompt}`;
};

const createCharacterAssetPrompt = (request: GenerationRequest) =>
  `single character reference sheet, one described character only, full-body front view, side view and back view of the same character, head-to-toe visible, stable gender, age, face, hair, silhouette, outfit, proportions, and distinctive details, reusable visual anchor phrase, neutral light studio background for clean cutout, consistent scale, clear readable silhouette, single coherent semi-realistic illustrated production concept art style, not photorealistic, not a photograph, no close-up, no portrait, no bust, no waist-up crop, no other characters, no text, no watermark, source description: ${request.prompt}`;

const createLocationAssetPrompt = (request: GenerationRequest) =>
  `location sheet, all described locations shown as separate wide establishing-view panels, no foreground characters, clear architecture and props, coherent lighting and palette, production background concept art, no text, no watermark, source descriptions: ${request.prompt}`;

export const createMockCompletion = async (request: GenerationRequest, signal?: AbortSignal) => {
  await wait(450, signal);

  switch (request.operation) {
    case 'associations':
      return createAssociations(request.prompt);
    case 'scenario':
      return createScenario(request);
    case 'heroes':
      return createHeroes(request.prompt);
    case 'locations':
      return createLocations(request.prompt);
    case 'mood':
      return createMood(request.sceneCount ?? 4);
    case 'narration':
      return createNarration(request.sceneCount ?? 4);
    case 'scene_prompt':
      return createScenePrompt(request);
    case 'scene_location_prompt':
      return createSceneLocationPrompt(request);
    case 'scene_character_layer_prompt':
      return createSceneCharacterLayerPrompt(request);
    case 'character_asset_prompt':
      return createCharacterAssetPrompt(request);
    case 'location_asset_prompt':
      return createLocationAssetPrompt(request);
  }
};
