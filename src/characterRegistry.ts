import { NodeData, NodesState } from './types';

const stripSceneCharacterRolePrefix = (value: string) => {
  const stripped = value.replace(/^(?:\u043f\u0440\u0430\u0447\u043a\u0430|\u0448\u0430\u0445\u0442\u0435\u0440|\u043c\u0430\u0441\u0442\u0435\u0440|\u043f\u043e\u0440\u0442\u043d\u0438\u043a|\u0433\u0435\u0440\u043e\u0439|\u043f\u0440\u043e\u0442\u0430\u0433\u043e\u043d\u0438\u0441\u0442|miner|washer|master|tailor|hero|protagonist)\s+/iu, '').trim();
  if (!stripped || /^(?:\u0448\u0430\u0445\u0442\u044b|\u0440\u044b\u043d\u043a\u0430|\u0433\u0438\u043b\u044c\u0434\u0438\u0438|mine|market|guild)$/iu.test(stripped)) {
    return value;
  }
  return stripped;
};

const transliterateRuToLatin = (value: string) => {
  const map: Record<string, string> = {
    '\u0430': 'a', '\u0431': 'b', '\u0432': 'v', '\u0433': 'g', '\u0434': 'd', '\u0435': 'e', '\u0451': 'e',
    '\u0436': 'zh', '\u0437': 'z', '\u0438': 'i', '\u0439': 'y', '\u043a': 'k', '\u043b': 'l', '\u043c': 'm',
    '\u043d': 'n', '\u043e': 'o', '\u043f': 'p', '\u0440': 'r', '\u0441': 's', '\u0442': 't', '\u0443': 'u',
    '\u0444': 'f', '\u0445': 'h', '\u0446': 'ts', '\u0447': 'ch', '\u0448': 'sh', '\u0449': 'sch', '\u044a': '',
    '\u044b': 'y', '\u044c': '', '\u044d': 'e', '\u044e': 'yu', '\u044f': 'ya',
  };
  return [...value.toLocaleLowerCase('ru')].map((char) => map[char] ?? char).join('');
};

export const CHARACTER_REGISTRY_SOURCE_KIND = 'character_registry';

export interface CharacterRegistryEntry {
  tag: string;
  name: string;
  assetNodeId: string;
  aliases?: string[];
  description?: string;
  updatedAt?: string;
}

const registryTagPattern = /@[A-ZА-ЯЁ0-9_]+/giu;

const getAssetKind = (node?: NodeData) =>
  typeof node?.metadata?.assetKind === 'string' ? node.metadata.assetKind : '';

export const isCharacterAssetNode = (node?: NodeData): node is NodeData & { nodeType: 'pollinations_image' } =>
  Boolean(node?.nodeType === 'pollinations_image' && getAssetKind(node).startsWith('character_asset'));

export const normalizeCharacterTag = (value: string) => {
  const body = value
    .trim()
    .replace(/^@/u, '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .toLocaleUpperCase('ru');
  return body ? `@${body}` : '';
};

export const createCharacterTag = (name: string, fallback = 'CHARACTER') =>
  normalizeCharacterTag(name || fallback);

const splitCharacterAliasParts = (value: string) =>
  value
    .replace(/^@/u, '')
    .split(/[/|]/u)
    .map((part) => part.trim())
    .filter(Boolean);

const getLooseLatinNameVariants = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || /[^a-z0-9_@/\s|-]/iu.test(trimmed)) return [trimmed].filter(Boolean);

  const variants = new Set([trimmed]);
  variants.add(trimmed.replace(/th/giu, 't'));
  variants.add(trimmed.replace(/\bmarta\b/giu, 'martha'));
  variants.add(trimmed.replace(/@marta\b/giu, '@martha'));
  variants.add(trimmed.replace(/\bmartha\b/giu, 'marta'));
  variants.add(trimmed.replace(/@martha\b/giu, '@marta'));
  return [...variants].filter(Boolean);
};

const getCharacterAliasCandidates = (value: string) => {
  const cleanValue = value
    .replace(/\([^)]*\)/gu, '')
    .replace(/^\s*[^@,\n;]+\/\s*/u, '')
    .replace(/^[\s\d.)-]+/gu, '')
    .replace(/[.:-]\s*$/gu, '')
    .trim();
  const candidates = new Set<string>();
  [
    value,
    cleanValue,
    stripSceneCharacterRolePrefix(cleanValue),
    ...splitCharacterAliasParts(value),
    ...splitCharacterAliasParts(cleanValue),
  ].forEach((candidate) => {
    const trimmed = candidate.trim();
    if (!trimmed) return;
    candidates.add(trimmed);
    const stripped = stripSceneCharacterRolePrefix(trimmed);
    if (stripped) candidates.add(stripped);
  });
  return [...candidates];
};

const addCharacterTagVariant = (tags: Set<string>, value: string, fallback: string) => {
  const tag = createCharacterTag(value, fallback);
  if (!tag) return;
  tags.add(tag);

  const body = tag.slice(1);
  const base = body.replace(/_(?:MODERN|FANTASY|PAST|FUTURE|YOUNG|OLD|CHILD|ADULT)$/u, '');
  if (base && base !== body) tags.add(`@${base}`);
};

