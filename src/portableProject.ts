import {
  AsyncZippable,
  strFromU8,
  strToU8,
  unzip,
  Unzipped,
  zip,
} from 'fflate';
import { loadLocalAssetRecord, saveImportedAssetBlob } from './assetStorage';
import { parseProjectJson, projectToJson } from './project';
import { AssetMediaKind, AssetReference, NodeAssetReferences, ProjectDocument } from './types';

const PACKAGE_FORMAT = 'canva-story-project-package';
const PACKAGE_VERSION = 1;
const PACKAGE_MANIFEST_PATH = 'canva-story-package.json';
const PROJECT_DOCUMENT_PATH = 'project.json';
const MAX_PACKAGE_SIZE = 2_000_000_000;
const MAX_ASSET_FILES = 10_000;

interface PortableAssetFile {
  assetId: string;
  mediaKind: AssetMediaKind;
  path: string;
  mimeType: string;
}

interface PortableProjectManifest {
  format: typeof PACKAGE_FORMAT;
  version: typeof PACKAGE_VERSION;
  createdAt: string;
  projectFile: typeof PROJECT_DOCUMENT_PATH;
  assetFiles: PortableAssetFile[];
  missingAssetIds: string[];
}

export interface PortableProjectExportResult {
  blob: Blob;
  includedAssetCount: number;
  missingAssetIds: string[];
}

export interface PortableProjectImportResult {
  project: ProjectDocument;
  importedAssetCount: number;
  missingAssetIds: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getFileExtension = (mimeType: string, mediaKind: AssetMediaKind) => {
  const normalizedMimeType = mimeType.split(';')[0].trim().toLowerCase();
  const extensions: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'video/webm': 'webm',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
  };
  return extensions[normalizedMimeType]
    ?? (mediaKind === 'image' ? 'img' : mediaKind === 'audio' ? 'audio' : 'video');
};

const sanitizeFileSegment = (value: string) => {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized.slice(0, 96) || 'asset';
};

const collectAssetReferences = (project: ProjectDocument) => {
  const references = new Map<string, AssetReference>();
  const addReference = (reference: AssetReference | undefined) => {
    if (!reference?.assetId) return;
    references.set(`${reference.mediaKind}:${reference.assetId}`, reference);
  };

  Object.values(project.nodes).forEach((node) => {
    addReference(node.assets?.image);
    addReference(node.assets?.audio);
    addReference(node.assets?.video);
  });
  addReference(project.extensions?.narration?.referenceAudio);
  project.extensions?.assets?.forEach(addReference);
  return [...references.values()];
};

const zipArchive = (files: AsyncZippable) => new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
  zip(files, { level: 0 }, (error, data) => {
    if (error) reject(error);
    else resolve(data);
  });
});

const unzipArchive = (data: Uint8Array<ArrayBuffer>) => new Promise<Unzipped>((resolve, reject) => {
  unzip(data, (error, files) => {
    if (error) reject(error);
    else resolve(files);
  });
});

