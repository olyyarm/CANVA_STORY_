import {
  loadLocalAssetRecord,
  loadProjectAssetRecords,
  saveImportedAssetBlob,
} from './assetStorage';
import { parseProjectJson, projectToJson } from './project';
import { AssetKind, AssetMediaKind, AssetReference, NodeAssetReferences, NodeData, ProjectDocument } from './types';

const FOLDER_FORMAT = 'canva-story-project-folder';
const FOLDER_VERSION = 1;
const FOLDER_MANIFEST_PATH = 'canva-story-folder.json';
const PROJECT_DOCUMENT_PATH = 'project.canva-story.json';
const HANDLE_DB_NAME = 'canva-story-folder-handles';
const HANDLE_DB_VERSION = 1;
const HANDLE_STORE_NAME = 'handles';
const MAX_FOLDER_ASSETS = 10_000;

type ProjectPermissionMode = 'read' | 'readwrite';

interface ProjectWritableFileStream {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
}

interface ProjectFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<ProjectWritableFileStream>;
}

export interface ProjectDirectoryHandle {
  kind: 'directory';
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<ProjectDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<ProjectFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  values(): AsyncIterableIterator<ProjectFileHandle | ProjectDirectoryHandle>;
  queryPermission?(descriptor?: { mode?: ProjectPermissionMode }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: ProjectPermissionMode }): Promise<PermissionState>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: ProjectPermissionMode;
      startIn?: string;
    }) => Promise<ProjectDirectoryHandle>;
  }
}

interface FolderAssetFile {
  assetId: string;
  assetKind: AssetKind;
  mediaKind: AssetMediaKind;
  path: string;
  mimeType: string;
}

interface FolderTextFile {
  nodeId: string;
  path: string;
}

interface FolderProjectManifest {
  format: typeof FOLDER_FORMAT;
  version: typeof FOLDER_VERSION;
  projectId: string;
  title: string;
  updatedAt: string;
  projectFile: typeof PROJECT_DOCUMENT_PATH;
  assetFiles: FolderAssetFile[];
  textFiles: FolderTextFile[];
  missingAssetIds: string[];
}

interface StoredFolderHandle {
  projectId: string;
  handle: ProjectDirectoryHandle;
  name: string;
  updatedAt: string;
}

export interface SaveFolderProjectResult {
  handle: ProjectDirectoryHandle;
  includedAssetCount: number;
  exportedTextCount: number;
  missingAssetIds: string[];
}

