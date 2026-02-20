import { createSignal, For, Show, onMount, onCleanup } from "solid-js";
import { CircleCheckBig, XCircle, Loader2 } from "lucide-solid";
import { useOperations } from "../stores/operations";
import type { MinimizedIndicatorProps } from "../types/operations";
import { t } from "../i18n";

// 最小化指示器组件
const MinimizedIndicator = (props: MinimizedIndicatorProps) => {
  const getStatusIcon = () => {
    switch (props.status) {
      case 'in-progress':
        return <Loader2 class="w-4 h-4 text-blue-500 animate-spin" />;
      case 'success':
        return <CircleCheckBig class="w-4 h-4 text-success" />;
      case 'error':
        return <XCircle class="w-4 h-4 text-error" />;
      case 'cancelled':
        return <XCircle class="w-4 h-4 text-warning" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    switch (props.status) {
      case 'in-progress':
        return t('status.inProgress');
      case 'success':
        return t('status.completed');
      case 'error':
        return t('status.failed');
      case 'cancelled':
        return t('status.cancelled');
      default:
        return '';
    }
  };

  return (
    <div
      class="minimized-indicator"
      classList={{
        'minimized-indicator--minimized': props.isMinimized,
        'minimized-indicator--active': !props.isMinimized
      }}
      onClick={props.onClick}
      role="button"
      tabindex="0"
      aria-label={`${props.title} - ${getStatusText()}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onClick();
        }
      }}
    >
      <div class="minimized-indicator__content">
        <div class="minimized-indicator__title" title={props.title}>
          {props.title}
        </div>
        <div class="minimized-indicator__status">
          {getStatusIcon()}
        </div>
      </div>
    </div>
  );
};

// 最小化指示器管理器
const MinimizedIndicatorManager = () => {
  const { 
    getActiveOperations, 
    removeOperation, 
    toggleMinimize 
  } = useOperations();

  const [showMore, setShowMore] = createSignal(false);

  // 获取最小化的操作列表
  const getMinimizedOperations = () => {
    return getActiveOperations()
      .filter(op => op.isMinimized)
      .sort((a, b) => b.updatedAt - a.updatedAt); // 按更新时间倒序
  };

  // 获取可见的操作列表
  const getVisibleOperations = () => {
    const minimized = getMinimizedOperations();
    const count = 5; // 固定显示5个
    return showMore() ? minimized : minimized.slice(0, count);
  };

  // 处理指示器点击
  const handleIndicatorClick = (operationId: string) => {
    toggleMinimize(operationId);
  };

  // 处理指示器关闭
  const handleIndicatorClose = (operationId: string) => {
    removeOperation(operationId);
  };

  // 计算是否有更多操作
  const hasMoreOperations = () => {
    const minimized = getMinimizedOperations();
    return minimized.length > 5;
  };

  // 键盘导航
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowMore(false);
    }
  };

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <Show when={getMinimizedOperations().length > 0}>
      <div class="minimized-indicators-container">
        <For each={getVisibleOperations()}>
          {(operation, index) => (
            <MinimizedIndicator
              operationId={operation.id}
              title={operation.title}
              status={operation.status}
              isMinimized={operation.isMinimized}
              visible={true}
              onClick={() => handleIndicatorClick(operation.id)}
              onClose={() => handleIndicatorClose(operation.id)}
              index={index()}
            />
          )}
        </For>

        {/* 显示更多按钮 */}
        <Show when={hasMoreOperations() && !showMore()}>
          <button
            class="minimized-indicator minimized-indicator--more"
            onClick={() => setShowMore(true)}
            aria-label={t('buttons.showMore')}
          >
            <div class="minimized-indicator__content">
              <div class="minimized-indicator__title">
                +{getMinimizedOperations().length - 5}
              </div>
            </div>
          </button>
        </Show>

        {/* 收起按钮 */}
        <Show when={showMore() && hasMoreOperations()}>
          <button
            class="minimized-indicator minimized-indicator--collapse"
            onClick={() => setShowMore(false)}
            aria-label={t('buttons.showLess')}
          >
            <div class="minimized-indicator__content">
              <div class="minimized-indicator__title">
                {t('buttons.collapse')}
              </div>
            </div>
          </button>
        </Show>
      </div>
    </Show>
  );
};

export default MinimizedIndicatorManager;
