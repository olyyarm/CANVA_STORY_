# План: Исправление позиционирования кнопки "ГИ"

**Задача:** Переместить кнопку "ГИ" (Генерация Изображения) и связанные с ней индикаторы в верхний правый угол узла типа "СЦЕНА", используя абсолютное позиционирование, и восстановить исходное расположение остальных кнопок (например, "Сгенерировать Prompt") в нижней части узла.

**Проблема:** Текущее размещение кнопки "ГИ" в основном потоке контента узла "СЦЕНА" (в `src/components/NodeRenderer.tsx` строки ~217-233) нарушает верстку и прижимает все нижеследующие элементы, включая другие кнопки, к нижнему краю.

**Решение:**

1.  **Идентификация контейнеров:**
    *   **Основной контейнер узла:** Найти `div`, оборачивающий весь узел (`node-container`), который должен иметь стиль `position: relative;` (вероятно, уже есть из-за логики перетаскивания).
    *   **Блок кнопки "ГИ":** Идентифицировать `div` (строка ~217), который содержит кнопку "ГИ" и ее индикаторы загрузки/ошибки.

2.  **Перемещение блока кнопки "ГИ":**
    *   Логически "вырезать" блок кнопки "ГИ" (строки ~217-233) из его текущего места в потоке.
    *   Вставить этот блок *непосредственно* внутрь основного контейнера узла (`node-container`), разместив его *перед* основным содержимым узла (заголовком, полями ввода и т.д.).

3.  **Применение стилей Tailwind CSS к блоку кнопки "ГИ":**
    *   Добавить классы для абсолютного позиционирования: `absolute top-2 right-2 z-10`. (Отступы `top-2 right-2` можно настроить по вкусу). `z-10` нужен, чтобы кнопка была поверх другого контента.
    *   Удалить классы, ненужные для абсолютного позиционирования: `flex-shrink-0`, `justify-center`, `mt-2.5`, `mb-1`.
    *   Оставить классы для выравнивания элементов внутри блока: `flex items-center gap-2`.

4.  **Проверка:**
    *   Убедиться, что кнопка "ГИ" теперь отображается в верхнем правом углу узла "СЦЕНА".
    *   Проверить, что остальные кнопки (например, "Сгенерировать Prompt") вернулись на свое предполагаемое место в нижней части узла, так как блок "ГИ" больше не влияет на их позицию в потоке.

**Примерная структура в `src/components/NodeRenderer.tsx` после изменений:**

```diff
--- a/src/components/NodeRenderer.tsx
+++ b/src/components/NodeRenderer.tsx
@@ -40,6 +40,24 @@
      */
     const nodeContainerClasses = `node-container absolute flex flex-col bg-[#1E1E1E] border-2 ${borderColor} rounded-lg shadow-lg text-white select-none overflow-hidden`;

+    // --- Pollinations Button and Indicators (Moved to top-right) ---
+    // This block is now positioned absolutely within the main node container
+    const PollinationsControls = node.nodeType === 'scene' && node.masterPrompt && !node.isLoading && (
+        <div className="absolute top-2 right-2 z-10 flex items-center gap-2"> {/* Absolute positioning */}
+            <button
+                onClick={(e) => { stopPropagation(e); onGeneratePollinationsImage(id); }}
+                className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${!node.masterPrompt || node.isLoadingImage ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600 text-black'}`}
+                title="Сгенерировать изображение (Требуется Master Prompt на английском языке)"
+                disabled={!node.masterPrompt || node.isLoadingImage}
+                onMouseDown={stopPropagation}
+            >
+                ГИ
+            </button>
+            {node.isLoadingImage && ( <div className="w-4 h-4 border-2 border-t-orange-500 border-gray-600 rounded-full animate-spin"></div> )}
+            {node.pollinationsApiError && !node.isLoadingImage && ( <div className="w-5 h-5 text-red-500 flex items-center justify-center" title={node.pollinationsApiError}>⚠️</div> )}
+        </div>
+    );
+
     return (
         <div
             id={id}
@@ -48,6 +66,9 @@
             onMouseDown={handleMouseDown}
             onClick={handleClick} // Handle click for selection
         >
+            {/* Render the absolutely positioned controls here */}
+            {PollinationsControls}
+
             {/* --- Top-left icon --- */}
             {node.icon && (
                 <img src={node.icon} alt="Node icon" className="absolute top-1 left-1 w-4 h-4 opacity-70" />
@@ -214,26 +235,7 @@
                                   <div className="text-center text-xs animate-pulse p-1 mb-2 mt-2.5">Генерация Prompt...</div> // Added mt-2.5
                              )}
 
-                             {/* Pollinations Button and Indicators (remain on Scene node) */}
-                             {node.masterPrompt && !node.isLoading && (
-                                  <div className="flex-shrink-0 flex items-center justify-center gap-2 mt-2.5 mb-1"> {/* Added mt-2.5 */}
-                                     <button
-                                         onClick={(e) => { stopPropagation(e); onGeneratePollinationsImage(id); }}
-                                         className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${!node.masterPrompt || node.isLoadingImage ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600 text-black'}`}
-                                         title="Сгенерировать изображение (Требуется Master Prompt на английском языке)"
-                                         disabled={!node.masterPrompt || node.isLoadingImage}
-                                         onMouseDown={stopPropagation}
-                                     >
-                                         ГИ
-                                     </button>
-                                     {node.isLoadingImage && ( // Loading for Image Generation
-                                         <div className="w-4 h-4 border-2 border-t-orange-500 border-gray-600 rounded-full animate-spin"></div>
-                                     )}
-                                     {node.pollinationsApiError && !node.isLoadingImage && (
-                                          <div className="w-5 h-5 text-red-500 flex items-center justify-center" title={node.pollinationsApiError}>⚠️</div>
-                                     )}
-                                 </div>
-                             )}
+                             {/* Pollinations Button block was moved up */}
                          </div>
                       )}
                   </div>

```

**Следующий шаг:** После подтверждения успешной записи файла, можно будет переключиться в режим "Code" для применения этих изменений.