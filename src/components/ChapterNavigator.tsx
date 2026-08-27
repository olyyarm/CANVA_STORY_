import { useState } from 'react';
import { faEye } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

export interface ChapterNavigatorItem {
  id: string;
  title: string;
  chapterNumber: number | null;
  timelineId?: string;
  scenes: number;
  locations: number;
  characterAssets: number;
  frames: number;
  audio: number;
  clips: number;
  insertsReady: number;
  insertsTotal: number;
}

interface ChapterNavigatorProps {
  items: ChapterNavigatorItem[];
  collector: {
    nodeId?: string;
    videoNodeId?: string;
    chapters: number;
    readyChapterVideos: number;
    isBuilding: boolean;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFocusNode: (nodeId: string) => void;
  onEnsureCollector: () => void;
  onCreateTimeline: (chapterId: string) => void;
  onOpenChapter: (chapterId: string) => void;
}

const getMissingParts = (item: ChapterNavigatorItem) => {
  if (item.scenes === 0) return ['сцены'];

  const missing: string[] = [];
  if (item.locations < item.scenes) missing.push(`локации ${item.locations}/${item.scenes}`);
  if (item.frames < item.scenes) missing.push(`кадры ${item.frames}/${item.scenes}`);
  if (item.audio < item.scenes) missing.push(`озвучка ${item.audio}/${item.scenes}`);
  if (item.clips < item.scenes) missing.push(`клипы ${item.clips}/${item.scenes}`);
  if (item.insertsReady < item.insertsTotal) {
    missing.push(`вставки ${item.insertsReady}/${item.insertsTotal}`);
  }
  return missing;
};

const getReadySceneCount = (item: ChapterNavigatorItem) =>
  Math.min(item.scenes, item.locations, item.frames, item.audio, item.clips);

const formatStageCount = (count: number) => {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  if (remainder100 >= 11 && remainder100 <= 14) return `${count} этапов`;
  if (remainder10 === 1) return `${count} этап`;
  if (remainder10 >= 2 && remainder10 <= 4) return `${count} этапа`;
  return `${count} этапов`;
};

export default function ChapterNavigator({
  items,
  collector,
  open,
  onOpenChange,
  onFocusNode,
  onEnsureCollector,
  onCreateTimeline,
  onOpenChapter,
}: ChapterNavigatorProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const toggleExpanded = (itemId: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        className="chapter-navigator-tab"
        onClick={() => onOpenChange(true)}
        aria-label="Открыть список глав"
        title="Открыть список глав"
      >
        <span aria-hidden="true">☰</span>
        <strong>Главы</strong>
        <small>{items.length}</small>
      </button>
    );
  }

  return (
    <aside className="chapter-navigator" aria-label="Навигация по главам">
      <header className="chapter-navigator__header">
        <div>
          <strong>Главы</strong>
          <span>{items.length} в проекте</span>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Свернуть список глав"
          title="Свернуть"
        >
          ‹
        </button>
      </header>

      <div className="chapter-navigator__list">
        {items.length === 0 && (
          <p className="chapter-navigator__empty">
            Главы появятся здесь после планировщика или Split Node.
          </p>
        )}

        {items.map((item) => {
          const expanded = expandedIds.has(item.id);
          const missingParts = getMissingParts(item);
          const readyScenes = getReadySceneCount(item);
          const complete = item.scenes > 0 && missingParts.length === 0;
          const progress = item.scenes > 0 ? Math.round((readyScenes / item.scenes) * 100) : 0;

          return (
            <article
              key={item.id}
              className={`chapter-navigator__item${complete ? ' chapter-navigator__item--complete' : ''}`}
            >
              <div className="chapter-navigator__row">
                <button
                  type="button"
                  className="chapter-navigator__locate"
                  onClick={() => onFocusNode(item.id)}
                  aria-label={`Показать на канвасе: ${item.title}`}
                  title="Перейти к главе на канвасе"
                >
                  ◎
                </button>
                <button
                  type="button"
                  className="chapter-navigator__title"
                  onClick={() => onFocusNode(item.id)}
                  title={item.title}
                >
                  {item.title}
                </button>
                <button
                  type="button"
                  className="chapter-navigator__expand"
                  onClick={() => toggleExpanded(item.id)}
                  aria-expanded={expanded}
                  aria-label={expanded ? `Свернуть ${item.title}` : `Развернуть ${item.title}`}
                >
                  {expanded ? '⌄' : '›'}
                </button>
              </div>

              <div className="chapter-navigator__summary">
                <span>{item.scenes > 0 ? `${readyScenes}/${item.scenes} сцен готовы` : 'Сцен пока нет'}</span>
                <span>{complete ? 'Готово' : formatStageCount(missingParts.length)}</span>
              </div>
              <div className="chapter-navigator__progress" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </div>

              {expanded && (
                <div className="chapter-navigator__details">
                  <div className="chapter-navigator__metrics">
                    <span><strong>{item.locations}</strong> локаций</span>
                    <span><strong>{item.characterAssets}</strong> героев</span>
                    <span><strong>{item.frames}</strong> кадров</span>
                    <span><strong>{item.audio}</strong> озвучек</span>
                    <span><strong>{item.clips}</strong> клипов</span>
                    <span><strong>{item.insertsReady}/{item.insertsTotal}</strong> вставок</span>
                  </div>

                  <div className="chapter-navigator__missing">
                    <strong>{missingParts.length > 0 ? 'Недостающее' : 'Глава собрана'}</strong>
                    {missingParts.length > 0 && <p>{missingParts.join(' · ')}</p>}
                  </div>

                  <button
                    type="button"
                    className="chapter-navigator__workspace-button"
                    onClick={() => onOpenChapter(item.id)}
                  >
                    Открыть ветку генерации
                  </button>

                  {item.timelineId ? (
                    <button
                      type="button"
                      className="chapter-navigator__timeline-button"
                      onClick={() => onFocusNode(item.timelineId!)}
                    >
                      Перейти к таймлайну
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="chapter-navigator__timeline-button"
                      onClick={() => onCreateTimeline(item.id)}
                    >
                      Создать таймлайн
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <footer className={`chapter-navigator__collector${collector.videoNodeId ? ' chapter-navigator__collector--ready' : ''}`}>
        <button
          type="button"
          className="chapter-navigator__collector-title"
          onClick={() => collector.nodeId ? onFocusNode(collector.nodeId) : onEnsureCollector()}
          title={collector.nodeId ? 'Перейти к собирателю глав' : 'Создать собиратель глав'}
        >
          <strong>Собиратель глав</strong>
          <span>
            {collector.videoNodeId
              ? 'Финальный ролик готов'
              : collector.isBuilding
                ? 'Сборка идёт...'
                : collector.chapters > 0
                  ? `${collector.readyChapterVideos}/${collector.chapters} роликов глав готовы`
                  : 'Сначала создайте таймлайны глав'}
          </span>
        </button>
        <button
          type="button"
          className="chapter-navigator__collector-locate"
          onClick={() => {
            const targetNodeId = collector.videoNodeId ?? collector.nodeId;
            if (targetNodeId) onFocusNode(targetNodeId);
            else onEnsureCollector();
          }}
          aria-label={collector.videoNodeId ? 'Показать финальный ролик на канвасе' : 'Показать собиратель глав на канвасе'}
          title={collector.videoNodeId ? 'Перейти к финальному видео' : 'Перейти к собирателю глав'}
        >
          <FontAwesomeIcon icon={faEye} />
        </button>
      </footer>
    </aside>
  );
}