const normalizeNodeAssetReferences = (assets: NodeAssetReferences | undefined) => {
  if (!assets) return undefined;
  const normalized: NodeAssetReferences = {};
  (['image', 'audio', 'video'] as const).forEach((mediaKind) => {
    const reference = assets[mediaKind];
    if (reference) normalized[mediaKind] = { ...reference, storage: 'indexeddb' };
  });
  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const normalizeImportedProjectStorage = (project: ProjectDocument): ProjectDocument => ({
  ...project,
  nodes: Object.fromEntries(Object.entries(project.nodes).map(([nodeId, node]) => [
    nodeId,
    { ...node, assets: normalizeNodeAssetReferences(node.assets) },
  ])),
  extensions: {
    ...project.extensions,
    ...(project.extensions?.narration ? {
      narration: {
        ...project.extensions.narration,
        ...(project.extensions.narration.referenceAudio ? {
          referenceAudio: {
            ...project.extensions.narration.referenceAudio,
            storage: 'indexeddb' as const,
          },
        } : {}),
      },
    } : {}),
    assets: collectAssetReferences(project).map((reference) => ({
      ...reference,
      storage: 'indexeddb',
    })),
  },
});

const parseManifest = (value: unknown): PortableProjectManifest => {
  if (!isRecord(value) || value.format !== PACKAGE_FORMAT || value.version !== PACKAGE_VERSION) {
    throw new Error('Это не пакет проекта CANVA STORY или его версия пока не поддерживается.');
  }
  if (value.projectFile !== PROJECT_DOCUMENT_PATH || !Array.isArray(value.assetFiles)) {
    throw new Error('В пакете проекта повреждён манифест.');
  }
  if (value.assetFiles.length > MAX_ASSET_FILES) {
    throw new Error('В пакете слишком много файлов ассетов.');
  }

  const assetFiles = value.assetFiles.map((entry) => {
    if (!isRecord(entry)) throw new Error('В манифесте есть некорректная запись ассета.');
    const assetId = typeof entry.assetId === 'string' ? entry.assetId.trim() : '';
    const mediaKind = entry.mediaKind;
    const path = typeof entry.path === 'string' ? entry.path.trim() : '';
    const mimeType = typeof entry.mimeType === 'string' ? entry.mimeType.trim() : '';
    if (
      !assetId
      || (mediaKind !== 'image' && mediaKind !== 'audio' && mediaKind !== 'video')
      || !path.startsWith('assets/')
      || path.includes('..')
      || path.includes('\\')
    ) {
      throw new Error('В манифесте есть небезопасная запись ассета.');
    }
    return { assetId, mediaKind: mediaKind as AssetMediaKind, path, mimeType };
  });

  return {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    projectFile: PROJECT_DOCUMENT_PATH,
    assetFiles,
    missingAssetIds: Array.isArray(value.missingAssetIds)
      ? value.missingAssetIds.filter((assetId): assetId is string => typeof assetId === 'string')
      : [],
  };
};

export const buildPortableProjectPackage = async (
  project: ProjectDocument,
): Promise<PortableProjectExportResult> => {
  const references = collectAssetReferences(project);
  const projectWithAssetIndex: ProjectDocument = {
    ...project,
    extensions: {
      ...project.extensions,
      assets: references,
    },
  };
  const files: AsyncZippable = {};
  const assetFiles: PortableAssetFile[] = [];
  const missingAssetIds: string[] = [];

  for (const [index, reference] of references.entries()) {
    const record = await loadLocalAssetRecord(reference.assetId);
    if (!record) {
      missingAssetIds.push(reference.assetId);
      continue;
    }
    const mimeType = record.blob.type || reference.mimeType || 'application/octet-stream';
    const extension = getFileExtension(mimeType, reference.mediaKind);
    const path = `assets/${String(index + 1).padStart(4, '0')}-${sanitizeFileSegment(reference.assetId)}.${extension}`;
    files[path] = [new Uint8Array(await record.blob.arrayBuffer()), { level: 0 }];
    assetFiles.push({
      assetId: reference.assetId,
      mediaKind: reference.mediaKind,
      path,
      mimeType,
    });
  }

  const manifest: PortableProjectManifest = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    createdAt: new Date().toISOString(),
    projectFile: PROJECT_DOCUMENT_PATH,
    assetFiles,
    missingAssetIds,
  };
  files[PROJECT_DOCUMENT_PATH] = [strToU8(projectToJson(projectWithAssetIndex)), { level: 6 }];
  files[PACKAGE_MANIFEST_PATH] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }];
  const archive = await zipArchive(files);

  return {
    blob: new Blob([archive], { type: 'application/vnd.canva-story.project+zip' }),
    includedAssetCount: assetFiles.length,
    missingAssetIds,
  };
};

export const importPortableProjectPackage = async (
  file: File,
): Promise<PortableProjectImportResult> => {
  if (file.size > MAX_PACKAGE_SIZE) {
    throw new Error('Пакет проекта слишком большой для импорта в браузере.');
  }
  const archive = await unzipArchive(new Uint8Array(await file.arrayBuffer()));
  const manifestBytes = archive[PACKAGE_MANIFEST_PATH];
  const projectBytes = archive[PROJECT_DOCUMENT_PATH];
  if (!manifestBytes || !projectBytes) {
    throw new Error('В пакете нет project.json или манифеста CANVA STORY.');
  }

  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new Error('Не удалось прочитать манифест пакета проекта.');
  }
  const manifest = parseManifest(manifestValue);
  const project = normalizeImportedProjectStorage(parseProjectJson(strFromU8(projectBytes)));
  const references = new Map(collectAssetReferences(project)
    .map((reference) => [`${reference.mediaKind}:${reference.assetId}`, reference]));

  let importedAssetCount = 0;
  for (const assetFile of manifest.assetFiles) {
    const bytes = archive[assetFile.path];
    const reference = references.get(`${assetFile.mediaKind}:${assetFile.assetId}`);
    if (!bytes || !reference) {
      throw new Error(`Пакет не содержит корректное описание ассета ${assetFile.assetId}.`);
    }
    const blob = new Blob([Uint8Array.from(bytes)], {
      type: assetFile.mimeType || reference.mimeType || 'application/octet-stream',
    });
    await saveImportedAssetBlob(blob, reference);
    importedAssetCount += 1;
  }

  return {
    project,
    importedAssetCount,
    missingAssetIds: manifest.missingAssetIds,
  };
};

export const isPortableProjectPackageFile = (file: File) => {
  const fileName = file.name.toLowerCase();
  return fileName.endsWith('.canva-story.zip')
    || fileName.endsWith('.zip')
    || file.type === 'application/zip'
    || file.type === 'application/x-zip-compressed'
    || file.type === 'application/vnd.canva-story.project+zip';
};
