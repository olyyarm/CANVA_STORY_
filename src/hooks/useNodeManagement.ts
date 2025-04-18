// src/hooks/useNodeManagement.ts
import React, { useState, useCallback, Dispatch, SetStateAction } from 'react';
import { NodesState, NodeData } from '../types';
import { callMistralAPI } from '../api'; // Changed from callIoNetAPI
import {
    ASSOCIATE_SYSTEM_PROMPT,
    SCENARIO_SYSTEM_PROMPT,
HERO_DETAIL_SYSTEM_PROMPT,
LOCATION_DETAIL_SYSTEM_PROMPT,
MOOD_DETAIL_SYSTEM_PROMPT,
SCENE_MASTER_PROMPT_SYSTEM_PROMPT,
MISTRAL_MODELS // Changed from IONET_MODELS
} from '../constants';
import { generateNodeId, calculateTextWidth } from '../utils';

// Тип возвращаемого значения хука
interface UseNodeManagementReturn {
nodes: NodesState;
setNodes: Dispatch<SetStateAction<NodesState>>;
handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
handleThemeInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
handleModelChange: (e: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
handleInitialAssociation: (sourceNodeId: string) => Promise<void>;
handleContinueAssociation: (sourceNodeId: string) => Promise<void>;
handleScriptVisualization: (sourceNodeId: string) => Promise<void>;
handleScenarioDetailClick: (sourceNodeId: string, detailType: 'герои' | 'локации' | 'настроение') => Promise<void>;
handleCreateSceneNodes: (sourceNodeId: string) => void;
handleGenerateScenePrompt: (sceneNodeId: string) => Promise<void>;
handleCopyToClipboard: (textToCopy: string) => Promise<void>;
handleGeneratePollinationsImage: (nodeId: string) => Promise<void>; // Added for Pollinations
}

export const useNodeManagement = (initialNodes: NodesState): UseNodeManagementReturn => {
const [nodes, setNodes] = useState<NodesState>(initialNodes);

const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string): void => {
    const newValue = e.target.value;
    setNodes(prevNodes => ({ ...prevNodes, [nodeId]: { ...prevNodes[nodeId], inputValue: newValue } }));
}, []);

const handleThemeInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string): void => {
    const newValue = e.target.value;
    setNodes(prevNodes => ({ ...prevNodes, [nodeId]: { ...prevNodes[nodeId], themeInputValue: newValue } }));
}, []);

const handleModelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>, nodeId: string): void => {
    const newModel = e.target.value;
    setNodes(prevNodes => ({ ...prevNodes, [nodeId]: { ...prevNodes[nodeId], selectedModel: newModel } }));
}, []);

