import {
  AssetKind,
  AssetMediaKind,
  AssetReference,
  AssetScope,
  NodesState,
} from './types';

const ASSET_DB_NAME = 'canva-story-assets';
const ASSET_DB_VERSION = 1;
const ASSET_STORE_NAME = 'assets';

export type LocalAssetKind = AssetMediaKind;

interface StoredAsset {
  id: string;
  kind: LocalAssetKind;
  blob: Blob;
  mimeType: string;
  createdAt: string;
  reference?: AssetReference;
}

export interface SaveLocalAssetOptions {
  assetId?: string;
  assetKind?: AssetKind;
  scope?: AssetScope;
  projectId?: string;
  chapterId?: string;
  sceneId?: string;
  canonicalId?: string;
  sourcePrompt?: string;
  filePath?: string;
}

export const getNodeAssetId = (projectId: string, nodeId: string, kind: LocalAssetKind) =>
  `${projectId}:${kind}:${nodeId}`;

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const getDefaultAssetKind = (mediaKind: AssetMediaKind): AssetKind => {
  if (mediaKind === 'audio') return 'narration_audio';
  if (mediaKind === 'video') return 'scene_clip';
  return 'other';
};

const optionalField = (value: string | undefined) => value?.trim() || undefined;

export const createLocalAssetReference = (
  blob: Blob,
  mediaKind: AssetMediaKind,
  options: SaveLocalAssetOptions = {},
): AssetReference => {
  const now = new Date().toISOString();
  return {
    assetId: options.assetId ?? createId(),
    assetKind: options.assetKind ?? getDefaultAssetKind(mediaKind),
    mediaKind,
    scope: options.scope ?? 'project',
    storage: 'indexeddb',
    ...(optionalField(options.projectId) ? { projectId: optionalField(options.projectId) } : {}),
    ...(optionalField(options.chapterId) ? { chapterId: optionalField(options.chapterId) } : {}),
    ...(optionalField(options.sceneId) ? { sceneId: optionalField(options.sceneId) } : {}),
    ...(optionalField(options.canonicalId) ? { canonicalId: optionalField(options.canonicalId) } : {}),
    ...(optionalField(options.sourcePrompt) ? { sourcePrompt: optionalField(options.sourcePrompt) } : {}),
    ...(optionalField(options.filePath) ? { filePath: optionalField(options.filePath) } : {}),
    mimeType: blob.type || 'application/octet-stream',
    createdAt: now,
    updatedAt: now,
  };
};

const openAssetDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(ASSET_DB_NAME, ASSET_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ASSET_STORE_NAME)) {
        db.createObjectStore(ASSET_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB asset storage is unavailable.'));
  });