export const createCharacterTagVariants = (name: string, fallback = 'CHARACTER') => {
  const tags = new Set<string>();
  const candidates = getCharacterAliasCandidates(name)
    .flatMap((candidate) => [
      candidate,
      transliterateRuToLatin(candidate),
      ...splitCharacterAliasParts(candidate),
      ...splitCharacterAliasParts(transliterateRuToLatin(candidate)),
    ])
    .flatMap(getLooseLatinNameVariants);

  candidates.forEach((candidate) => addCharacterTagVariant(tags, candidate, fallback));
  return [...tags];
};

export const getCharacterAliasCandidatesFromDescription = (description: string, index = 0) => {
  const firstLine = description.split(/\n/)[0]?.trim() || '';
  const name = getCharacterNameFromDescription(description, index);
  return [...new Set([
    name,
    ...getCharacterAliasCandidates(name),
    ...getCharacterAliasCandidates(firstLine),
    ...extractCharacterTags(description),
  ].filter(Boolean))];
};

export const getCharacterTagVariantsFromDescription = (description: string, index = 0) =>
  [...new Set(getCharacterAliasCandidatesFromDescription(description, index)
    .flatMap((candidate) => createCharacterTagVariants(candidate))
    .filter(Boolean))];

export const getCharacterNameFromDescription = (description: string, index = 0) => {
  const firstLine = description.split(/\n/)[0]?.trim() || '';
  const normalized = firstLine
    .replace(/^\d+[.)]\s*/u, '')
    .replace(/^ID\/Имя или роль\s*[—–-]\s*/iu, '')
    .replace(/^ID\/Имя или роль\s*—\s*/iu, '')
    .split(/\s*[—–-]\s*/u)[0]
    ?.replace(/[;:,.]+$/u, '')
    .trim();
  return (normalized || `Персонаж ${index + 1}`).slice(0, 48);
};

export const getCharacterDescriptions = (heroesText: string) =>
  heroesText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^персонажи не выявлены\b/iu.test(line));

export const extractCharacterTags = (text: string) =>
  [...new Set((text.match(registryTagPattern) ?? [])
    .map(normalizeCharacterTag)
    .filter(Boolean))];

export const extractSceneCharacterNames = (text: string) => {
  const sections = [...text.matchAll(/(?:^|\n)\s*(?:Персонажи|Characters)\s*:\s*([\s\S]*?)(?=\n\s*(?:[А-ЯЁA-Z][^:\n]{0,72}:)|$)/giu)];
  return [...new Set(sections
    .flatMap((match) => (match[1] ?? '').split(/[,;\n]+/u))
    .map((value) => stripSceneCharacterRolePrefix(value
      .replace(/\([^)]*\)/gu, '')
      .replace(/^\s*[^@,\n;]+\/\s*/u, '')
      .replace(/^[\s\d.)-]+/gu, '')
      .replace(/[.:-]\s*$/gu, '')
      .trim()).trim())
    .filter((value) =>
      value.length > 1
      && value.length <= 48
      && !/^(нет|none|unknown|не указан[ао]?|неизвестно)$/iu.test(value)))];
};

export const extractRequiredCharacterTags = (text: string) =>
  [...new Set([
    ...extractCharacterTags(text),
    ...extractSceneCharacterNames(text).map((name) => createCharacterTag(name)).filter(Boolean),
  ])];

const extractExplicitCharacterTagSection = (text: string) => {
  const match = text.match(/(?:^|\n)\s*(?:Character tags|Теги персонажей|Персонажные теги)\s*:\s*([\s\S]*?)(?=\n\s*(?:[\p{Lu}\p{Lt}А-ЯЁA-Z][^:\n]{0,72}:)|$)/u);
  return match ? extractCharacterTags(match[1] ?? '') : [];
};

export const extractRequiredCharacterTagGroups = (text: string) => {
  const explicitTags = extractExplicitCharacterTagSection(text);
  if (explicitTags.length > 0) {
    return explicitTags
      .map((tag) => createCharacterTagVariants(tag))
      .map((group) => [...new Set(group.filter(Boolean))])
      .filter((group) => group.length > 0);
  }

  return [
    ...extractCharacterTags(text).map((tag) => createCharacterTagVariants(tag)),
    ...extractSceneCharacterNames(text).map((name) => createCharacterTagVariants(name)),
  ].map((group) => [...new Set(group.filter(Boolean))]).filter((group) => group.length > 0);
};

const parseJsonEntries = (value: unknown): CharacterRegistryEntry[] => {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    const entries: CharacterRegistryEntry[] = [];
    parsed.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const candidate = entry as Record<string, unknown>;
      const tag = typeof candidate.tag === 'string' ? normalizeCharacterTag(candidate.tag) : '';
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : tag;
      const assetNodeId = typeof candidate.assetNodeId === 'string' ? candidate.assetNodeId.trim() : '';
      if (!tag || !assetNodeId) return;
      entries.push({
        tag,
        name: name || tag,
        assetNodeId,
        aliases: Array.isArray(candidate.aliases)
          ? candidate.aliases.filter((alias): alias is string => typeof alias === 'string')
          : undefined,
        description: typeof candidate.description === 'string' ? candidate.description : undefined,
        updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : undefined,
      });
    });
    return entries;
  } catch {
    return [];
  }
};

