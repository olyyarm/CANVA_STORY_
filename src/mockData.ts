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
  return `${role}: молодой взрослый, собранная пластика и внимательный взгляд; естественные черты лица, тёмные волосы; практичная многослойная одежда нейтральных тонов; отличительная деталь — тонкий металлический браслет.`;
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
  return `${scene} character layer, main male protagonist first if present, all relevant scene characters as separate full-body figures, head-to-toe visible, clean light studio background for easy cutout, coherent lighting matching the scene location, readable poses and emotions for the action, consistent character design, no detailed background, no text, no watermark, source context: ${request.prompt}`;
};

const createCharacterAssetPrompt = (request: GenerationRequest) =>
  `full-body character sheet, all described characters shown head-to-toe as separate figures in one lineup, neutral light studio background for clean cutout, consistent scale, clear readable silhouettes, detailed clothing and faces, production concept art, no text, no watermark, source descriptions: ${request.prompt}`;

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
