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
  const microActions = [
    'Он ударяется плечом о холодный пол, машинально трёт ушиб и понимает, что пальцы выглядят чужими.',
    'Чужой запах пряностей цепляет горло; он задерживает дыхание и отмечает, где в комнате лежит самый дорогой предмет.',
    'Мимо проносится мальчишка, пряча что-то в рукаве, и герой оценивает риск быстрее, чем успевает испугаться.',
    'Он ловит чужой взгляд и понимает: страх направлен не на него, а на то, что может случиться, если он ошибётся.',
  ];
  const professionalNotes = [
    'мысль героя сразу считает цену, риск и возможный спрос',
    'прошлая профессия превращает хаос в таблицу скрытых возможностей',
    'он ищет не чудо, а правило рынка, по которому этот мир можно понять',
    'личная слабость становится рычагом решения, а не украшением сцены',
  ];
  const loopholes = [
    'испытание: он без денег и статуса; лазейка: оценивает монеты как товарный сигнал, а не как кошелёк',
    'испытание: новый мир давит запахами и чужими правилами; лазейка: он ищет точку спроса, где все привыкли терять выгоду',
    'испытание: уличная опасность возникает быстрее объяснений; лазейка: он читает маршрут беглеца как схему рынка и преследования',
    'испытание: чужой страх делает его уязвимым; лазейка: он понимает, кто на самом деле держит риск и кому выгодна его ошибка',
  ];

  return Array.from({ length: sceneCount }, (_, index) => {
    const start = index * 6;
    const source = sentences[index % sentences.length];
    const plans = ['общий план', 'средний план', 'крупный план', 'деталь'];
    const plan = plans[index % plans.length];
    return [
      `Сцена ${index + 1}: ${formatTime(start)}–${formatTime(start + 6)}`,
      `План: ${plan}.`,
      `Действие: ${source}`,
      `Микродеталь/ощущение: ${microActions[index % microActions.length]}`,
      `Профессиональная лазейка: ${loopholes[index % loopholes.length]}.`,
      `Смысловой поворот: ${professionalNotes[index % professionalNotes.length]}.`,
      `Визуальный акцент: ${index % 2 === 0 ? 'направленный свет, рука в кадре и выразительный силуэт' : 'движение в окружении, предмет-свидетель и чужой взгляд'}.`,
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
        ? 'Он приходит в себя не героем легенды, а человеком на холодном полу, с болью в плече и чужими пальцами перед глазами.'
        : 'Каждое испытание этого мира пахнет риском, но его старая профессия всё ещё ищет лазейку там, где другие видят только беду.'}`,
      `Смысловой акцент: ${index === 0 ? 'завязка внутреннего конфликта' : 'нарастание ставки и ожидания следующего поворота'}.`,
    ].join(' '),
  ).join('\n');

const createSystemInserts = (sceneCount: number) =>
  Array.from({ length: Math.min(4, Math.max(1, sceneCount - 1)) }, (_, index) => {
    const sceneNumber = Math.min(sceneCount, index * 2 + 1);
    const types = ['Навык', 'Риск', 'Рынок', 'График'];
    const titles = ['Профессиональный рефлекс', 'Скрытая цена', 'Рыночное окно', 'Динамика доверия'];
    return [
      `После сцены ${sceneNumber}:`,
      `Тип: ${types[index % types.length]}`,
      `Заголовок: ${titles[index % titles.length]}`,
      `Текст окна: Анализ активирован. Вероятность ошибки: ${18 + index * 11}%. Скрытый ресурс найден.`,
      'Визуал: полупрозрачное янтарное окно в 3/4, тонкие линии графика, маленькая иконка профессии, тёмный чистый фон.',
      'Смысл: показать, что герой читает ситуацию как систему рисков и возможностей.',
    ].join('\n');
  }).join('\n\n');

const cleanNarrationForTts = (text: string) =>
  text
    .replace(/Сцена\s+\d+\s*:\s*/giu, '')
    .replace(/Закадровый текст\s*:\s*/giu, '')
    .replace(/Смысловой акцент\s*:[^\n]*(?:\n|$)/giu, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const createBriefRevision = (request: GenerationRequest) =>
  [
    'Манхва о регрессоре-брокере, который попадает в фэнтези-мир и превращает торговлю в способ менять устройство континента.',
    'Герой использует навыки анализа рынка, оценки риска и построения доверия, чтобы видеть в магических товарах не экзотику, а систему связей, ресурсов и власти.',
    'Каждая сцена строится как испытание, из которого он выбирается через профессиональную лазейку: старый навык становится способом выжить, заработать или обойти правило нового мира.',
    'История держится на маленьких действиях и сенсорике: холодный пол, чужие ногти, запах пряностей, случайный толчок на улице, испуганный взгляд человека, который боится не за себя.',
    'Полезная фактура встроена в сюжет через сделки, наблюдения и последствия: каждое знание становится преимуществом, конфликтом или моральным выбором.',
    `Будущая глава рассчитана на ${request.sceneCount ?? 4} сцен: пробуждение, знакомство с рынком, первая аналитическая находка, первая сделка, расширение влияния и намёк на большую стратегию.`,
  ].join(' ');

const createChapterSummary = () =>
  [
    'Глава: герой проходит первое профессиональное испытание нового мира и понимает, что прежний опыт помогает ему видеть скрытый риск раньше остальных.',
    'Введены: главный герой, торговая среда, первая системная угроза, правило доверия и цена чужих обязательств.',
    'Изменение героя: он перестает быть только растерянным попаданцем и принимает ответственность за решение, которое кому-то навредит.',
    'Крючок: кто-то воспользовался кризисом заранее, значит, катастрофа могла быть не случайностью.',
  ].join(' ');

const updateSeasonMemory = (prompt: string) =>
  [
    'Сезонная память:',
    'Герой использует профессиональный опыт как способ находить лазейки в испытаниях нового мира.',
    'Уже произошло: первая глава показала системный кризис, где маленькая аномалия превратилась в угрозу для клиентов, гильдии и доверия к рынку.',
    'Активные крючки: неизвестный участник мог знать о кризисе заранее; герой нажил врагов, потому что выбрал сохранение доверия вместо удобного сокрытия проблемы.',
    `Последнее обновление: ${prompt.slice(0, 220).replace(/\s+/g, ' ')}...`,
  ].join('\n');

const createScenePrompt = (request: GenerationRequest) => {
  const scene = request.sceneLabel || 'Scene';
  return `${scene}, cinematic visual storytelling, a clear subject performing the described action, grounded contemporary environment, expressive composition, medium-wide camera framing, subtle depth of field, soft directional dawn light, neutral charcoal and cool gray palette with one restrained amber accent, tactile realistic materials, coherent character and location details, quiet atmospheric tension, clean unlabeled frame`;
};

const createSceneLocationPrompt = (request: GenerationRequest) => {
  const scene = request.sceneLabel || 'Scene';
  return `${scene} background plate, empty location for a story scene, medium-wide establishing view, clear spatial layout with room for characters to be composited later, cinematic natural light, coherent architecture and props from the scene description, atmospheric but readable, production background concept art, clean unlabeled frame, source context: ${request.prompt}`;
};

const createSceneCharacterLayerPrompt = (request: GenerationRequest) => {
  const scene = request.sceneLabel || 'Scene';
  return `${scene} character layer, use the hero description as a strict identity bible, include characters whose listed scene numbers include the current scene, main male protagonist first if present, preserve the exact same gender, age, face, hair, silhouette, outfit, and distinctive details for the same character ID, make different character IDs clearly distinct from each other with different faces, ages, heights, body shapes, hairstyles, clothing silhouettes, color accents, and signature accessories, all relevant scene characters as separate full-body figures, full body, head-to-toe visible, entire body in frame, complete legs and head visible, clean light studio background for easy cutout, coherent lighting matching the scene location, readable poses and emotions for the action, single coherent semi-realistic illustrated production concept art style consistent with the character sheet, simple clean background, source context: ${request.prompt}`;
};

const createCharacterAssetPrompt = (request: GenerationRequest) =>
  `single vertical character reference, one described character, full-body straight front view, looking directly forward, head-to-toe visible, centered in frame, arms relaxed at the sides, stable gender, age, face, hair, silhouette, outfit, proportions, and distinctive details, reusable visual anchor phrase, neutral light studio background for clean cutout, tight useful margins, consistent scale, clear readable silhouette, single coherent semi-realistic illustrated production concept art style, complete full-body reference, source description: ${request.prompt}`;

const createLocationAssetPrompt = (request: GenerationRequest) =>
  `single canonical location reference asset, one wide establishing background plate, clear readable architecture and props, coherent lighting and palette, natural open space for future characters, production background concept art, clean unlabeled frame, source description: ${request.prompt}`;

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
    case 'narration_edit':
      return `${request.prompt}\n\nСцена ${request.sceneCount ?? 1}: Закадровый текст: Герой замечает не только новый мир, но и правило, по которому этот мир можно понять и изменить. Смысловой акцент: полезное знание становится действием и двигает конфликт.`;
    case 'brief_revision':
      return createBriefRevision(request);
    case 'chapter_summary':
      return createChapterSummary();
    case 'season_memory_update':
      return updateSeasonMemory(request.prompt);
    case 'tts_cleanup':
      return cleanNarrationForTts(request.prompt);
    case 'system_inserts':
      return createSystemInserts(request.sceneCount ?? 4);
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
