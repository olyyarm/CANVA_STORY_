import { Dispatch, RefObject, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { CANVAS_LIMITS } from '../constants';
import { NodesState, ViewportState } from '../types';

interface UseCanvasNavigationProps {
  canvasRef: RefObject<HTMLDivElement | null>;
  nodes: NodesState;
  viewport: ViewportState;
  setViewport: Dispatch<SetStateAction<ViewportState>>;
  onBackgroundClick?: () => void;
}

const clampZoom = (zoom: number) =>
  Math.min(CANVAS_LIMITS.maxZoom, Math.max(CANVAS_LIMITS.minZoom, zoom));

export const useCanvasNavigation = ({
  canvasRef,
  nodes,
  viewport,
  setViewport,
  onBackgroundClick,
}: UseCanvasNavigationProps) => {
  const [isPanning, setIsPanning] = useState(false);
  const viewportRef = useRef(viewport);
  const panState = useRef<null | {
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>(null);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const commitViewport = useCallback((next: ViewportState) => {
    viewportRef.current = next;
    setViewport(next);
  }, [setViewport]);

  const handleCanvasMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-node-id], button, input, textarea, select, a')) return;
    event.preventDefault();
    onBackgroundClick?.();
    setIsPanning(true);
    panState.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: viewportRef.current.x,
      originY: viewportRef.current.y,
    };
  }, [onBackgroundClick]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const pan = panState.current;
      if (!pan) return;
      commitViewport({
        ...viewportRef.current,
        x: pan.originX + event.clientX - pan.startX,
        y: pan.originY + event.clientY - pan.startY,
      });
    };
    const handleMouseUp = () => {
      if (!panState.current) return;
      panState.current = null;
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [commitViewport]);

  const zoomAtPoint = useCallback((nextZoom: number, clientX?: number, clientY?: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const current = viewportRef.current;
    const zoom = clampZoom(nextZoom);
    const localX = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const localY = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const worldX = (localX - current.x) / current.zoom;
    const worldY = (localY - current.y) / current.zoom;
    commitViewport({
      zoom,
      x: localX - worldX * zoom,
      y: localY - worldY * zoom,
    });
  }, [canvasRef, commitViewport]);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const nextZoom = viewportRef.current.zoom + direction * CANVAS_LIMITS.zoomStep;
    zoomAtPoint(nextZoom, event.clientX, event.clientY);
  }, [zoomAtPoint]);

  const fitView = useCallback((maximumZoom = 1) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const nodeList = Object.values(nodes);
    if (!rect || nodeList.length === 0) {
      commitViewport({ x: 48, y: 48, zoom: 1 });
      return;
    }

    const minX = Math.min(...nodeList.map((node) => node.x));
    const minY = Math.min(...nodeList.map((node) => node.y));
    const maxX = Math.max(...nodeList.map((node) => node.x + (node.width ?? 300)));
    const maxY = Math.max(...nodeList.map((node) => node.y + (node.height ?? 220)));
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    const padding = 72;
    const zoom = clampZoom(Math.min(
      maximumZoom,
      (rect.width - padding * 2) / contentWidth,
      (rect.height - padding * 2) / contentHeight,
    ));
    commitViewport({
      zoom,
      x: (rect.width - contentWidth * zoom) / 2 - minX * zoom,
      y: (rect.height - contentHeight * zoom) / 2 - minY * zoom,
    });
  }, [canvasRef, commitViewport, nodes]);

  const centerView = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const nodeList = Object.values(nodes);
    if (!rect || nodeList.length === 0) return;
    const minX = Math.min(...nodeList.map((node) => node.x));
    const minY = Math.min(...nodeList.map((node) => node.y));
    const maxX = Math.max(...nodeList.map((node) => node.x + (node.width ?? 300)));
    const maxY = Math.max(...nodeList.map((node) => node.y + (node.height ?? 220)));
    const current = viewportRef.current;
    commitViewport({
      ...current,
      x: rect.width / 2 - ((minX + maxX) / 2) * current.zoom,
      y: rect.height / 2 - ((minY + maxY) / 2) * current.zoom,
    });
  }, [canvasRef, commitViewport, nodes]);

  const zoomIn = useCallback(() => {
    zoomAtPoint(viewportRef.current.zoom + CANVAS_LIMITS.zoomStep);
  }, [zoomAtPoint]);
  const zoomOut = useCallback(() => {
    zoomAtPoint(viewportRef.current.zoom - CANVAS_LIMITS.zoomStep);
  }, [zoomAtPoint]);
  const resetZoom = useCallback(() => zoomAtPoint(1), [zoomAtPoint]);

  return {
    isPanning,
    handleCanvasMouseDown,
    handleWheel,
    fitView,
    centerView,
    zoomIn,
    zoomOut,
    resetZoom,
  };
};
