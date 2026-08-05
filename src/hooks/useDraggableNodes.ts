import { Dispatch, SetStateAction, useCallback, useEffect, useRef } from 'react';
import { NodesState } from '../types';

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
      startWidth: node.width ?? 300,
      startHeight: node.height ?? 220,
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
        const minWidth = node.nodeType === 'pollinations_image' ? 220 : isChapterTimeline ? 760 : 260;
        const minHeight = node.nodeType === 'pollinations_image' ? 160 : isChapterTimeline ? 420 : 180;
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
