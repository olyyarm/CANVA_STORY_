import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  getNodeAssetId,
  loadProjectAssetRecords,
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
  const sceneShotIndex = node.metadata?.sceneShotIndex;
  const canonicalId = getMetadataString(node, 'canonicalId')
    ?? getMetadataString(node, 'characterTag')
    ?? (assetKind === 'scene_shot' && typeof sceneShotIndex === 'number'
      ? `scene-shot:${sceneShotIndex}`
      : undefined);
  return {
    assetId: getNodeAssetId(projectId, nodeId, mediaKind),
    assetKind,
    scope: getAssetScope(node, assetKind),
    projectId,
    chapterId: getMetadataString(node, 'chapterId'),
    sceneId,
    canonicalId,
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

  const missingSceneShotKey = useMemo(() => Object.entries(nodes)
    .filter(([, node]) => node.nodeType === 'scene' && Array.isArray(node.sceneShotNodeIds))
    .flatMap(([sceneId, node]) => (node.sceneShotNodeIds ?? [])
      .filter((nodeId) => !nodes[nodeId])
      .map((nodeId) => `${sceneId}:scene-shot:${nodeId}`))
    .sort()
    .join('|'), [nodes]);

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

  const restoreMissingSceneShotNodes = useCallback(async (sourceNodes: NodesState) => {
    const records = await loadProjectAssetRecords(projectId, 'image', 'scene_shot');
    if (records.length === 0) return 0;

    const assetIdPrefix = `${projectId}:image:`;
    const getStoredNodeId = (assetId: string) => (
      assetId.startsWith(assetIdPrefix) ? assetId.slice(assetIdPrefix.length) : ''
    );
    const recordsById = new Map(records.map((record) => [record.reference.assetId, record]));
    const recordsByScene = new Map<string, typeof records>();
    records.forEach((record) => {
      const sceneId = record.reference.sceneId;
      if (!sceneId) return;
      const sceneRecords = recordsByScene.get(sceneId) ?? [];
      sceneRecords.push(record);
      recordsByScene.set(sceneId, sceneRecords);
    });

    const restoredNodes: Array<{ nodeId: string; sceneId: string; node: NodeData }> = [];
    Object.entries(sourceNodes).forEach(([sceneId, sceneNode]) => {
      if (sceneNode.nodeType !== 'scene') return;
      const linkedIds = Array.isArray(sceneNode.sceneShotNodeIds) ? sceneNode.sceneShotNodeIds : [];
      const sceneRecords = [...(recordsByScene.get(sceneId) ?? [])]
        .sort((first, second) => first.reference.createdAt.localeCompare(second.reference.createdAt));
      const orderedRecords = [
        ...linkedIds.map((nodeId) => recordsById.get(getNodeAssetId(projectId, nodeId, 'image'))),
        ...sceneRecords,
      ].filter((record, index, all): record is (typeof records)[number] => Boolean(
        record && all.findIndex((candidate) => candidate?.reference.assetId === record.reference.assetId) === index,
      ));

      orderedRecords.forEach((record, arrayIndex) => {
        const nodeId = getStoredNodeId(record.reference.assetId);
        if (!nodeId || sourceNodes[nodeId]) return;
        const canonicalIndex = record.reference.canonicalId?.match(/^scene-shot:(\d+)$/u);
        const linkedIndex = linkedIds.indexOf(nodeId);
        const shotIndex = canonicalIndex
          ? Number(canonicalIndex[1])
          : linkedIndex >= 0 ? linkedIndex + 1 : arrayIndex + 1;
        const column = Math.max(0, shotIndex - 1) % 2;
        const row = Math.floor(Math.max(0, shotIndex - 1) / 2);
        const sceneWidth = sceneNode.width ?? 400;
        const imageUrl = URL.createObjectURL(record.blob);
        restoredNodes.push({
          nodeId,
          sceneId,
          node: {
            nodeType: 'pollinations_image',
            label: `План ${shotIndex} · ${sceneNode.label}`,
            x: sceneNode.x + sceneWidth + 36 + column * 350,
            y: sceneNode.y + 710 + row * 250,
            width: 330,
            height: 215,
            parentId: sceneId,
            imageUrl,
            masterPrompt: record.reference.sourcePrompt,
            productionStatus: 'ready',
            level: (sceneNode.level ?? 0) + 1,
            assets: { image: record.reference },
            metadata: {
              assetKind: `scene_shot:${shotIndex}`,
              sceneId,
              sceneShotIndex: shotIndex,
              shotAspectRatio: '16:9',
              hiddenOnCanvas: true,
              localAssetId: record.reference.assetId,
              localAssetKind: 'image',
              localAssetSavedAt: record.reference.updatedAt ?? record.reference.createdAt,
            },
          },
        });
      });
    });

    if (restoredNodes.length === 0) return 0;
    setNodes((previousNodes) => {
      const nextNodes = { ...previousNodes };
      const restoredByScene = new Map<string, string[]>();
      restoredNodes.forEach(({ nodeId, sceneId, node }) => {
        if (nextNodes[nodeId]) {
          if (node.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(node.imageUrl);
          return;
        }
        nextNodes[nodeId] = node;
        restoredByScene.set(sceneId, [...(restoredByScene.get(sceneId) ?? []), nodeId]);
      });
      restoredByScene.forEach((restoredIds, sceneId) => {
        const sceneNode = nextNodes[sceneId];
        if (!sceneNode) return;
        const linkedIds = Array.isArray(sceneNode.sceneShotNodeIds) ? sceneNode.sceneShotNodeIds : [];
        nextNodes[sceneId] = {
          ...sceneNode,
          sceneShotNodeIds: [...new Set([...linkedIds, ...restoredIds])]
            .sort((firstId, secondId) => {
              const firstIndex = nextNodes[firstId]?.metadata?.sceneShotIndex;
              const secondIndex = nextNodes[secondId]?.metadata?.sceneShotIndex;
              return Number(firstIndex ?? 0) - Number(secondIndex ?? 0);
            }),
        };
      });
      return restoredByScene.size > 0 ? nextNodes : previousNodes;
    });
    return restoredNodes.length;
  }, [projectId, setNodes]);

  useEffect(() => {
    if (!missingRestoreKey && !missingSceneShotKey) return;
    const restoreKey = `${projectId}:${missingRestoreKey}:${missingSceneShotKey}`;
    if (restoringProjectKey.current === restoreKey) return;
    restoringProjectKey.current = restoreKey;
    let cancelled = false;

    Promise.all([
      restoreImageAssetUrlsForProject(projectId, nodes),
      restoreMediaAssetUrlsForProject(projectId, nodes),
      restoreMissingSceneShotNodes(nodes),
    ])
      .then(([restoredImages, restoredMedia]) => {
        if (cancelled) {
          restoredImages.forEach(({ imageUrl }) => URL.revokeObjectURL(imageUrl));
          restoredMedia.forEach(({ url }) => URL.revokeObjectURL(url));
          restoringProjectKey.current = '';
          return;
        }
        applyRestoredImageAssets(restoredImages);
        applyRestoredMediaAssets(restoredMedia);
        restoringProjectKey.current = '';
      })
      .catch(() => {
        restoringProjectKey.current = '';
      });

    return () => {
      cancelled = true;
    };
  }, [
    applyRestoredImageAssets,
    applyRestoredMediaAssets,
    missingRestoreKey,
    missingSceneShotKey,
    nodes,
    projectId,
    restoreMissingSceneShotNodes,
  ]);

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
      const [restoredImages, restoredMedia, restoredShots] = await Promise.all([
        restoreImageAssetUrlsForProject(projectId, nodes),
        restoreMediaAssetUrlsForProject(projectId, nodes),
        restoreMissingSceneShotNodes(nodes),
      ]);
      if (restoredImages.length === 0 && restoredMedia.length === 0 && restoredShots === 0) {
        showNotice('info', 'В локальном хранилище не нашла сохранённых медиа для пустых нод.');
        return;
      }
      applyRestoredImageAssets(restoredImages);
      applyRestoredMediaAssets(restoredMedia);
      showNotice(
        'success',
        `Восстановлено: картинок ${restoredImages.length}, дополнительных планов ${restoredShots}, аудио/видео ${restoredMedia.length}.`,
      );
    } catch {
      showNotice('error', 'Не удалось прочитать локальное хранилище медиа браузера.');
    }
  }, [
    applyRestoredImageAssets,
    applyRestoredMediaAssets,
    nodes,
    projectId,
    restoreMissingSceneShotNodes,
    showNotice,
  ]);

  return { restoreAssets };
};
