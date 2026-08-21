import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  getNodeAssetId,
  restoreImageAssetUrlsForProject,
  restoreMediaAssetUrlsForProject,
  saveAssetFromUrl,
  SaveLocalAssetOptions,
} from '../assetStorage';
import { AppNotice, AssetKind, AssetMediaKind, AssetScope, NodeData, NodesState } from '../types';

type AssetUrlKey = 'imageUrl' | 'audioUrl' | 'videoUrl';
type AssetIdMetadataKey = 'localAssetId' | 'localAudioAssetId' | 'localVideoAssetId';
type AssetKindMetadataKey = 'localAssetKind' | 'localAudioAssetKind' | 'localVideoAssetKind';
type AssetPendingMetadataKey = 'localAssetPending' | 'localAudioAssetPending' | 'localVideoAssetPending';
type AssetSourceMetadataKey = 'localAssetSourceUrl' | 'localAudioAssetSourceUrl' | 'localVideoAssetSourceUrl';
type AssetSavedAtMetadataKey = 'localAssetSavedAt' | 'localAudioAssetSavedAt' | 'localVideoAssetSavedAt';

interface AssetPersistencePlan {
  mediaKind: AssetMediaKind;
  urlKey: AssetUrlKey;
  idKey: AssetIdMetadataKey;
  kindKey: AssetKindMetadataKey;
  pendingKey: AssetPendingMetadataKey;
  sourceKey: AssetSourceMetadataKey;
  savedAtKey: AssetSavedAtMetadataKey;
}

interface UseAssetPersistenceOptions {
  projectId: string;
  nodes: NodesState;
  setNodes: Dispatch<SetStateAction<NodesState>>;
  showNotice: (tone: AppNotice['tone'], message: string) => void;
}

const imagePlan: AssetPersistencePlan = {
  mediaKind: 'image',
  urlKey: 'imageUrl',
  idKey: 'localAssetId',
  kindKey: 'localAssetKind',
  pendingKey: 'localAssetPending',
  sourceKey: 'localAssetSourceUrl',
  savedAtKey: 'localAssetSavedAt',
};

const audioPlan: AssetPersistencePlan = {
  mediaKind: 'audio',
  urlKey: 'audioUrl',
  idKey: 'localAudioAssetId',
  kindKey: 'localAudioAssetKind',
  pendingKey: 'localAudioAssetPending',
  sourceKey: 'localAudioAssetSourceUrl',
  savedAtKey: 'localAudioAssetSavedAt',
};

const videoPlan: AssetPersistencePlan = {
  mediaKind: 'video',
  urlKey: 'videoUrl',
  idKey: 'localVideoAssetId',
  kindKey: 'localVideoAssetKind',
  pendingKey: 'localVideoAssetPending',
  sourceKey: 'localVideoAssetSourceUrl',
  savedAtKey: 'localVideoAssetSavedAt',
};

const getPersistencePlans = (node: NodeData) => {
  const plans: AssetPersistencePlan[] = [];
  if (node.nodeType === 'pollinations_image') plans.push(imagePlan);
  if (node.nodeType === 'scene' || node.nodeType === 'script_detail') plans.push(audioPlan);
  if (node.nodeType === 'scene' || node.nodeType === 'video_output') plans.push(videoPlan);
  return plans;
};

