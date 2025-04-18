// src/components/NodeRenderer.tsx
import React from 'react';
import { NodeData } from '../types';
import { getNodeIcon } from '../utils';
import { MISTRAL_MODELS } from '../constants'; // Changed from IONET_MODELS

interface NodeRendererProps {
id: string;
node: NodeData;
onMouseDown: (e: React.MouseEvent<HTMLDivElement>, nodeId: string) => void;
onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
onThemeInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
onModelChange: (e: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
onContinueAssociation: (nodeId: string) => void;
onScriptVisualize: (nodeId: string) => void;
onScenarioDetailClick: (nodeId: string, detailType: 'герои' | 'локации' | 'настроение') => void;
onCreateSceneNodes: (nodeId: string) => void;
onGenerateScenePrompt: (nodeId: string) => void;
onCopyToClipboard: (text: string) => void;
onGeneratePollinationsImage: (nodeId: string) => Promise<void>;
}

const NodeRenderer: React.FC<NodeRendererProps> = ({
id,
node,
onMouseDown,
onInputChange,
onThemeInputChange,
onModelChange,
onContinueAssociation,
onScriptVisualize,
onScenarioDetailClick,
onCreateSceneNodes,
onGenerateScenePrompt,
onCopyToClipboard,
onGeneratePollinationsImage
}) => {

const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

// Determine border color based on node type
let borderColor = 'border-[#3d3c4e]'; // Default border
if (node.nodeType === 'script_output') {
    borderColor = 'border-[#f88407]';
} else if (node.nodeType === 'pollinations_image') {
    borderColor = 'border-blue-400'; // Blue border for image nodes
}

// Base classes
const baseClasses = "node-background absolute rounded-2xl cursor-grab active:cursor-grabbing select-none flex flex-col text-white shadow-xl shadow-black/40 pointer-events-auto"; // Added pointer-events-auto

return (
    // Root element handles dragging via onMouseDown
    <div
        key={id} id={`node-${id}`}
        className={`${baseClasses} ${borderColor}`}
        style={{
            left: `${node.x}px`, top: `${node.y}px`,
            width: `${node.width}px`, height: `${node.height}px`,
            zIndex: node.level ?? 1, minHeight: '50px',
        }}
        onMouseDown={(e) => onMouseDown(e, id)}
    >
        {/* --- Top-right indicators/buttons --- */}
        {node.nodeType === 'association' && node.isGenerated && node.canContinue && !node.isLoading && (
            <button onClick={(e) => { stopPropagation(e); onContinueAssociation(id); }} className="absolute top-0 right-0 w-5 h-5 bg-teal-500 hover:bg-teal-400 rounded-2xl text-xs font-bold flex items-center justify-center z-20" title="Продолжить" onMouseDown={stopPropagation}> C </button>
        )}
        {node.nodeType !== 'scene' && node.nodeType !== 'pollinations_image' && node.isLoading && ( // General loading indicator
            <div className="absolute top-0 right-0 w-5 h-5 bg-gray-500 rounded-bl text-xs flex items-center justify-center z-20 animate-pulse" title="Загрузка...">...</div>
        )}

        {/* --- Main Node Content Area (Handles padding differently for image node) --- */}
        <div className={`flex-grow flex flex-col overflow-hidden ${node.nodeType !== 'pollinations_image' ? 'p-2' : ''}`}>
            {/* Header (Common for most types, excluding image node) */}
            {node.label && node.nodeType !== 'pollinations_image' && (
                 <div className="node-header flex items-center p-1 mb-1 border-gray-700 flex-shrink-0">
                    <div className="w-6 h-6 mr-2 flex-shrink-0 flex items-center justify-center">
                        <img src={getNodeIcon(node.nodeType, node.label)} alt="icon" className="w-6 h-6 object-contain" />
                    </div>
                    <span className={`${node.nodeType === 'association' ? 'node-association-label' : 'text-[#f88507] font-bold text-lg'}`}>{node.label}</span>
                </div>
            )}

            {/* Inner Content Container */}
            <div className={`flex-grow flex flex-col min-h-0 ${node.nodeType === 'pollinations_image' ? 'h-full' : ''}`}>

                {/* --- Input Fields (Text, Script Input) --- */}
                {node.nodeType === 'text' && node.hasInput && (
                    <textarea value={node.inputValue} onChange={(e) => onInputChange(e, id)}
                        className={`w-full bg-[#0a090f] border border-gray-700 text-gray-300 rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder-gray-500 mb-2 h-16 flex-shrink-0`}
                        placeholder={"Введите слово..."}
                        rows={3}
                        onMouseDown={stopPropagation} disabled={node.isLoading}
                    />
                )}
                 {node.nodeType === 'script_input' && node.hasInput && (
                     <>
                        <textarea value={node.inputValue} onChange={(e) => onInputChange(e, id)}
                            className={`w-full bg-[#0a090f] border border-gray-700 text-gray-300 rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder-gray-500 mb-2 min-h-[100px]`}
                            placeholder={"Введите текст сценария..."}
                            rows={4}
                            onMouseDown={stopPropagation} disabled={node.isLoading}
                        />
                        <textarea value={node.themeInputValue} onChange={(e) => onThemeInputChange(e, id)}
                            className="bg-[#0a090f] border border-gray-700 text-gray-300 rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder-gray-500 flex-shrink-0 mb-2 script-input-theme-textarea"
                            placeholder="Стилизационный промпт (опционально)..."
                            rows={2}
                            onMouseDown={stopPropagation} disabled={node.isLoading}
                        />
                        <label htmlFor={`model-select-${id}`} className="text-orange-500 font-semibold text-xs block mb-1 pl-2">Модель</label>
                        <select
                            id={`model-select-${id}`}
                            value={node.selectedModel}
                            onChange={(e) => onModelChange(e, id)}
                            className="w-full mx-auto bg-gray-900/70 border border-gray-700/80 text-gray-200 p-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 flex-shrink-0 mb-2 appearance-none script-input-model-select"
                            onMouseDown={stopPropagation} disabled={node.isLoading}
                        >
                            {MISTRAL_MODELS.map(modelName => ( // Changed from IONET_MODELS
                                <option key={modelName} value={modelName}>{modelName}</option>
                            ))}
                        </select>
                    </>
                 )}

                 {/* --- Generated Text Output (Script Output, Script Detail) --- */}
                 {node.isGenerated && node.inputValue && (node.nodeType === 'script_output' || node.nodeType === 'script_detail') && (
                     <div className="relative mt-1 flex-grow min-h-0">
                        <div className={`scenario-output-common text-left text-xs p-2 bg-[#0a090f] border border-gray-700 rounded-lg break-words whitespace-pre-wrap h-full overflow-y-auto ${node.nodeType === 'script_output' ? 'scenario-output-main' : 'scenario-output-detail'}`}>
                            {node.inputValue}
                        </div>
                        {node.inputValue && (
                            <button
                                onClick={(e) => { stopPropagation(e); onCopyToClipboard(node.inputValue || ''); }}
                                className="copy-to-clipboard-button absolute top-1 right-1 w-5 h-5 p-0 border-none bg-black bg-opacity-50 rounded cursor-pointer flex items-center justify-center"
                                title="Копировать текст"
                                onMouseDown={stopPropagation}
                            >
                                <img src="/icon/copy.svg" alt="Copy" className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                 )}
                 {/* Association label (if no header) */}
                 {node.nodeType === 'association' && !node.label && node.inputValue && (
                      <div className="flex items-center justify-start text-left flex-grow text-sm p-1 break-words">
                          {node.inputValue}
                      </div>
                 )}

                {/* --- Buttons Area --- */}
                <div className="mt-auto flex-shrink-0 pt-1">
                    {/* Generate Button (Text, Script Input) */}
                    {node.hasButton && (node.nodeType === 'text' || node.nodeType === 'script_input') && (
                        <div className="flex justify-center mt-2.5"> {/* Added mt-2.5 here */}
                            <button onClick={(e) => {
                                    stopPropagation(e);
                                    if (node.nodeType === 'text') { onContinueAssociation(id); }
                                    else if (node.nodeType === 'script_input') { onScriptVisualize(id); }
                                }}
                                className={`w-[90%] h-8 rounded-full py-1 text-sm font-bold text-center mb-1 ${node.isLoading ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-[#f88507] hover:bg-orange-500 text-[#0a090f] shadow-md'}`}
                                disabled={node.isLoading}>
                                {node.isLoading ? 'Генерация...' : (node.buttonLabel ?? 'Сгенерировать')}
                            </button>
                        </div>
                    )}

                    {/* Scenario Detail Buttons (Script Output) */}
                    {node.nodeType === 'script_output' && !node.isLoading && (
                         <div className="flex flex-col items-center mt-2.5"> {/* Added mt-2.5 here */}
                            <div className="flex gap-x-1 mb-2 w-full px-1">
                                <button onClick={(e) => { stopPropagation(e); onScenarioDetailClick(id, 'герои'); }} className="flex-1 text-xs py-1 px-1 rounded-2xl shadow script-output-button-heroes" onMouseDown={stopPropagation}>Герои</button>
                                <button onClick={(e) => { stopPropagation(e); onScenarioDetailClick(id, 'локации'); }} className="flex-1 text-xs py-1 px-1 rounded-2xl shadow script-output-button-locations" onMouseDown={stopPropagation}>Локации</button>
                                <button onClick={(e) => { stopPropagation(e); onScenarioDetailClick(id, 'настроение'); }} className="flex-1 text-xs py-1 px-1 rounded-2xl shadow script-output-button-mood" onMouseDown={stopPropagation}>Настроение</button>
                            </div>
                            <div className="flex justify-center w-full px-1">
                                <button onClick={(e) => { stopPropagation(e); onCreateSceneNodes(id); }} className="w-full text-sm font-semibold py-1 px-2 rounded-full shadow script-output-button-generate-scenes mb-1" onMouseDown={stopPropagation}>СЦЕНЫ (ГЕНЕРАЦИЯ)</button>
                            </div>
                        </div>
                    )}

                     {/* Scene Node Content */}
                     {node.nodeType === 'scene' && (
                        <div className="flex flex-col items-center flex-grow justify-end">
                            {/* Master Prompt Display */}
                            {node.masterPrompt && !node.isLoading && (
                                <div className="relative w-full flex-grow mt-1 mb-2 overflow-y-auto min-h-[50px]">
                                    <div
                                        className="scenario-output-common scenario-output-detail text-left text-xs p-2 bg-[#0a090f] border border-gray-700 rounded-lg break-words whitespace-pre-wrap h-full"
                                        onMouseDown={stopPropagation} >
                                        {node.masterPrompt}
                                    </div>
                                    <button
                                        onClick={(e) => { stopPropagation(e); onCopyToClipboard(node.masterPrompt || ''); }}
                                        className="copy-to-clipboard-button absolute top-1 right-1 w-5 h-5 p-0 border-none bg-black bg-opacity-50 rounded cursor-pointer flex items-center justify-center"
                                        title="Копировать текст"
                                        onMouseDown={stopPropagation} >
                                        <img src="/icon/copy.svg" alt="Copy" className="w-3 h-3" />
                                    </button>
                                </div>
                            )}

                            {/* Generate Prompt Button OR Loading Indicator */}
                            {node.hasGenerationButton && !node.masterPrompt && !node.isLoading && (
                                <button
                                    onClick={(e) => { stopPropagation(e); onGenerateScenePrompt(id); }}
                                    className="flex-shrink-0 w-[90%] rounded-2xl p-1 text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-black mb-2 mt-2.5" // Added mt-2.5
                                    onMouseDown={stopPropagation} >
                                    Сгенерировать Prompt
                                </button>
                            )}
                            {node.isLoading && ( // Loading for Prompt Generation
                                 <div className="text-center text-xs animate-pulse p-1 mb-2 mt-2.5">Генерация Prompt...</div> // Added mt-2.5
                            )}

                            {/* Pollinations Button and Indicators (remain on Scene node) */}
                            {node.masterPrompt && !node.isLoading && (
                                 <div className="flex-shrink-0 flex items-center justify-center gap-2 mt-2.5 mb-1"> {/* Added mt-2.5 */}
                                    <button
                                        onClick={(e) => { stopPropagation(e); onGeneratePollinationsImage(id); }}
                                        className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${!node.masterPrompt || node.isLoadingImage ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600 text-black'}`}
                                        title="Сгенерировать изображение (Требуется Master Prompt на английском языке)"
                                        disabled={!node.masterPrompt || node.isLoadingImage}
                                        onMouseDown={stopPropagation}
                                    >
                                        ГИ
                                    </button>
                                    {node.isLoadingImage && ( // Loading for Image Generation
                                        <div className="w-4 h-4 border-2 border-t-orange-500 border-gray-600 rounded-full animate-spin"></div>
                                    )}
                                    {node.pollinationsApiError && !node.isLoadingImage && (
                                         <div className="w-5 h-5 text-red-500 flex items-center justify-center" title={node.pollinationsApiError}>⚠️</div>
                                    )}
                                </div>
                            )}
                        </div>
                     )}
                 </div>

                 {/* --- Image Node Content --- */}
                 {node.nodeType === 'pollinations_image' && (
                    <>
                        {/* Header/Grab Handle for Image Node */}
                        <div className="h-5 bg-gray-700/50 flex-shrink-0 rounded-t-lg flex items-center px-2 cursor-grab">
                            {/* Let mousedown events pass through header to root div for dragging */}
                            <span className="text-xs text-gray-400 truncate">{node.label || 'Generated Image'}</span>
                        </div>
                        {/* Image Display Area */}
                        {node.imageUrl ? (
                            <div className="flex-grow p-1 w-full h-full overflow-hidden">
                                <img
                                    src={node.imageUrl}
                                    alt="Generated Pollination"
                                    className="w-full h-full object-contain"
                                    onMouseDown={stopPropagation} // KEEP stopPropagation here for the image itself
                                />
                            </div>
                         ) : (
                             <div className="flex-grow flex items-center justify-center text-xs text-gray-500 p-1">Image loading...</div>
                         )}
                    </>
                 )}
            </div>
        </div>
    </div>
);


};

export default NodeRenderer;