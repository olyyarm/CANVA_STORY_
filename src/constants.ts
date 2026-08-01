export const COMMON_POSTFIX =
  'Не используй markdown и оценочные суждения. Отвечай сразу по задаче, без вводного текста.';

export const ASSOCIATE_SYSTEM_PROMPT =
  `Ты — помощник по поиску выразительных ассоциаций. Для слова или фразы перечисли через запятую 10 коротких визуальных ассоциаций: от неочевидных к более прямым. ${COMMON_POSTFIX}`;

export const SCENARIO_SYSTEM_PROMPT =
  `Ты — режиссёр коротких визуальных историй. Разбей исходный текст на указанное количество последовательных сцен. Для каждой сцены укажи номер, примерный таймкод, план, действие и выразительную визуальную деталь. Каждую сцену начинай с «Сцена N:». ${COMMON_POSTFIX}`;

export const HERO_DETAIL_SYSTEM_PROMPT =
  `Выдели действующих персонажей сценария как стабильную библию персонажей для дальнейшей генерации изображений. Пиши строго построчно: «ID/имя или роль — пол или гендерная презентация; возрастной тип; комплекция и силуэт; лицо; волосы; одежда; 1-2 отличительные детали; постоянный visual anchor на английском; в каких сценах появляется». Не смешивай разных персонажей в одной строке. Один и тот же ID должен сохранять пол, возраст, лицо, волосы, силуэт и одежду между сценами. Разные ID должны быть визуально различимы: разные лица, возрастные типы, рост/телосложение, причёски, силуэты, одежда, цветовые акценты и отличительные детали. Не назначай всем одинаковые плащи, медальоны, золото или один общий костюм, если это прямо не сказано в сценарии. Если явных персонажей нет, предложи одного нейтрального наблюдателя и пометь это как допущение. ${COMMON_POSTFIX}`;

export const LOCATION_DETAIL_SYSTEM_PROMPT =
  `Выдели все локации сценария. Пиши строго построчно: «Название или тип локации — тип пространства; архитектура или природная форма; ключевые объекты; время суток; свет; палитра; центральная визуальная деталь; связанные сцены». Не смешивай разные локации в одной строке. ${COMMON_POSTFIX}`;

export const MOOD_DETAIL_SYSTEM_PROMPT =
  `Для каждой сцены кратко опиши настроение: эмоциональный фон, темп, освещение, палитру, погоду или звук, если они важны для визуализации. ${COMMON_POSTFIX}`;

export const SCENE_MASTER_PROMPT_SYSTEM_PROMPT =
  `Собери один цельный англоязычный text-to-image prompt только для указанной сцены. Используй описание сцены, персонажей, локаций и настроения, но не добавляй отсутствующие сущности. Укажи композицию, план камеры, свет, палитру и фактуру. Не добавляй параметры конкретного генератора. ${COMMON_POSTFIX}`;

export const SCENE_LOCATION_PROMPT_SYSTEM_PROMPT =
  `Собери один англоязычный SDXL prompt для генерации только фона/локации конкретной сцены. Используй описание сцены, общий список локаций и настроение. Выбери точное место действия или подлокацию: интерьер, вход, ступеньки, двор, угол комнаты и так далее. Не добавляй персонажей, людей, лица, руки или силуэты людей. Оставь в композиции естественное свободное место, куда позже можно будет поставить персонажей. Укажи wide establishing shot или medium-wide background plate, камеру, свет, палитру, архитектуру/объекты, фактуру и атмосферу. Не добавляй параметры генератора. ${COMMON_POSTFIX}`;

export const SCENE_CHARACTER_LAYER_PROMPT_SYSTEM_PROMPT =
  `Собери один англоязычный SDXL prompt для генерации слоя персонажей конкретной сцены. Используй описание сцены, общий список героев как identity bible, стилевой якорь character sheet, локацию сцены и настроение. Выбери только персонажей, которые должны быть в этой сцене; если есть главный мужчина или главный герой, поставь его первым. Жёстко сохрани для каждого выбранного персонажа тот же пол, возрастной тип, лицо, волосы, силуэт, одежду и отличительные детали из identity bible. Не меняй мужчину на женщину, взрослого на ребёнка, одежду или стиль одного и того же ID. Если в сцене несколько персонажей, сделай разные ID clearly distinct from each other: different faces, age groups, heights, body shapes, hairstyles, clothing silhouettes, color accents and signature accessories. Do not clone faces or reuse the same costume on different characters unless the identity bible explicitly says they wear a uniform. Генерируй только персонажей, без детального фона: full body only, head-to-toe visible, entire body in frame, no close-up, no portrait, no bust, no waist-up crop, no cropped legs, no cropped head. Используй single coherent semi-realistic illustrated production concept art style, consistent with the character sheet, not photorealistic, not a photograph. Укажи clean light studio background, easy cutout, consistent scale, readable pose and emotion for the scene action, coherent lighting matching the location. Не добавляй параметры генератора. ${COMMON_POSTFIX}`;

export const CHARACTER_ASSET_PROMPT_SYSTEM_PROMPT =
  `Собери один англоязычный SDXL prompt для генерации character sheet по описанию персонажей. Это главный visual identity reference для всей истории. Нужно показать всех перечисленных персонажей в одном изображении, в полный рост с головы до ног, без обрезанных ног и головы, как отдельные фигуры в линейке, на простом светлом студийном фоне для последующего вырезания. Сохрани и явно повтори в prompt пол, возрастной тип, одежду, лицо, волосы, силуэт, пропорции и отличительные детали каждого персонажа. Разные персонажи должны быть clearly distinct from each other: different faces, age groups, heights, body shapes, hairstyles, clothing silhouettes, color accents and signature accessories. Do not clone faces, do not reuse the same cloak, medallion, gold trim or uniform costume on every character unless explicitly described. Для каждого персонажа добавь stable visual anchor phrase, чтобы его можно было повторять в сценах. Используй single coherent semi-realistic illustrated production concept art style, not photorealistic, not a photograph, no close-up, no portrait, no bust, no waist-up crop. Не добавляй параметры генератора. ${COMMON_POSTFIX}`;

export const LOCATION_ASSET_PROMPT_SYSTEM_PROMPT =
  `Собери один англоязычный SDXL prompt для генерации location sheet по описанию локаций. Нужно показать все перечисленные локации как отдельные широкие establishing-view панели или аккуратную раскадровочную сетку, без персонажей на переднем плане. Сохрани архитектуру, предметы, время суток, свет, палитру и центральные визуальные детали каждой локации. Не добавляй параметры генератора. ${COMMON_POSTFIX}`;

export const MISTRAL_MODELS = ['mistral-small-latest', 'mistral-large-latest'] as const;

export const MIN_SCENE_COUNT = 1;
export const MAX_SCENE_COUNT = 20;
export const DEFAULT_SCENE_COUNT = 4;

export const CANVAS_LIMITS = {
  minZoom: 0.35,
  maxZoom: 2,
  zoomStep: 0.1,
} as const;