const getMetadataString = (node: NodeData, key: string) => {
  const value = node.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const getSemanticAssetKind = (node: NodeData, mediaKind: AssetMediaKind): AssetKind => {
  if (mediaKind === 'audio') return 'narration_audio';
  if (mediaKind === 'video') return node.nodeType === 'video_output' ? 'chapter_video' : 'scene_clip';
  const legacyKind = getMetadataString(node, 'assetKind') ?? '';
  if (legacyKind.startsWith('character_asset')) return 'character_reference';
  if (legacyKind.startsWith('location_asset') || legacyKind === 'scene_location') return 'location_reference';
  if (legacyKind === 'scene_contact_sheet') return 'scene_contact_sheet';
  if (legacyKind.startsWith('scene_shot')) return 'scene_shot';
  if (legacyKind.startsWith('system_insert')) return 'system_insert';
  if (legacyKind === 'chapter_backdrop') return 'chapter_backdrop';
  if (legacyKind.includes('frame')) return 'scene_frame';
  return 'other';
};

const getAssetScope = (node: NodeData, assetKind: AssetKind): AssetScope => {
  if (assetKind === 'character_reference') return 'character';
  if (assetKind === 'location_reference') return 'location';
  if (assetKind === 'chapter_backdrop' || assetKind === 'chapter_video') return 'chapter';
  if (
    node.nodeType === 'scene'
    || assetKind === 'scene_frame'
    || assetKind === 'scene_contact_sheet'
    || assetKind === 'scene_shot'
    || assetKind === 'system_insert'
  ) return 'scene';
  return 'project';
};

const getAssetSaveOptions = (
  projectId: string,
  nodeId: string,
  node: NodeData,
  mediaKind: AssetMediaKind,
): SaveLocalAssetOptions => {
  const assetKind = getSemanticAssetKind(node, mediaKind);
  const parentId = typeof node.parentId === 'string' ? node.parentId : undefined;
  const sceneId = getMetadataString(node, 'sceneId')
    ?? (node.nodeType === 'scene' ? nodeId : undefined)
    ?? ((
      assetKind === 'scene_frame'
      || assetKind === 'scene_contact_sheet'
      || assetKind === 'scene_shot'
      || assetKind === 'system_insert'
    ) ? parentId : undefined);
  const sourcePrompt = node.assetPrompt?.trim() || node.masterPrompt?.trim() || undefined;
  return {
    assetId: getNodeAssetId(projectId, nodeId, mediaKind),
    assetKind,
    scope: getAssetScope(node, assetKind),
    projectId,
    chapterId: getMetadataString(node, 'chapterId'),
    sceneId,
    canonicalId: getMetadataString(node, 'canonicalId') ?? getMetadataString(node, 'characterTag'),
    sourcePrompt,
    filePath: getMetadataString(node, 'filePath'),
  };
};

export const useAssetPersistence = ({
  projectId,
  nodes,
  setNodes,
  showNotice,
}: UseAssetPersistenceOptions) => {
  const persistingAssetKeys = useRef(new Set<string>());
  const persistenceQueue = useRef(Promise.resolve());
  const restoringProjectKey = useRef('');

  const missingRestoreKey = useMemo(() => Object.entries(nodes)
    .flatMap(([nodeId, node]) => getPersistencePlans(node)
      .filter((plan) => !node[plan.urlKey])
      .map((plan) => {
        const referenceId = node.assets?.[plan.mediaKind]?.assetId ?? '';
        const legacyId = getMetadataString(node, plan.idKey) ?? '';
        return `${nodeId}:${plan.mediaKind}:${referenceId || legacyId}`;
      }))
    .sort()
    .join('|'), [nodes]);

  const applyRestoredImageAssets = useCallback((
    restoredAssets: Array<{ nodeId: string; imageUrl: string; localAssetId: string }>,
  ) => {
    if (restoredAssets.length === 0) return;
    setNodes((previousNodes) => {
      let changed = false;
      const nextNodes = { ...previousNodes };
      restoredAssets.forEach(({ nodeId, imageUrl, localAssetId }) => {
        const node = nextNodes[nodeId];
        if (!node || node.nodeType !== 'pollinations_image' || node.imageUrl) {
          URL.revokeObjectURL(imageUrl);
          return;
        }
        nextNodes[nodeId] = {
          ...node,
          imageUrl,
          metadata: {
            ...node.metadata,
            localAssetId,
            localAssetKind: 'image',
          },
        };
        changed = true;
      });
      return changed ? nextNodes : previousNodes;
    });
  }, [setNodes]);

  const applyRestoredMediaAssets = useCallback((
    restoredAssets: Array<{
      nodeId: string;
      kind: 'audio' | 'video';
      urlKey: 'audioUrl' | 'videoUrl';
      url: string;
      localAssetId: string;
    }>,
  ) => {
    if (restoredAssets.length === 0) return;
    setNodes((previousNodes) => {
      let changed = false;
      const nextNodes = { ...previousNodes };
      restoredAssets.forEach(({ nodeId, kind, urlKey, url, localAssetId }) => {
        const node = nextNodes[nodeId];
        if (!node || node[urlKey]) {
          URL.revokeObjectURL(url);
          return;
        }
        const idKey = kind === 'audio' ? 'localAudioAssetId' : 'localVideoAssetId';
        const kindKey = kind === 'audio' ? 'localAudioAssetKind' : 'localVideoAssetKind';
        nextNodes[nodeId] = {
          ...node,
          [urlKey]: url,
          metadata: {
            ...node.metadata,
            [idKey]: localAssetId,
            [kindKey]: kind,
          },
        };
        changed = true;
      });
      return changed ? nextNodes : previousNodes;
    });
  }, [setNodes]);

  useEffect(() => {
    if (!missingRestoreKey) return;
    const restoreKey = `${projectId}:${missingRestoreKey}`;
    if (restoringProjectKey.current === restoreKey) return;
    restoringProjectKey.current = restoreKey;
    let cancelled = false;

    Promise.all([
      restoreImageAssetUrlsForProject(projectId, nodes),
      restoreMediaAssetUrlsForProject(projectId, nodes),
    ])
      .then(([restoredImages, restoredMedia]) => {
        if (cancelled) {
          restoredImages.forEach(({ imageUrl }) => URL.revokeObjectURL(imageUrl));
          restoredMedia.forEach(({ url }) => URL.revokeObjectURL(url));
          return;
        }
        applyRestoredImageAssets(restoredImages);
        applyRestoredMediaAssets(restoredMedia);
      })
      .catch(() => {
        restoringProjectKey.current = '';
      });

    return () => {
      cancelled = true;
    };
  }, [applyRestoredImageAssets, applyRestoredMediaAssets, missingRestoreKey, nodes, projectId]);

  useEffect(() => {
    Object.entries(nodes).forEach(([nodeId, node]) => {
      getPersistencePlans(node).forEach((plan) => {
        const sourceUrl = node[plan.urlKey];
        if (!sourceUrl) return;
        const stableAssetId = getNodeAssetId(projectId, nodeId, plan.mediaKind);
        const localAssetId = getMetadataString(node, plan.idKey) ?? '';
        const localAssetSavedAt = getMetadataString(node, plan.savedAtKey) ?? '';
        const localAssetSourceUrl = getMetadataString(node, plan.sourceKey) ?? '';
        const persistenceKey = `${projectId}:${nodeId}:${plan.mediaKind}`;
        if (
          (localAssetId === stableAssetId && localAssetSavedAt && localAssetSourceUrl === sourceUrl)
          || persistingAssetKeys.current.has(persistenceKey)
        ) {
          return;
        }

        persistingAssetKeys.current.add(persistenceKey);
        let savedCurrentAsset = false;
        let shouldRetryLatestAsset = false;
        setNodes((previousNodes) => {
          const currentNode = previousNodes[nodeId];
          if (
            !currentNode
            || currentNode[plan.urlKey] !== sourceUrl
            || typeof currentNode.metadata?.[plan.savedAtKey] === 'string'
          ) {
            return previousNodes;
          }
          return {
            ...previousNodes,
            [nodeId]: {
              ...currentNode,
              metadata: {
                ...currentNode.metadata,
                [plan.idKey]: stableAssetId,
                [plan.kindKey]: plan.mediaKind,
                [plan.pendingKey]: true,
                [plan.sourceKey]: sourceUrl,
              },
            },
          };
        });

        persistenceQueue.current = persistenceQueue.current
          .catch(() => undefined)
          .then(() => saveAssetFromUrl(
            sourceUrl,
            plan.mediaKind,
            getAssetSaveOptions(projectId, nodeId, node, plan.mediaKind),
          ))
          .then((reference) => {
            setNodes((previousNodes) => {
              const currentNode = previousNodes[nodeId];
              if (!currentNode || currentNode[plan.urlKey] !== sourceUrl) {
                shouldRetryLatestAsset = Boolean(currentNode?.[plan.urlKey]);
                return previousNodes;
              }
              savedCurrentAsset = true;
              return {
                ...previousNodes,
                [nodeId]: {
                  ...currentNode,
                  assets: {
                    ...currentNode.assets,
                    [plan.mediaKind]: reference,
                  },
                  metadata: {
                    ...currentNode.metadata,
                    [plan.idKey]: reference.assetId,
                    [plan.kindKey]: plan.mediaKind,
                    [plan.pendingKey]: false,
                    [plan.sourceKey]: sourceUrl,
                    [plan.savedAtKey]: reference.updatedAt ?? reference.createdAt,
                  },
                },
              };
            });
          })
          .catch(() => {
            // The generated media remains usable in this tab; only reload recovery is affected.
          })
          .finally(() => {
            persistingAssetKeys.current.delete(persistenceKey);
            if (!savedCurrentAsset && shouldRetryLatestAsset) {
              setNodes((previousNodes) => ({ ...previousNodes }));
            }
          });
      });
    });
  }, [nodes, projectId, setNodes]);

  const restoreAssets = useCallback(async () => {
    try {
      const [restoredImages, restoredMedia] = await Promise.all([
        restoreImageAssetUrlsForProject(projectId, nodes),
        restoreMediaAssetUrlsForProject(projectId, nodes),
      ]);
      if (restoredImages.length === 0 && restoredMedia.length === 0) {
        showNotice('info', 'В локальном хранилище не нашла сохранённых медиа для пустых нод.');
        return;
      }
      applyRestoredImageAssets(restoredImages);
      applyRestoredMediaAssets(restoredMedia);
      showNotice('success', `Восстановлено: картинок ${restoredImages.length}, аудио/видео ${restoredMedia.length}.`);
    } catch {
      showNotice('error', 'Не удалось прочитать локальное хранилище медиа браузера.');
    }
  }, [applyRestoredImageAssets, applyRestoredMediaAssets, nodes, projectId, showNotice]);

  return { restoreAssets };
};
