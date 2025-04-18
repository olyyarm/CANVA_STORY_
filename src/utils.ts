// src/utils.ts

export const generateNodeId = (): string => `node-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

export const getNodeIcon = (nodeType?: string, label?: string): string => {
// Используем относительные пути от папки public/
switch (nodeType) {
case 'text': return '/text.png';
case 'scene': return '/location.png'; // Иконка локации для сцены
case 'script_input': return '/scenariy_vvod.png';
case 'script_output': return '/scenariy_vvod.png'; // Изменено по референсу
case 'association': return '/generated_associacii_.png';
case 'script_detail':
if (label === 'Герои') return '/character.png';
if (label === 'Локации') return '/location.png';
if (label === 'Настроение') return '/emotion.png';
return '/metaprompt.png'; // Иконка по умолчанию для деталей
default: return '/metaprompt.png'; // Иконка по умолчанию
}
};

// Helper function to calculate text width
export const calculateTextWidth = (text: string, fontStyle: string = 'normal 700 20px Arial'): number => {
// Default font style approximated from Tailwind text-xl bold. Adjust if needed.
// TODO: Verify this font style matches the actual rendered style.
try {
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');
if (!context) {
console.warn('Canvas context not available for width calculation, using estimate.');
return text.length * 10 + 24; // Rough estimate + padding
}
context.font = fontStyle;
const metrics = context.measureText(text);
const horizontalPadding = 24; // Approx padding (e.g., p-3 on each side) - TODO: Verify padding
return Math.ceil(metrics.width) + horizontalPadding;
} catch (e) {
console.error("Error calculating text width:", e);
return text.length * 10 + 24; // Fallback estimate
}
};