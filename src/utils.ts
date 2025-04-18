// src/utils.ts

export const generateNodeId = (): string => `node-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

export const getNodeIcon = (nodeType?: string, label?: string): string => {
  // Получаем базовый URL из Vite (будет '/' при разработке и '/CANVA_STORY_/' при сборке)
  const baseUrl = import.meta.env.BASE_URL || '/';
  // Формируем путь к иконке, убирая лишний слэш, если baseUrl заканчивается на него
  const iconPath = (iconName: string) => `${baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl}/${iconName}`;

  // Используем функцию iconPath для формирования полного пути
  switch (nodeType) {
    case 'text': return iconPath('text.png');
    case 'scene': return iconPath('location.png');
    case 'script_input': return iconPath('scenariy_vvod.png');
    case 'script_output': return iconPath('scenariy_vvod.png'); // Изменено по референсу
    case 'association': return iconPath('generated_associacii_.png');
    case 'script_detail':
      if (label === 'Герои') return iconPath('character.png');
      if (label === 'Локации') return iconPath('location.png');
      if (label === 'Настроение') return iconPath('emotion.png');
      return iconPath('metaprompt.png'); // Иконка по умолчанию для деталей
    default: return iconPath('metaprompt.png'); // Иконка по умолчанию
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