export const parseCharacterRegistryEntries = (registryNode?: NodeData) =>
  parseJsonEntries(registryNode?.metadata?.characterRegistryJson);

export const serializeCharacterRegistryEntries = (entries: CharacterRegistryEntry[]) =>
  JSON.stringify(entries, null, 2);

export const formatCharacterRegistryText = (entries: CharacterRegistryEntry[]) =>
  entries.length > 0
    ? entries
      .map((entry, index) => [
        `${index + 1}. ${entry.tag} — ${entry.name}`,
        `asset: ${entry.assetNodeId}`,
        entry.description ? `description: ${entry.description}` : '',
      ].filter(Boolean).join('\n'))
      .join('\n\n')
    : 'Пока нет канонических персонажей.\n\nНажмите «Канон» на удачном ассете персонажа, чтобы закрепить его как референс.';

export const findCharacterRegistryNodeEntry = (nodes: NodesState) =>
  Object.entries(nodes).find(([, node]) =>
    node.nodeType === 'character_registry'
    || node.metadata?.sourceKind === CHARACTER_REGISTRY_SOURCE_KIND);

export const findCharacterRegistryNodeEntries = (nodes: NodesState) =>
  Object.entries(nodes).filter(([, node]) =>
    node.nodeType === 'character_registry'
    || node.metadata?.sourceKind === CHARACTER_REGISTRY_SOURCE_KIND);

export const getCharacterRegistryEntryMap = (registryNode?: NodeData) => {
  const entries = parseCharacterRegistryEntries(registryNode);
  const map = new Map<string, CharacterRegistryEntry>();

  entries.forEach((entry) => {
    map.set(entry.tag, entry);
  });

  entries.forEach((entry) => {
    [
      entry.tag,
      entry.name,
      ...(entry.aliases ?? []),
      getCharacterNameFromDescription(entry.description ?? ''),
    ].forEach((value) => {
      createCharacterTagVariants(value).forEach((tag) => {
        if (!map.has(tag)) map.set(tag, entry);
      });
    });
  });

  return map;
};

export const getCombinedCharacterRegistryEntryMap = (nodes: NodesState) => {
  const map = new Map<string, CharacterRegistryEntry>();
  findCharacterRegistryNodeEntries(nodes).forEach(([, registryNode]) => {
    getCharacterRegistryEntryMap(registryNode).forEach((entry, tag) => {
      if (!map.has(tag)) map.set(tag, entry);
    });
  });
  return map;
};

const addKnownCharacterName = (tags: Set<string>, value: string | undefined) => {
  const name = value?.trim();
  if (!name) return;
  createCharacterTagVariants(name).forEach((tag) => tags.add(tag));
};

export const getKnownCharacterTags = (nodes: NodesState) => {
  const tags = new Set<string>();
  findCharacterRegistryNodeEntries(nodes).forEach(([, registryNode]) => {
    parseCharacterRegistryEntries(registryNode).forEach((entry) => {
      tags.add(entry.tag);
      createCharacterTagVariants(entry.tag).forEach((tag) => tags.add(tag));
      addKnownCharacterName(tags, entry.name);
      entry.aliases?.forEach((alias) => addKnownCharacterName(tags, alias));
      addKnownCharacterName(tags, getCharacterNameFromDescription(entry.description ?? ''));
    });
  });

  Object.values(nodes).forEach((node) => {
    if (!isCharacterAssetNode(node) || !node.imageUrl) return;
    if (typeof node.metadata?.characterTag === 'string') {
      const tag = normalizeCharacterTag(node.metadata.characterTag);
      if (tag) tags.add(tag);
    }

    const context = typeof node.metadata?.referenceContext === 'string'
      ? node.metadata.referenceContext
      : typeof node.metadata?.promptContext === 'string'
        ? node.metadata.promptContext
        : '';
    addKnownCharacterName(tags, getCharacterNameFromDescription(context));

    const labelParts = node.label.split('·').map((part) => part.trim()).filter(Boolean);
    labelParts.forEach((part) => {
      if (/^(ассет|asset|герои|characters?|\d+)$/iu.test(part)) return;
      addKnownCharacterName(tags, part.replace(/^\d+\s*[.)-]?\s*/u, ''));
    });
  });

  return tags;
};

export const getNewCharacterDescriptions = (heroesText: string, nodes: NodesState) => {
  const knownTags = getKnownCharacterTags(nodes);
  return getCharacterDescriptions(heroesText).filter((description, index) => {
    const descriptionTags = getCharacterTagVariantsFromDescription(description, index);
    return descriptionTags.length === 0 || !descriptionTags.some((tag) => knownTags.has(tag));
  });
};
