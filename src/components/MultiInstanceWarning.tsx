import { createSignal, Show, onMount, onCleanup } from "solid-js";
import { TriangleAlert, X } from "lucide-solid";
import { useOperations } from "../stores/operations";
import { t } from "../i18n";

// 多实例警告组件
const MultiInstanceWarning = () => {
  const { dismissMultiInstanceWarning, checkMultiInstanceWarning } = useOperations();

  const [isVisible, setIsVisible] = createSignal(false);

  // 检查是否应该显示警告
  const shouldShowWarning = () => {
    return checkMultiInstanceWarning() && !isVisible();
  };

  // 关闭警告
  const handleClose = () => {
    setIsVisible(false);
    dismissMultiInstanceWarning();
  };

  // 键盘事件处理
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  // 正确的事件监听器管理
  onMount(() => {
    document.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <Show when={shouldShowWarning()}>
      <div class="fixed bottom-4 right-4 z-50 max-w-sm">
        <div class="alert alert-warning shadow-lg border-warning bg-warning text-warning-content">
          <div class="flex items-start gap-3">
            <TriangleAlert class="w-5 h-5 shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0">
              <div class="font-bold mb-1">
                {t('warnings.multiInstance.title')}
              </div>
              <div class="text-sm mb-3">
                {t('warnings.multiInstance.message')}
              </div>
              <div class="flex gap-2">
                <button
                  class="btn btn-sm btn-outline"
                  onClick={handleClose}
                >
                  {t('warnings.multiInstance.dontShowAgain')}
                </button>
                <button
                  class="btn btn-sm btn-ghost"
                  onClick={() => setIsVisible(false)}
                >
                  {t('buttons.closeDialog')}
                </button>
              </div>
            </div>
            <button
              class="btn btn-sm btn-circle btn-ghost ml-2"
              onClick={handleClose}
              aria-label={t('buttons.close')}
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default MultiInstanceWarning;
