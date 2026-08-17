import { Dispatch, SetStateAction, useCallback, useEffect, useRef } from 'react';
import { NodeData, NodesState } from '../types';

interface UseDraggableNodesProps {
  nodes: NodesState;
  setNodes: Dispatch<SetStateAction<NodesState>>;
  zoom: number;
  onSelect: (nodeId: string) => void;
}

type Interaction = {
  type: 'drag' | 'resize';
  nodeId: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
};

const getMinimumNodeSize = (node: NodeData) => ({
  width: node.nodeType === 'pollinations_image'
    ? 220
    : node.nodeType === 'chapter_timeline'
      ? 760
      : node.nodeType === 'prompt_node'
        ? 540
      : node.nodeType === 'split_node'
        ? 420
      : node.nodeType === 'split_item'
        ? 420
      : node.nodeType === 'character_registry'
        ? 420
      : node.nodeType === 'script_detail'
        ? 360
      : node.nodeType === 'scene'
        ? 400
        : 260,
  height: node.nodeType === 'pollinations_image'
    ? 160
    : node.nodeType === 'chapter_timeline'
      ? 420
      : node.nodeType === 'prompt_node'
        ? 760
      : node.nodeType === 'split_node'
        ? 340
      : node.nodeType === 'split_item'
        ? 430
      : node.nodeType === 'character_registry'
        ? 360
      : node.nodeType === 'script_detail'
        ? node.label === 'Закадр' || node.label === 'Системные вставки' ? 460 : 360
      : node.nodeType === 'scene'
        ? 520
        : 180,
});

export const useDraggableNodes = ({ nodes, setNodes, zoom, onSelect }: UseDraggableNodesProps) => {
  const interactionRef = useRef<Interaction | null>(null);
  const nodesRef = useRef(nodes);
  const zoomRef = useRef(zoom);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const beginInteraction = useCallback((
    event: React.MouseEvent,
    nodeId: string,
    type: Interaction['type'],
  ) => {
    if (event.button !== 0) return;
    const node = nodesRef.current[nodeId];
    if (!node) return;
    const minimumNodeSize = getMinimumNodeSize(node);
    event.preventDefault();
    event.stopPropagation();
    onSelect(nodeId);
    interactionRef.current = {
      type,
      nodeId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: node.x,
      startY: node.y,
      startWidth: Math.max(node.width ?? 300, minimumNodeSize.width),
      startHeight: Math.max(node.height ?? 220, minimumNodeSize.height),
    };
  }, [onSelect]);

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>, nodeId: string) => {
    const target = event.target as HTMLElement;
    if (target.closest('textarea, button, select, input, a, [contenteditable="true"]')) {
      onSelect(nodeId);
      return;
    }
    beginInteraction(event, nodeId, 'drag');
  }, [beginInteraction, onSelect]);

  const handleResizeMouseDown = useCallback((event: React.MouseEvent<HTMLButtonElement>, nodeId: string) => {
    beginInteraction(event, nodeId, 'resize');
  }, [beginInteraction]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;
      const scale = zoomRef.current || 1;
      const deltaX = (event.clientX - interaction.startClientX) / scale;
      const deltaY = (event.clientY - interaction.startClientY) / scale;

      setNodes((previousNodes) => {
        const node = previousNodes[interaction.nodeId];
        if (!node) return previousNodes;
        if (interaction.type === 'drag') {
          return {
            ...previousNodes,
            [interaction.nodeId]: {
              ...node,
              x: Math.round(interaction.startX + deltaX),
              y: Math.round(interaction.startY + deltaY),
            },
          };
        }
        const isChapterTimeline = node.nodeType === 'chapter_timeline';
        const { width: minWidth, height: minHeight } = getMinimumNodeSize(node);
        const maxWidth = isChapterTimeline ? 2400 : 920;
        const maxHeight = isChapterTimeline ? 2400 : 760;
        return {
          ...previousNodes,
          [interaction.nodeId]: {
            ...node,
            width: Math.round(Math.min(maxWidth, Math.max(minWidth, interaction.startWidth + deltaX))),
            height: Math.round(Math.min(maxHeight, Math.max(minHeight, interaction.startHeight + deltaY))),
          },
        };
      });
    };
    const handleMouseUp = () => {
      interactionRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp, true);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [setNodes]);

  return { handleMouseDown, handleResizeMouseDown };
};