const withAssetStore = async <Result>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<Result>,
) => {
  const db = await openAssetDb();
  try {
    return await new Promise<Result>((resolve, reject) => {
      const transaction = db.transaction(ASSET_STORE_NAME, mode);
      const request = operation(transaction.objectStore(ASSET_STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB asset operation failed.'));
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB asset transaction failed.'));
    });
  } finally {
    db.close();
  }
};

export const saveAssetBlob = async (
  blob: Blob,
  mediaKind: AssetMediaKind,
  options: SaveLocalAssetOptions = {},
) => {
  const reference = createLocalAssetReference(blob, mediaKind, options);
  const asset: StoredAsset = {
    id: reference.assetId,
    kind: mediaKind,
    blob,
    mimeType: reference.mimeType ?? 'application/octet-stream',
    createdAt: reference.createdAt,
    reference,
  };
  await withAssetStore('readwrite', (store) => store.put(asset));
  return reference;
};

export const saveLocalAssetBlob = async (blob: Blob, kind: LocalAssetKind, assetId = createId()) =>
  (await saveAssetBlob(blob, kind, { assetId })).assetId;

export const saveAssetFromUrl = async (
  url: string,
  mediaKind: AssetMediaKind,
  options: SaveLocalAssetOptions = {},
) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot read generated ${mediaKind}: ${response.status}`);
  return saveAssetBlob(await response.blob(), mediaKind, options);
};

export const saveLocalAssetFromUrl = async (url: string, kind: LocalAssetKind, assetId?: string) =>
  (await saveAssetFromUrl(url, kind, { assetId })).assetId;

const getStoredAssetReference = (asset: StoredAsset): AssetReference => asset.reference ?? {
  assetId: asset.id,
  assetKind: getDefaultAssetKind(asset.kind),
  mediaKind: asset.kind,
  scope: 'project',
  storage: 'indexeddb',
  mimeType: asset.mimeType || asset.blob.type || 'application/octet-stream',
  createdAt: asset.createdAt,
};

export const loadLocalAssetReference = async (assetId: string) => {
  const asset = await withAssetStore<StoredAsset | undefined>('readonly', (store) => store.get(assetId));
  return asset?.blob ? getStoredAssetReference(asset) : null;
};

export const loadLocalAssetObjectUrl = async (assetId: string) => {
  const asset = await withAssetStore<StoredAsset | undefined>('readonly', (store) => store.get(assetId));
  if (!asset?.blob) return null;
  return URL.createObjectURL(asset.blob);
};

export const deleteLocalAsset = async (assetId: string) => {
  await withAssetStore('readwrite', (store) => store.delete(assetId));
};

export const restoreImageAssetUrls = async (nodes: NodesState) => {
  const restored = await Promise.all(
    Object.entries(nodes).map(async ([nodeId, node]) => {
      const localAssetId = typeof node.metadata?.localAssetId === 'string' ? node.metadata.localAssetId : '';
      if (node.nodeType !== 'pollinations_image' || node.imageUrl || !localAssetId) return null;
      const imageUrl = await loadLocalAssetObjectUrl(localAssetId);
      return imageUrl ? { nodeId, imageUrl } : null;
    }),
  );

  return restored.filter((entry): entry is { nodeId: string; imageUrl: string } => Boolean(entry));
};

export const restoreImageAssetUrlsForProject = async (projectId: string, nodes: NodesState) => {
  const restored = await Promise.all(
    Object.entries(nodes).map(async ([nodeId, node]) => {
      if (node.nodeType !== 'pollinations_image' || node.imageUrl) return null;
      const savedAssetIds = [
        node.assets?.image?.assetId ?? '',
        typeof node.metadata?.localAssetId === 'string' ? node.metadata.localAssetId : '',
        getNodeAssetId(projectId, nodeId, 'image'),
      ].filter((assetId, index, assetIds) => assetId && assetIds.indexOf(assetId) === index);

      for (const assetId of savedAssetIds) {
        const imageUrl = await loadLocalAssetObjectUrl(assetId);
        if (imageUrl) return { nodeId, imageUrl, localAssetId: assetId };
      }
      return null;
    }),
  );

  return restored.filter((entry): entry is { nodeId: string; imageUrl: string; localAssetId: string } => Boolean(entry));
};

export const restoreMediaAssetUrlsForProject = async (projectId: string, nodes: NodesState) => {
  const restored = await Promise.all(
    Object.entries(nodes).flatMap(([nodeId, node]) => {
      const plans: Array<{
        kind: Exclude<LocalAssetKind, 'image'>;
        urlKey: 'audioUrl' | 'videoUrl';
        metadataIdKey: 'localAudioAssetId' | 'localVideoAssetId';
      }> = [];

      if ((node.nodeType === 'scene' || node.nodeType === 'script_detail') && !node.audioUrl) {
        plans.push({ kind: 'audio', urlKey: 'audioUrl', metadataIdKey: 'localAudioAssetId' });
      }
      if ((node.nodeType === 'scene' || node.nodeType === 'video_output') && !node.videoUrl) {
        plans.push({ kind: 'video', urlKey: 'videoUrl', metadataIdKey: 'localVideoAssetId' });
      }

      return plans.map(async (plan) => {
        const metadataAssetId = node.metadata?.[plan.metadataIdKey];
        const savedAssetIds = [
          node.assets?.[plan.kind]?.assetId ?? '',
          typeof metadataAssetId === 'string' ? metadataAssetId : '',
          getNodeAssetId(projectId, nodeId, plan.kind),
        ].filter((assetId, index, assetIds) => assetId && assetIds.indexOf(assetId) === index);

        for (const assetId of savedAssetIds) {
          const url = await loadLocalAssetObjectUrl(assetId);
          if (url) return { nodeId, kind: plan.kind, urlKey: plan.urlKey, url, localAssetId: assetId };
        }
        return null;
      });
    }),
  );

  return restored.filter((entry): entry is {
    nodeId: string;
    kind: Exclude<LocalAssetKind, 'image'>;
    urlKey: 'audioUrl' | 'videoUrl';
    url: string;
    localAssetId: string;
  } => Boolean(entry));
};
