// src/hooks/useDraggableNodes.ts
import React, { useState, useRef, useEffect, useCallback, Dispatch, SetStateAction } from 'react';
import { NodesState } from '../types'; // Импортируем типы

interface UseDraggableNodesProps {
  nodes: NodesState;
  setNodes: Dispatch<SetStateAction<NodesState>>;
  canvasOffset: { x: number; y: number }; // Added canvasOffset
}

export const useDraggableNodes = ({ nodes, setNodes, canvasOffset }: UseDraggableNodesProps) => { // Added canvasOffset
const draggingNodeId = useRef<string | null>(null);
const offset = useRef({ x: 0, y: 0 });

const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>, nodeId: string) => {
    if (e.button !== 0) return; // Только левая кнопка мыши
    const target = e.target as HTMLElement;
    // Игнорируем клики по элементам ввода, кнопкам и т.д., чтобы не мешать их функциональности
    if (target.closest('textarea, button, select, input')) return;

    draggingNodeId.current = nodeId;
    const nodeElement = e.currentTarget;
    const rect = nodeElement.getBoundingClientRect();
    const canvasArea = document.getElementById('canvas-area'); // Получаем родительский контейнер
    const canvasRect = canvasArea ? canvasArea.getBoundingClientRect() : { left: 0, top: 0 };

    // Рассчитываем смещение клика мыши относительно верхнего левого угла самого узла
    offset.current = {
        x: e.clientX - rect.left, // Correct offset calculation
        y: e.clientY - rect.top  // Correct offset calculation
    };

    e.preventDefault(); // Предотвращаем стандартное поведение (например, выделение текста)

    // Поднимаем перетаскиваемый узел наверх
    const currentLevel = nodes[nodeId]?.level ?? 1;
    nodeElement.style.zIndex = `${currentLevel + 10}`; // Делаем его выше других узлов

    // Опционально: можно сбросить zIndex других узлов на их уровень, если нужно
    // Object.keys(nodes).forEach(id => {
    //     if (id !== nodeId) {
    //         const el = document.getElementById(`node-${id}`);
    //         if (el) el.style.zIndex = `${nodes[id]?.level ?? 1}`;
    //     }
    // });
}, [nodes]); // Зависимость от nodes нужна для currentLevel

const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingNodeId.current) return;
    const nodeId = draggingNodeId.current;

    const canvasArea = document.getElementById('canvas-area');
    if (!canvasArea) return; // Выходим, если нет canvas
    const canvasRect = canvasArea.getBoundingClientRect();

    // Рассчитываем новые координаты внутри untransformed #canvas-area
    let newX = e.clientX - canvasRect.left - offset.current.x; // Removed subtraction of canvasOffset.x
    let newY = e.clientY - canvasRect.top - offset.current.y; // Removed subtraction of canvasOffset.y

    // Ограничиваем перемещение внутри видимой области canvasArea (опционально)
    // newX = Math.max(0, Math.min(newX, canvasRect.width - (nodes[nodeId]?.width ?? 0)));
    // newY = Math.max(0, Math.min(newY, canvasRect.height - (nodes[nodeId]?.height ?? 0)));

    setNodes(prevNodes => {
        // Проверяем, существует ли еще узел (на случай асинхронного удаления)
        if (!prevNodes[nodeId]) {
            return prevNodes;
        }
        return {
            ...prevNodes,
            [nodeId]: { ...prevNodes[nodeId], x: newX, y: newY }
        };
    });
}, [setNodes, canvasOffset]); // Added canvasOffset to dependency array

const handleMouseUp = useCallback(() => {
    if (draggingNodeId.current) {
        const nodeId = draggingNodeId.current;
        const nodeElement = document.getElementById(`node-${nodeId}`);
        // Возвращаем zIndex к нормальному уровню
        if (nodeElement && nodes[nodeId]) {
             nodeElement.style.zIndex = `${nodes[nodeId]?.level ?? 1}`;
        }
        draggingNodeId.current = null; // Сбрасываем ID перетаскиваемого узла
    }
}, [nodes]); // Зависимость от nodes нужна для level

// Глобальные слушатели для mousemove и mouseup
useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => handleMouseMove(e);
    const handleGlobalMouseUp = () => handleMouseUp();

    // Добавляем слушателей, только если началось перетаскивание (оптимизация)
    // Но проще добавить их сразу и проверять draggingNodeId.current внутри обработчиков
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp, true); // true для фазы захвата, чтобы поймать mouseup даже вне узла

    return () => {
        // Очищаем слушателей при размонтировании компонента или изменении обработчиков
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp, true);
    };
}, [handleMouseMove, handleMouseUp]); // Пересоздаем слушателей, если обработчики изменились

return { handleMouseDown }; // Возвращаем только handleMouseDown, т.к. остальные глобальные


};