export interface OpenFolderProjectResult {
  handle: ProjectDirectoryHandle;
  project: ProjectDocument;
  importedAssetCount: number;
  missingAssetIds: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const sanitizeFileSegment = (value: string) => {
  const sanitized = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized.slice(0, 96) || 'item';
};

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

const getAssetDirectory = (reference: AssetReference) => {
  if (reference.mediaKind === 'audio') return 'audio';
  if (reference.mediaKind === 'video') {
    if (reference.assetKind === 'scene_clip') return 'clips/scenes';
    if (reference.assetKind === 'chapter_video') return 'clips/chapters';
    return 'final';
  }
  const directories: Partial<Record<AssetKind, string>> = {
    character_reference: 'images/characters',
    location_reference: 'images/locations',
    scene_frame: 'images/frames',
    scene_contact_sheet: 'images/frames',
    scene_shot: 'images/frames',
    system_insert: 'images/inserts',
    chapter_backdrop: 'images/backdrops',
  };
  return directories[reference.assetKind] ?? 'images/other';
};

const getTextDirectory = (node: NodeData) => {
  if (node.nodeType === 'scene') return 'text/scenes';
  if (node.nodeType === 'split_item' && /(?:ГЛАВА|CHAPTER)/iu.test(node.label)) return 'text/chapters';
  const detailType = typeof node.metadata?.detailType === 'string' ? node.metadata.detailType : '';
  if (detailType === 'закадр') return 'text/voiceover';
  return 'text/nodes';
};

const getNodeText = (node: NodeData) => [
  node.promptResultValue,
  node.sceneText,
  node.inputValue,
].find((value) => typeof value === 'string' && value.trim())?.trim() ?? '';

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

const mapNodeAssetReferences = (
  assets: NodeAssetReferences | undefined,
  references: Map<string, AssetReference>,
) => {
  if (!assets) return undefined;
  const mapped: NodeAssetReferences = {};
  (['image', 'audio', 'video'] as const).forEach((mediaKind) => {
    const reference = assets[mediaKind];
    if (!reference) return;
    mapped[mediaKind] = references.get(`${mediaKind}:${reference.assetId}`) ?? reference;
  });
  return Object.keys(mapped).length > 0 ? mapped : undefined;
};

const withFolderAssetReferences = (
  project: ProjectDocument,
  references: AssetReference[],
): ProjectDocument => {
  const referenceMap = new Map(references.map((reference) => [
    `${reference.mediaKind}:${reference.assetId}`,
    reference,
  ]));
  const narrationReference = project.extensions?.narration?.referenceAudio;
  return {
    ...project,
    nodes: Object.fromEntries(Object.entries(project.nodes).map(([nodeId, node]) => [
      nodeId,
      { ...node, assets: mapNodeAssetReferences(node.assets, referenceMap) },
    ])),
    extensions: {
      ...project.extensions,
      ...(project.extensions?.narration ? {
        narration: {
          ...project.extensions.narration,
          ...(narrationReference ? {
            referenceAudio: referenceMap.get(`audio:${narrationReference.assetId}`) ?? narrationReference,
          } : {}),
        },
      } : {}),
      assets: references,
    },
  };
};

const withIndexedDbAssetReferences = (project: ProjectDocument): ProjectDocument => {
  const references = collectAssetReferences(project).map((reference) => ({
    ...reference,
    storage: 'indexeddb' as const,
  }));
  const referenceMap = new Map(references.map((reference) => [
    `${reference.mediaKind}:${reference.assetId}`,
    reference,
  ]));
  const narrationReference = project.extensions?.narration?.referenceAudio;
  return {
    ...project,
    nodes: Object.fromEntries(Object.entries(project.nodes).map(([nodeId, node]) => [
      nodeId,
      { ...node, assets: mapNodeAssetReferences(node.assets, referenceMap) },
    ])),
    extensions: {
      ...project.extensions,
      ...(project.extensions?.narration ? {
        narration: {
          ...project.extensions.narration,
          ...(narrationReference ? {
            referenceAudio: referenceMap.get(`audio:${narrationReference.assetId}`) ?? narrationReference,
          } : {}),
        },
      } : {}),
      assets: references,
    },
  };
};

const openHandleDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(HANDLE_DB_NAME, HANDLE_DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
      db.createObjectStore(HANDLE_STORE_NAME, { keyPath: 'projectId' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Не удалось открыть хранилище папок проекта.'));
});

const withHandleStore = async <Result>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<Result>,
) => {
  const db = await openHandleDb();
  try {
    return await new Promise<Result>((resolve, reject) => {
      const transaction = db.transaction(HANDLE_STORE_NAME, mode);
      const request = operation(transaction.objectStore(HANDLE_STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Не удалось сохранить доступ к папке проекта.'));
      transaction.onerror = () => reject(transaction.error ?? new Error('Ошибка хранилища папок проекта.'));
    });
  } finally {
    db.close();
  }
};

export const isFolderProjectSupported = () => typeof window.showDirectoryPicker === 'function';

export const pickProjectDirectory = async (mode: ProjectPermissionMode = 'readwrite') => {
  if (!window.showDirectoryPicker) {
    throw new Error('Сохранение в папку поддерживается в Chrome и Edge. Используйте ZIP-пакет в другом браузере.');
  }
  return window.showDirectoryPicker({ id: 'canva-story-project', mode });
};

const ensureDirectoryPermission = async (
  handle: ProjectDirectoryHandle,
  mode: ProjectPermissionMode,
) => {
  if (!handle.queryPermission || !handle.requestPermission) return true;
  if (await handle.queryPermission({ mode }) === 'granted') return true;
  return await handle.requestPermission({ mode }) === 'granted';
};

export const saveProjectFolderHandle = async (projectId: string, handle: ProjectDirectoryHandle) => {
  const value: StoredFolderHandle = {
    projectId,
    handle,
    name: handle.name,
    updatedAt: new Date().toISOString(),
  };
  await withHandleStore('readwrite', (store) => store.put(value));
};

export const loadProjectFolderHandle = async (projectId: string) => {
  const value = await withHandleStore<StoredFolderHandle | undefined>('readonly', (store) => store.get(projectId));
  return value?.handle ?? null;
};

const getDirectoryAtPath = async (
  root: ProjectDirectoryHandle,
  path: string,
  create: boolean,
) => {
  let directory = root;
  for (const segment of path.split('/').filter(Boolean)) {
    directory = await directory.getDirectoryHandle(segment, { create });
  }
  return directory;
};

const writeFileAtPath = async (
  root: ProjectDirectoryHandle,
  path: string,
  data: Blob | string,
) => {
  const segments = path.split('/').filter(Boolean);
  const fileName = segments.pop();
  if (!fileName) throw new Error(`Некорректный путь файла: ${path}`);
  const directory = await getDirectoryAtPath(root, segments.join('/'), true);
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
};

const readFileAtPath = async (root: ProjectDirectoryHandle, path: string) => {
  const segments = path.split('/').filter(Boolean);
  const fileName = segments.pop();
  if (!fileName || path.includes('..') || path.includes('\\')) {
    throw new Error(`Небезопасный путь файла проекта: ${path}`);
  }
  const directory = await getDirectoryAtPath(root, segments.join('/'), false);
  return (await directory.getFileHandle(fileName)).getFile();
};

const tryReadTextFile = async (root: ProjectDirectoryHandle, path: string) => {
  try {
    return await (await readFileAtPath(root, path)).text();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null;
    throw error;
  }
};

const writeProjectBackup = async (root: ProjectDirectoryHandle, previousProjectJson: string | null) => {
  if (!previousProjectJson) return;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDirectory = await getDirectoryAtPath(root, 'backups', true);
  await writeFileAtPath(root, `backups/project-${timestamp}.canva-story.json`, previousProjectJson);

  const backupNames: string[] = [];
  for await (const entry of backupDirectory.values()) {
    if (entry.kind === 'file' && /^project-.*\.canva-story\.json$/u.test(entry.name)) {
      backupNames.push(entry.name);
    }
  }
  backupNames.sort().reverse();
  await Promise.all(backupNames.slice(5).map((name) => backupDirectory.removeEntry(name)));
};

const parseFolderManifest = (value: unknown): FolderProjectManifest => {
  if (!isRecord(value) || value.format !== FOLDER_FORMAT || value.version !== FOLDER_VERSION) {
    throw new Error('В выбранной папке нет поддерживаемого проекта CANVA STORY.');
  }
  if (value.projectFile !== PROJECT_DOCUMENT_PATH || !Array.isArray(value.assetFiles)) {
    throw new Error('Манифест папки проекта повреждён.');
  }
  if (value.assetFiles.length > MAX_FOLDER_ASSETS) {
    throw new Error('В папке проекта слишком много медиафайлов.');
  }

  const assetFiles = value.assetFiles.map((entry) => {
    if (!isRecord(entry)) throw new Error('В манифесте есть некорректный медиафайл.');
    const assetId = typeof entry.assetId === 'string' ? entry.assetId.trim() : '';
    const assetKind = typeof entry.assetKind === 'string' ? entry.assetKind : '';
    const mediaKind = entry.mediaKind;
    const path = typeof entry.path === 'string' ? entry.path.trim() : '';
    const mimeType = typeof entry.mimeType === 'string' ? entry.mimeType.trim() : '';
    if (
      !assetId
      || !assetKind
      || (mediaKind !== 'image' && mediaKind !== 'audio' && mediaKind !== 'video')
      || !path
      || path.includes('..')
      || path.includes('\\')
    ) {
      throw new Error('В манифесте есть небезопасная запись медиафайла.');
    }
    return {
      assetId,
      assetKind: assetKind as AssetKind,
      mediaKind: mediaKind as AssetMediaKind,
      path,
      mimeType,
    };
  });

  return {
    format: FOLDER_FORMAT,
    version: FOLDER_VERSION,
    projectId: typeof value.projectId === 'string' ? value.projectId : '',
    title: typeof value.title === 'string' ? value.title : 'CANVA STORY',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
    projectFile: PROJECT_DOCUMENT_PATH,
    assetFiles,
    textFiles: Array.isArray(value.textFiles)
      ? value.textFiles.filter((entry): entry is FolderTextFile => (
        isRecord(entry) && typeof entry.nodeId === 'string' && typeof entry.path === 'string'
      ))
      : [],
    missingAssetIds: Array.isArray(value.missingAssetIds)
      ? value.missingAssetIds.filter((assetId): assetId is string => typeof assetId === 'string')
      : [],
  };
};

export const saveProjectToFolder = async (
  project: ProjectDocument,
  suppliedHandle?: ProjectDirectoryHandle,
): Promise<SaveFolderProjectResult> => {
  const handle = suppliedHandle ?? await pickProjectDirectory('readwrite');
  if (!await ensureDirectoryPermission(handle, 'readwrite')) {
    throw new Error('Нет разрешения на запись в выбранную папку.');
  }

  const existingProjectJson = await tryReadTextFile(handle, PROJECT_DOCUMENT_PATH);
  if (existingProjectJson) {
    const existingProject = parseProjectJson(existingProjectJson);
    if (existingProject.id !== project.id) {
      throw new Error('В этой папке уже лежит другой проект CANVA STORY. Выберите другую папку или откройте существующий проект.');
    }
  }

  const references = new Map(collectAssetReferences(project).map((reference) => [
    `${reference.mediaKind}:${reference.assetId}`,
    reference,
  ]));
  const projectRecords = await loadProjectAssetRecords(project.id);
  projectRecords.forEach(({ reference }) => {
    references.set(`${reference.mediaKind}:${reference.assetId}`, reference);
  });

  const folderReferences: AssetReference[] = [];
  const assetFiles: FolderAssetFile[] = [];
  const missingAssetIds: string[] = [];

  for (const reference of references.values()) {
    const record = await loadLocalAssetRecord(reference.assetId);
    const mimeType = record?.blob.type || reference.mimeType || 'application/octet-stream';
    const extension = getFileExtension(mimeType, reference.mediaKind);
    const path = reference.filePath?.trim() || `${getAssetDirectory(reference)}/${sanitizeFileSegment(reference.assetId)}.${extension}`;

    if (record) {
      await writeFileAtPath(handle, path, record.blob);
    } else {
      try {
        await readFileAtPath(handle, path);
      } catch {
        missingAssetIds.push(reference.assetId);
        continue;
      }
    }

    const folderReference: AssetReference = {
      ...reference,
      storage: 'file',
      filePath: path,
      mimeType,
      updatedAt: new Date().toISOString(),
    };
    folderReferences.push(folderReference);
    assetFiles.push({
      assetId: reference.assetId,
      assetKind: reference.assetKind,
      mediaKind: reference.mediaKind,
      path,
      mimeType,
    });
  }

  const textFiles: FolderTextFile[] = [];
  for (const [index, [nodeId, node]] of Object.entries(project.nodes).entries()) {
    const content = getNodeText(node);
    if (!content) continue;
    const path = `${getTextDirectory(node)}/${String(index + 1).padStart(4, '0')}-${sanitizeFileSegment(node.label)}-${sanitizeFileSegment(nodeId)}.txt`;
    await writeFileAtPath(handle, path, content);
    textFiles.push({ nodeId, path });
  }

  await writeProjectBackup(handle, existingProjectJson);
  const folderProject = withFolderAssetReferences(project, folderReferences);
  await writeFileAtPath(handle, PROJECT_DOCUMENT_PATH, projectToJson(folderProject));
  const manifest: FolderProjectManifest = {
    format: FOLDER_FORMAT,
    version: FOLDER_VERSION,
    projectId: project.id,
    title: project.title,
    updatedAt: new Date().toISOString(),
    projectFile: PROJECT_DOCUMENT_PATH,
    assetFiles,
    textFiles,
    missingAssetIds,
  };
  await writeFileAtPath(handle, FOLDER_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  await saveProjectFolderHandle(project.id, handle);

  return {
    handle,
    includedAssetCount: assetFiles.length,
    exportedTextCount: textFiles.length,
    missingAssetIds,
  };
};

export const openProjectFromFolder = async (
  suppliedHandle?: ProjectDirectoryHandle,
): Promise<OpenFolderProjectResult> => {
  const handle = suppliedHandle ?? await pickProjectDirectory('read');
  if (!await ensureDirectoryPermission(handle, 'read')) {
    throw new Error('Нет разрешения на чтение выбранной папки.');
  }
  const manifestText = await tryReadTextFile(handle, FOLDER_MANIFEST_PATH);
  if (!manifestText) throw new Error(`В выбранной папке нет файла ${FOLDER_MANIFEST_PATH}.`);

  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(manifestText);
  } catch {
    throw new Error('Не удалось прочитать манифест папки проекта.');
  }
  const manifest = parseFolderManifest(manifestValue);
  const project = withIndexedDbAssetReferences(parseProjectJson(
    await (await readFileAtPath(handle, manifest.projectFile)).text(),
  ));
  const references = new Map(collectAssetReferences(project).map((reference) => [
    `${reference.mediaKind}:${reference.assetId}`,
    reference,
  ]));

  let importedAssetCount = 0;
  const missingAssetIds = [...manifest.missingAssetIds];
  for (const assetFile of manifest.assetFiles) {
    const reference = references.get(`${assetFile.mediaKind}:${assetFile.assetId}`);
    if (!reference) continue;
    try {
      const file = await readFileAtPath(handle, assetFile.path);
      await saveImportedAssetBlob(file, {
        ...reference,
        storage: 'indexeddb',
        filePath: assetFile.path,
        mimeType: file.type || assetFile.mimeType || reference.mimeType,
      });
      importedAssetCount += 1;
    } catch {
      missingAssetIds.push(assetFile.assetId);
    }
  }

  await saveProjectFolderHandle(project.id, handle);
  return {
    handle,
    project,
    importedAssetCount,
    missingAssetIds: [...new Set(missingAssetIds)],
  };
};