const handleContinueAssociation = useCallback(async (sourceNodeId: string) => {
    console.log('[HANDLER] handleContinueAssociation triggered for: ' + sourceNodeId);
    // ... (rest of the function remains the same) ...
    let latestNodesSnapshot: NodesState = {};
    setNodes(prevNodes => {
        latestNodesSnapshot = { ...prevNodes };
        return prevNodes;
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    const sourceNode = latestNodesSnapshot[sourceNodeId];

    if (!sourceNode) {
        console.error('[HANDLER] Node ' + sourceNodeId + ' not found in snapshot.');
        return;
    }
    if (sourceNode.isLoading) {
        console.log('[HANDLER] Node ' + sourceNodeId + ' is already loading.');
        return;
    }

    let associationsToUse = sourceNode.fullAssociations;
    let sourceNodeUpdateForApi: Partial<NodeData> = {};

    if (!associationsToUse) {
        const promptInput = sourceNode.nodeType === 'text' ? sourceNode.inputValue : sourceNode.label;
        if (!promptInput) {
            console.warn('[HANDLER] No input/label for node ' + sourceNodeId + '.');
            return;
        }
        console.log('[HANDLER] Fetching full associations for node ' + sourceNodeId);

        // Set loading state before API call
        setNodes(prev => ({ ...prev, [sourceNodeId]: { ...prev[sourceNodeId], isLoading: true } }));
        let generatedContent: string | null = null;
        try {
            const modelToUse = sourceNode.selectedModel || MISTRAL_MODELS[0]; // Use selected or default Mistral model
            generatedContent = await callMistralAPI(promptInput, modelToUse, ASSOCIATE_SYSTEM_PROMPT); // Changed function call
        } catch (error) {
            console.error('[HANDLER] Mistral API error in handleContinueAssociation:', error); // Updated error context
            alert(`Ошибка API Mistral: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); // Updated error context
            // Error is handled, generatedContent remains null
        } finally {
             // Clear loading state in finally block
             setNodes(prev => prev[sourceNodeId] ? ({ ...prev, [sourceNodeId]: { ...prev[sourceNodeId], isLoading: false } }) : prev);
        }

        if (!generatedContent) return; // Exit if API failed or returned empty

        associationsToUse = generatedContent.split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        sourceNodeUpdateForApi = {
            fullAssociations: associationsToUse,
            nextAssociationIndex: 0,
        };
    } else {
        console.log('[HANDLER] Using existing associations for node ' + sourceNodeId);
        associationsToUse = Array.isArray(associationsToUse) ? associationsToUse : [];
    }

    const currentFullList = associationsToUse ?? [];
    const currentNextIndex = sourceNodeUpdateForApi.nextAssociationIndex ?? sourceNode.nextAssociationIndex ?? 0;

    if (currentNextIndex >= currentFullList.length) {
        console.log('[HANDLER] All associations shown for ' + sourceNodeId);
        alert('Все ассоциации для этой ветки уже показаны.');
        return;
    }

    const batchSize = 5;
    const endIndex = Math.min(currentNextIndex + batchSize, currentFullList.length);
    const batchToGenerate = currentFullList.slice(currentNextIndex, endIndex);

    if (batchToGenerate.length === 0) {
        console.log('[HANDLER] Empty batch for ' + sourceNodeId + ', although index was within bounds.');
        return;
    }

    console.log('[HANDLER] Generating batch [' + currentNextIndex + '-' + (endIndex - 1) + '] for ' + sourceNodeId);

    const horizontalSpacing = 40;
    const verticalSpacing = 15;
    const fixedHeight = 50;
    const defaultWidth = sourceNode.width ?? 150;
    const minNodeWidth = 80;

    const startX = sourceNode.x + defaultWidth + horizontalSpacing;

    let lastChildY = -Infinity;
    let childrenExist = false;
    Object.values(latestNodesSnapshot).forEach(node => {
        if (node.parentId === sourceNodeId) {
            lastChildY = Math.max(lastChildY, node.y);
            childrenExist = true;
        }
    });

    let currentY = childrenExist
        ? lastChildY + fixedHeight + verticalSpacing
        : sourceNode.y;

    const newNodes: NodesState = {};
    const sourceLevel = sourceNode.level ?? 0;
    const labelFontStyle = 'normal 400 14px Arial';

    batchToGenerate.forEach((blockText) => {
        let calculatedWidth = calculateTextWidth(blockText, labelFontStyle);
        calculatedWidth = Math.max(calculatedWidth, minNodeWidth);
        const newNodeId = generateNodeId();

        newNodes[newNodeId] = {
            nodeType: 'association',
            x: startX,
            y: currentY,
            label: blockText,
            width: calculatedWidth + 40,
            height: fixedHeight,
            isGenerated: true,
            canContinue: true,
            level: sourceLevel + 1,
            parentId: sourceNodeId,
        };
        currentY += fixedHeight + verticalSpacing;
    });

    setNodes(prevNodes => {
        const finalSourceNodeState = prevNodes[sourceNodeId];
        if (!finalSourceNodeState) return prevNodes;

        return {
            ...prevNodes,
            ...newNodes,
            [sourceNodeId]: {
                ...finalSourceNodeState,
                ...sourceNodeUpdateForApi,
                nextAssociationIndex: endIndex
            }
        };
    });
    console.log('[HANDLER] State updated. Next index for ' + sourceNodeId + ' is ' + endIndex);
}, [setNodes]);

const handleInitialAssociation = useCallback(async (sourceNodeId: string) => {
    console.log('[HANDLER] handleInitialAssociation called for: ' + sourceNodeId + ', delegating to handleContinueAssociation');
    await handleContinueAssociation(sourceNodeId);
}, [handleContinueAssociation]);

 const handleScriptVisualization = useCallback(async (sourceNodeId: string) => {
    console.log('[HANDLER] handleScriptVisualization called for: ' + sourceNodeId);
    // ... (rest of the function remains the same) ...
     let sourceNode: NodeData | undefined;
     setNodes(prev => {
         sourceNode = prev[sourceNodeId];
         return prev;
     });
     await new Promise(resolve => setTimeout(resolve, 0));

     if (!sourceNode || !sourceNode.inputValue || !sourceNode.outputNodeLabel) {
         console.error("Source node or required fields missing");
         return;
     }

     let systemPromptToUse = SCENARIO_SYSTEM_PROMPT;
     const theme = sourceNode.themeInputValue?.trim();

     if (theme) {
         systemPromptToUse = `${SCENARIO_SYSTEM_PROMPT}\n\nВажно: При создании сценария обязательно учти и творчески переосмысли материал в соответствии со следующей темой/сеттингом: "${theme}".`;
         console.log('[HANDLER] Using modified system prompt with theme: ' + theme);
     } else {
        console.log('[HANDLER] Using standard system prompt.');
     }

     // Set loading state before API call
     setNodes(prev => ({ ...prev, [sourceNodeId]: { ...prev[sourceNodeId], isLoading: true } }));
     let generatedContent: string | null = null;
     try {
        const modelToUse = sourceNode.selectedModel || MISTRAL_MODELS[0]; // Use selected or default Mistral model
        console.log('[HANDLER] Using model: ' + modelToUse);
        generatedContent = await callMistralAPI(sourceNode.inputValue, modelToUse, systemPromptToUse); // Changed function call
     } catch (error) {
        console.error('[HANDLER] Mistral API error in handleScriptVisualization:', error); // Updated error context
        alert(`Ошибка API Mistral: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); // Updated error context
        // Error is handled, generatedContent remains null
     } finally {
        // Clear loading state in finally block
        setNodes(prev => prev[sourceNodeId] ? ({ ...prev, [sourceNodeId]: { ...prev[sourceNodeId], isLoading: false } }) : prev);
     }

     if (!generatedContent) return; // Exit if API failed

     const newNodeId = generateNodeId();
     const newNodeData: NodeData = {
         nodeType: 'script_output',
         x: sourceNode.x + (sourceNode.width ?? 300) + 40,
         y: sourceNode.y,
         label: sourceNode.outputNodeLabel,
         width: 400, height: 350,
         isGenerated: true, canContinue: false, level: (sourceNode.level ?? 0) + 1,
         isLoading: false,
         parentId: sourceNodeId, inputValue: generatedContent,
         outputNodeLabel: sourceNode.outputNodeLabel
     };

     setNodes(prevNodes => ({ ...prevNodes, [newNodeId]: newNodeData }));
 }, [setNodes]);

 const handleScenarioDetailClick = useCallback(async (sourceNodeId: string, detailType: 'герои' | 'локации' | 'настроение') => {
    console.log('[SCENARIO BTN] Clicked on node ' + sourceNodeId + ', detail: ' + detailType);
    // ... (rest of the function remains the same) ...
     let sourceNode: NodeData | undefined;
     setNodes(prev => {
         sourceNode = prev[sourceNodeId];
         return prev;
     });
     await new Promise(resolve => setTimeout(resolve, 0));

     if (!sourceNode || !sourceNode.inputValue || sourceNode.isLoading) {
         console.error("Source node, inputValue, or isLoading is invalid");
         return;
     }

     let systemPrompt = '';
     let newNodeLabel = '';
     let newNodeWidth = 300;
     let newNodeHeight = 200;

     switch (detailType) {
         case 'герои':
             systemPrompt = HERO_DETAIL_SYSTEM_PROMPT;
             newNodeLabel = 'Герои';
             newNodeHeight = 250;
             break;
         case 'локации':
             systemPrompt = LOCATION_DETAIL_SYSTEM_PROMPT;
             newNodeLabel = 'Локации';
             newNodeHeight = 250;
             break;
         case 'настроение':
             systemPrompt = MOOD_DETAIL_SYSTEM_PROMPT;
             newNodeLabel = 'Настроение';
             newNodeHeight = 250;
             break;
         default:
             console.error("Unknown detail type:", detailType);
             return;
     }

     // Set loading state before API call
     setNodes(prev => ({ ...prev, [sourceNodeId]: { ...prev[sourceNodeId], isLoading: true } }));
     let generatedContent: string | null = null;
     try {
         const modelToUse = sourceNode.selectedModel || MISTRAL_MODELS[0]; // Use selected or default Mistral model
         console.log('[HANDLER] Using model for detail: ' + modelToUse);
         generatedContent = await callMistralAPI(sourceNode.inputValue, modelToUse, systemPrompt); // Changed function call
     } catch (error) {
         console.error('[HANDLER] Mistral API error in handleScenarioDetailClick:', error); // Updated error context
         alert(`Ошибка API Mistral: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); // Updated error context
     } finally {
         // Clear loading state in finally block
         setNodes(prev => prev[sourceNodeId] ? ({ ...prev, [sourceNodeId]: { ...prev[sourceNodeId], isLoading: false } }) : prev);
     }

     if (!generatedContent) return; // Exit if API failed

     const newNodeId = generateNodeId();
     const newNodeData: NodeData = {
         nodeType: 'script_detail',
         x: sourceNode.x,
         y: sourceNode.y + (sourceNode.height ?? 350) + 20,
         label: newNodeLabel,
         width: newNodeWidth, height: newNodeHeight,
         isGenerated: true, canContinue: false,
         level: (sourceNode.level ?? 0) + 1,
         parentId: sourceNodeId,
         inputValue: generatedContent,
         isLoading: false,
     };
     setNodes(prevNodes => ({ ...prevNodes, [newNodeId]: newNodeData }));
 }, [setNodes]);

 const handleCreateSceneNodes = useCallback((sourceNodeId: string) => {
    console.log('[SCENE CREATE] Clicked on node ' + sourceNodeId);
     let sourceNode: NodeData | undefined;
      setNodes(prev => {
         sourceNode = prev[sourceNodeId];
         return prev;
     });

     if (!sourceNode || sourceNode.isLoading) {
         console.log('[SCENE CREATE] Source node missing or loading.');
         return;
     }

     const sceneCountStr = window.prompt("Сколько сцен создать?");
     if (sceneCountStr === null) {
         console.log('[SCENE CREATE] User cancelled.');
         return;
     }

     const sceneCount = parseInt(sceneCountStr, 10);
     if (isNaN(sceneCount) || sceneCount <= 0) {
         alert('Пожалуйста, введите корректное положительное число сцен.');
         console.log(`[SCENE CREATE] Invalid input: ${sceneCountStr}`);
         return;
     }

     console.log(`[SCENE CREATE] User requested ${sceneCount} scenes.`);

     const nodeWidth = 300;
     const nodeHeight = 300;
     const spacing = 15;
     const startX = sourceNode.x + (sourceNode.width ?? 400) + 40;
     let currentY = sourceNode.y;

     const newNodes: NodesState = {};
     for (let i = 1; i <= sceneCount; i++) {
         const newNodeId = generateNodeId();
         newNodes[newNodeId] = {
             nodeType: 'scene',
             x: startX,
             y: currentY,
             label: `СЦЕНА ${i}`,
             width: nodeWidth,
             height: nodeHeight,
             level: (sourceNode.level ?? 0) + 1,
             parentId: sourceNodeId,
             isGenerated: true,
             canContinue: false,
             hasGenerationButton: true,
             masterPrompt: '',
             isLoading: false,
             // Initialize Pollinations fields for new scene nodes
             isLoadingImage: false,
             // Removed pollinationsImageUrl initialization
             pollinationsApiError: undefined,
         };
         currentY += nodeHeight + spacing;
     }

     setNodes(prevNodes => ({ ...prevNodes, ...newNodes }));
     console.log('[SCENE CREATE] Added ' + sceneCount + ' scene nodes.');
 }, [setNodes]);

 const handleGenerateScenePrompt = useCallback(async (sceneNodeId: string) => {
    console.log('[SCENE PROMPT GEN] Triggered for node: ' + sceneNodeId);
    // ... (rest of the function remains the same) ...
     let sceneNode: NodeData | undefined;
     let parentNode: NodeData | undefined;
     let detailNodes: { heroes?: NodeData, locations?: NodeData, mood?: NodeData } = {};

     setNodes(prev => {
         sceneNode = prev[sceneNodeId];
         if (sceneNode?.parentId) {
             parentNode = prev[sceneNode.parentId];
             if (parentNode) {
                 Object.values(prev).forEach(node => {
                     if (node.parentId === sceneNode?.parentId && node.nodeType === 'script_detail') {
                         if (node.label === 'Герои') detailNodes.heroes = node;
                         else if (node.label === 'Локации') detailNodes.locations = node;
                         else if (node.label === 'Настроение') detailNodes.mood = node;
                     }
                 });
             }
         }
         if (sceneNode) {
            return { ...prev, [sceneNodeId]: { ...sceneNode, isLoading: true, masterPrompt: '' } };
         }
         return prev;
     });
     await new Promise(resolve => setTimeout(resolve, 0));

     if (!sceneNode || sceneNode.nodeType !== 'scene') {
         console.error("[SCENE PROMPT GEN] Error: Invalid node type or node not found for ID:", sceneNodeId);
         alert("Ошибка: Не удалось найти узел сцены.");
         setNodes(prev => prev[sceneNodeId] ? ({ ...prev, [sceneNodeId]: { ...prev[sceneNodeId], isLoading: false } }) : prev);
         return;
     }
     if (!parentNode || parentNode.nodeType !== 'script_output' || !parentNode.inputValue) {
         console.error("[SCENE PROMPT GEN] Error: Parent node is not a valid script_output or missing inputValue. Parent ID:", sceneNode.parentId);
         alert("Ошибка: Не найден родительский узел 'СЦЕНАРИЙ ВИЗУАЛИЗАЦИЯ' или он пуст.");
         setNodes(prev => ({ ...prev, [sceneNodeId]: { ...prev[sceneNodeId], isLoading: false } }));
         return;
     }

     const scenarioText = parentNode.inputValue;
     const heroesText = detailNodes.heroes?.inputValue ?? '';
     const locationsText = detailNodes.locations?.inputValue ?? '';
     const moodText = detailNodes.mood?.inputValue ?? '';

     if (!heroesText || !locationsText || !moodText) {
         const missing = [
             !heroesText ? "'Герои'" : "",
             !locationsText ? "'Локации'" : "",
             !moodText ? "'Настроение'" : ""
         ].filter(Boolean).join(", ");
         console.error('[SCENE PROMPT GEN] Error: Missing detail nodes or their content for parent ' + sceneNode.parentId + '. Missing: ' + missing);
         alert('Ошибка: Не найдены узлы деталей (' + missing + ') или их содержимое пусто для этого сценария.');
         setNodes(prev => ({ ...prev, [sceneNodeId]: { ...prev[sceneNodeId], isLoading: false } }));
         return;
     }

     const sceneLabel = sceneNode.label;
     if (!sceneLabel) {
         console.error("[SCENE PROMPT GEN] Error: Scene node is missing label:", sceneNodeId);
         alert("Ошибка: У узла сцены отсутствует метка (например, 'СЦЕНА 1').");
         setNodes(prev => ({ ...prev, [sceneNodeId]: { ...prev[sceneNodeId], isLoading: false } }));
         return;
     }

     const systemPrompt = SCENE_MASTER_PROMPT_SYSTEM_PROMPT;
     const userPrompt =


'Сценарий:\n' +
'---\n' +
scenarioText + '\n' +
'---\n\n' +
'Персонажи:\n' +
'---\n' +
heroesText + '\n' +
'---\n\n' +
'Локации:\n' +
'---\n' +
locationsText + '\n' +
'---\n\n' +
'Настроения:\n' +
'---\n' +
moodText + '\n' +
'---\n\n' +
'Задача: Сгенерируй master prompt для визуализации ТОЛЬКО для сцены: "' + sceneLabel + '".';

console.log('[SCENE PROMPT GEN] Calling API for ' + sceneLabel);
     // isLoading was set true earlier (line 382)
     let generatedMasterPrompt: string | null = null;
     try {
         const modelToUse = sceneNode.selectedModel || MISTRAL_MODELS[0]; // Use selected or default Mistral model
         console.log('[SCENE PROMPT GEN] Using model: ' + modelToUse);
         generatedMasterPrompt = await callMistralAPI(userPrompt, modelToUse, systemPrompt); // Changed function call
     } catch (error) {
         console.error('[SCENE PROMPT GEN] Mistral API error:', error); // Updated error context
         alert(`Ошибка API Mistral: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); // Updated error context
         // Error is handled, generatedMasterPrompt remains null
     }
     // finally block for isLoading: false is handled below

     if (generatedMasterPrompt) {
         setNodes(prev => prev[sceneNodeId] ? ({ ...prev, [sceneNodeId]: { ...prev[sceneNodeId], masterPrompt: generatedMasterPrompt, isLoading: false } }) : prev );
         console.log('[SCENE PROMPT GEN] Master prompt generated successfully for ' + sceneNodeId + ' (' + sceneLabel + ')');
     } else {
        console.error('[SCENE PROMPT GEN] Failed to generate master prompt for ' + sceneNodeId + ' (' + sceneLabel + ')');
         setNodes(prev => prev[sceneNodeId] ? ({ ...prev, [sceneNodeId]: { ...prev[sceneNodeId], isLoading: false } }) : prev );
     }
 }, [setNodes]);

 const handleCopyToClipboard = useCallback(async (textToCopy: string) => {
    // ... (rest of the function remains the same) ...
     if (!textToCopy) {
         alert("Нечего копировать!");
         return;
     }
     try {
         await navigator.clipboard.writeText(textToCopy);
         alert('Текст скопирован в буфер обмена!');
     } catch (err) {
         console.error('Ошибка копирования в буфер обмена:', err);
         alert('Не удалось скопировать текст.');
     }
 }, []);

 // --- Pollinations Image Generation (v2: Creates/Updates Child Node) ---
 const handleGeneratePollinationsImage = useCallback(async (parentNodeId: string) => {
   console.log('[POLLINATIONS GEN v2] Triggered for scene node: ' + parentNodeId);

   let parentNodeState: NodeData | undefined;

   // Set loading state on the parent scene node
   setNodes(prev => {
     parentNodeState = prev[parentNodeId];
     if (parentNodeState && parentNodeState.nodeType === 'scene') {
       return { ...prev, [parentNodeId]: { ...parentNodeState, isLoadingImage: true, pollinationsApiError: undefined } };
     }
     return prev; // Node not found or not a scene node
   });

   await new Promise(resolve => setTimeout(resolve, 0)); // Ensure state update propagates

    // Re-fetch state after update, primarily to use parentNodeState for checks below
    setNodes(prev => {
        parentNodeState = prev[parentNodeId];
        return prev;
    });
    await new Promise(resolve => setTimeout(resolve, 0));

   if (!parentNodeState || parentNodeState.nodeType !== 'scene') {
     console.error("[POLLINATIONS GEN v2] Error: Invalid parent node type or node not found:", parentNodeId);
     setNodes(prev => prev[parentNodeId] ? { ...prev, [parentNodeId]: { ...prev[parentNodeId], isLoadingImage: false } } : prev);
     return;
   }

   const prompt = parentNodeState.masterPrompt;
   if (!prompt) {
     console.warn("[POLLINATIONS GEN v2] Warning: Master Prompt is empty for scene node:", parentNodeId);
     alert("Ошибка: Master Prompt пуст. Введите промпт на английском языке.");
     setNodes(prev => ({ ...prev, [parentNodeId]: { ...prev[parentNodeId], isLoadingImage: false } }));
     return;
   }

   const width = 900; // Default API width
   const height = 600; // Default API height
   const encodedPrompt = encodeURIComponent(prompt);
   const apiUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=${width}&height=${height}&seed=0&nologo=1&enhance=1&private=1`;
   console.log(`[POLLINATIONS GEN v2] Calling API: ${apiUrl}`);

   try {
     const response = await fetch(apiUrl);

     if (response.ok) {
       const blob = await response.blob();
       const newImageUrl = URL.createObjectURL(blob);
       console.log("[POLLINATIONS GEN v2] Image generated successfully. New URL:", newImageUrl);

       setNodes(prev => {
         const currentNodes = { ...prev };
         const parentNode = currentNodes[parentNodeId]; // Get parent again within update
         if (!parentNode) return prev; // Should exist, but check

         // Find existing child image node
         let existingImageNodeId: string | undefined = undefined;
         let existingImageNode: NodeData | undefined = undefined;
         for (const id in currentNodes) {
           if (currentNodes[id].parentId === parentNodeId && currentNodes[id].nodeType === 'pollinations_image') {
             existingImageNodeId = id;
             existingImageNode = currentNodes[id];
             break;
           }
         }

         let nodesToUpdate : NodesState = {};

         if (existingImageNodeId && existingImageNode) {
           // Update existing image node
           console.log("[POLLINATIONS GEN v2] Updating existing image node:", existingImageNodeId);
           // Revoke old URL if it exists
           if (existingImageNode.imageUrl) {
              try { URL.revokeObjectURL(existingImageNode.imageUrl); } catch(e) { console.warn("Failed to revoke old image URL", e); }
           }
           nodesToUpdate[existingImageNodeId] = {
               ...existingImageNode,
               imageUrl: newImageUrl
           };
         } else {
           // Create new image node
           const newImageNodeId = generateNodeId();
           console.log("[POLLINATIONS GEN v2] Creating new image node:", newImageNodeId);
           const newX = parentNode.x;
           const newY = parentNode.y + (parentNode.height ?? 300) + 20; // Position below parent
           const newWidth = 200; // Example size
           const newHeight = 150; // Example size

           nodesToUpdate[newImageNodeId] = {
             nodeType: 'pollinations_image',
             label: 'Generated Image', // Optional label
             x: newX,
             y: newY,
             width: newWidth,
             height: newHeight,
             parentId: parentNodeId,
             imageUrl: newImageUrl,
             level: (parentNode.level ?? 0) + 1
           };
         }

         // Update parent node status
         nodesToUpdate[parentNodeId] = {
             ...parentNode,
             isLoadingImage: false,
             pollinationsApiError: undefined
         };

         return { ...currentNodes, ...nodesToUpdate };
       });

     } else { // Handle API error
       const errorText = await response.text();
       console.error("[POLLINATIONS GEN v2] API Error:", response.status, errorText);
       setNodes(prev => {
           const parentNode = prev[parentNodeId];
           return parentNode ? ({ ...prev, [parentNodeId]: { ...parentNode, isLoadingImage: false, pollinationsApiError: `API Error ${response.status}: ${errorText || 'Unknown error'}` } }) : prev;
       });
     }
   } catch (error: any) { // Handle fetch/network error
     console.error("[POLLINATIONS GEN v2] Network or fetch error:", error);
     setNodes(prev => {
         const parentNode = prev[parentNodeId];
         return parentNode ? ({ ...prev, [parentNodeId]: { ...parentNode, isLoadingImage: false, pollinationsApiError: `Network Error: ${error.message || 'Failed to fetch'}` } }) : prev;
     });
   }
 }, [setNodes]);
 // ------------------------------------


// Возвращаем объект, соответствующий интерфейсу UseNodeManagementReturn
return {
    nodes,
    setNodes,
    handleInputChange,
    handleThemeInputChange,
    handleModelChange,
    handleInitialAssociation,
    handleContinueAssociation,
    handleScriptVisualization,
    handleScenarioDetailClick,
    handleCreateSceneNodes,
    handleGenerateScenePrompt,
    handleCopyToClipboard,
    handleGeneratePollinationsImage // Added
};


};
