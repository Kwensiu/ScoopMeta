import { createSignal, createEffect, createMemo, Show, For, Component, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { listen, UnlistenFn, emit } from "@tauri-apps/api/event";
import { useOperations } from "../stores/operations";
import { OperationOutput as StoreOperationOutput, OperationResult as StoreOperationResult, OperationModalProps } from "../types/operations";
import { X, Minimize2, ExternalLink } from "lucide-solid";
import { t } from "../i18n";
import { isErrorLineWithContext } from "../utils/errorDetection";
import { stripAnsi } from "../utils/ansiUtils";

// Define VirustotalResult locally since it's not exported from types
interface VirustotalResult {
  detections_found: number;
  is_api_key_missing: boolean;
}

// Helper component to find and render links in a line of text
const LineWithLinks: Component<{ line: string; isStderr?: boolean; previousLines?: string[] }> = (props) => {
  const cleanLine = stripAnsi(props.line);

  const urlRegex = /(https?:\/\/[^\s]+)/g;

  // Check if line should be displayed as error with context awareness
  const isError = isErrorLineWithContext(cleanLine, props.previousLines || [], props.isStderr);

  // If it's an error line, wrap it in error styling
  if (isError) {
    return (
      <span class="text-red-400 font-mono">
        {cleanLine.match(urlRegex) ? (
          <For each={cleanLine.split(urlRegex)}>
            {(part) => {
              if (part.match(urlRegex)) {
                return (
                  <a href={part} target="_blank" class="link link-error inline-flex items-center">
                    {part}
                    <ExternalLink class="w-3 h-3 ml-1" />
                  </a>
                );
              }
              return <span>{part}</span>;
            }}
          </For>
        ) : (
          <span>{cleanLine}</span>
        )}
      </span>
    );
  }

  return (
    <span>
      {cleanLine.match(urlRegex) ? (
        <For each={cleanLine.split(urlRegex)}>
          {(part) => {
            if (part.match(urlRegex)) {
              return (
                <a href={part} target="_blank" class="link link-info inline-flex items-center">
                  {part}
                  <ExternalLink class="w-3 h-3 ml-1" />
                </a>
              );
            }
            return <span>{part}</span>;
          }}
        </For>
      ) : (
        <span>{cleanLine}</span>
      )}
    </span>
  );
};

function OperationModal(props: OperationModalProps) {
  const { 
    removeOperation, 
    addOperationOutput, 
    setOperationResult,
    toggleMinimize,
    setOperationStatus,
    generateOperationId,
    operations
  } = useOperations();

  const [isClosing, setIsClosing] = createSignal(false);
  const [rendered, setRendered] = createSignal(false);

  // Generate or use provided operation ID
  const operationId = createMemo(() => {
    if (props.operationId) {
      return props.operationId;
    }
    return generateOperationId(props.title || 'operation');
  });

  // Get operation state from store
  const operation = createMemo(() => {
    return operations()[operationId()];
  });

  // This effect now correctly manages the lifecycle of the listeners
  let scrollRef: HTMLDivElement | undefined;

  // Use a separate effect for listener management that only cleans up when operation is complete
  createEffect(() => {
    const currentOp = operation();
    if (!props.title || !currentOp) return;

    console.log('Setting up persistent listeners for operation:', operationId(), 'Status:', currentOp.status);
    setRendered(true);

    let outputListener: UnlistenFn | undefined;
    let standardResultListener: UnlistenFn | undefined;
    let vtResultListener: UnlistenFn | undefined;
    let isDisposed = false;

    const setupListeners = async () => {
      try {
        // Common output listener for all operations
        outputListener = await listen<StoreOperationOutput>("operation-output", (event) => {
          if (isDisposed) return;
          console.log('Received operation-output event:', event.payload);
          // Support both operationId and operation_id for compatibility
          const eventOperationId = event.payload.operationId || event.payload.operation_id;
          // Only process output for this operation
          if (eventOperationId === operationId()) {
            // 检查操作是否仍然存在，防止竞态条件
            const currentOp = operation();
            if (!currentOp) {
              console.log('Operation no longer exists, ignoring output');
              return;
            }
            console.log('Operation output matches current operationId:', operationId());
            addOperationOutput(operationId(), {
              operationId: operationId(),
              line: event.payload.line,
              source: event.payload.source,
              message: event.payload.message
            });
          } else {
            console.log('Operation output ignored - different operationId:', {
              received: eventOperationId,
              current: operationId()
            });
          }
        });

        if (props.isScan) {
          // Listen for the special VirusTotal result event
          vtResultListener = await listen<VirustotalResult>("virustotal-scan-finished", (event) => {
            if (isDisposed) return;
            // This is a global event, but we need to check if it's for this operation
            // For now, assume it's for the current scan operation
            const result: StoreOperationResult = {
              operationId: operationId(),
              success: !event.payload.detections_found && !event.payload.is_api_key_missing,
              message: event.payload.detections_found 
                ? `Found ${event.payload.detections_found} potential threats` 
                : event.payload.is_api_key_missing
                ? "VirusTotal API key not configured"
                : "No threats detected",
              timestamp: Date.now()
            };
            
            setOperationResult(operationId(), result);
            
            if (!event.payload.detections_found && !event.payload.is_api_key_missing) {
              props.onInstallConfirm?.();
            }
          });
        } else {
          // Standard listener for install, update, etc.
          standardResultListener = await listen<StoreOperationResult>("operation-finished", (event) => {
            if (isDisposed) return;
            console.log('Received operation-finished event:', event.payload);
            // Support both operationId and operation_id for compatibility
            const eventOperationId = event.payload.operationId || event.payload.operation_id;
            console.log('Current operationId():', operationId());
            console.log('Event payload operationId:', eventOperationId);
            console.log('Comparison result:', eventOperationId === operationId());
            // Only process result for this operation
            if (eventOperationId === operationId()) {
              // 检查操作是否仍然存在，防止竞态条件
              const currentOp = operation();
              if (!currentOp) {
                console.log('Operation no longer exists, ignoring result');
                return;
              }
              console.log('Operation finished matches current operationId:', operationId());
              console.log('Setting operation status to:', event.payload.success ? 'success' : 'error');
              setOperationResult(operationId(), event.payload);
              setOperationStatus(operationId(), event.payload.success ? 'success' : 'error');
              
              if (event.payload.success && props.nextStep) {
                // Handle next step logic
                props.nextStep.onNext();
              }
            } else {
              console.log('Operation finished ignored - different operationId:', {
                received: eventOperationId,
                current: operationId()
              });
            }
          });
        }
      } catch (error) {
        console.error("Failed to setup operation listeners:", error);
        // Set error result to notify user
        const errorResult: StoreOperationResult = {
          operationId: operationId(),
          success: false,
          message: "Failed to initialize operation monitoring",
          timestamp: Date.now()
        };
        setOperationResult(operationId(), errorResult);
      }
    };

    setupListeners();

    // Only cleanup when operation is complete or component unmounts
    onCleanup(() => {
      console.log('Checking cleanup for operation:', operationId(), 'Current status:', operation()?.status);
      const op = operation();
      // Only cleanup if operation is complete (success/error) or no longer exists
      if (!op || (op.status === 'success' || op.status === 'error' || op.status === 'cancelled')) {
        console.log('Cleaning up persistent listeners for operation:', operationId());
        isDisposed = true;
        outputListener?.();
        standardResultListener?.();
        vtResultListener?.();
      } else {
        console.log('Not cleaning up listeners - operation still in progress:', operationId());
      }
    });
  });

  createEffect(() => {
    if (isClosing()) {
      const timer = setTimeout(() => {
        setRendered(false);
        setIsClosing(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  });

  const handleCloseOrCancelPanel = (wasSuccessful: boolean) => {
    setIsClosing(true);
    setOperationStatus(operationId(), wasSuccessful ? 'success' : 'cancelled');
    setTimeout(() => {
      removeOperation(operationId());
      props.onClose(operationId(), wasSuccessful);
    }, 300);
  };

  const handleForceClose = () => {
    const currentOperation = operation();
    if (currentOperation && currentOperation.status === 'in-progress') {
      emit('cancel-operation');
    }
    // Immediately remove the operation when X is clicked
    removeOperation(operationId());
    props.onClose(operationId(), false);
  };

  const handleCancelOperation = () => {
    const currentOperation = operation();
    if (currentOperation && currentOperation.status === 'in-progress') {
      emit('cancel-operation');
      setOperationStatus(operationId(), 'cancelled');
    }
  };

  const handleMainButtonClick = () => {
    const currentOperation = operation();
    if (currentOperation?.status === 'in-progress') {
      handleCancelOperation();
    } else {
      handleCloseOrCancelPanel(currentOperation?.status === 'success');
    }
  };

  const getCloseButtonText = () => {
    const currentOperation = operation();
    if (currentOperation?.status === 'in-progress') {
      return t('buttons.cancel');
    }
    return t('buttons.close');
  };

  const handleMinimize = () => {
    console.log('handleMinimize called for operation:', operationId());
    const currentOperation = operation();
    if (currentOperation && !currentOperation.isMinimized) {
      console.log('Minimizing operation:', currentOperation.title);
      // 发送最小化状态事件给后端
      emit('panel-minimize-state', {
        isMinimized: true,
        showIndicator: true,
        title: currentOperation.title,
        result: currentOperation.status === 'success' ? 'success' : 
               currentOperation.status === 'error' ? 'error' : 'in-progress'
      });
      
      toggleMinimize(operationId());
    } else if (currentOperation) {
      console.log('Restoring operation:', currentOperation.title);
      // 发送恢复状态事件给后端
      emit('panel-minimize-state', {
        isMinimized: false,
        showIndicator: false,
        title: currentOperation.title,
        result: currentOperation.status === 'success' ? 'success' : 
               currentOperation.status === 'error' ? 'error' : 'in-progress'
      });
      
      toggleMinimize(operationId());
    }
  };

  // Scroll to bottom when new output is added, but only if user is near bottom
  createEffect(() => {
    const currentOperation = operation();
    if (scrollRef && currentOperation?.output && currentOperation.output.length > 0 && !currentOperation.isMinimized) {
      // Use requestAnimationFrame to ensure DOM is updated before scrolling
      requestAnimationFrame(() => {
        const container = scrollRef!;
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;

        // Check if user is near bottom (within 50px of bottom) or if content is short enough to fit entirely
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        const isNearBottom = distanceFromBottom <= 50;
        const contentFits = scrollHeight <= clientHeight;

        if (isNearBottom || contentFits) {
          container.scrollTop = scrollHeight;
        }
      });
    }
  });

  const currentOperation = operation();

  return (
    <Portal>
      <Show when={rendered() && currentOperation}>
        <Show when={!currentOperation.isMinimized}>
          <div class="fixed inset-0 flex items-center justify-center z-60 p-4 sm:p-6 md:p-8">
            <div
              class="absolute inset-0 transition-all duration-300 ease-out"
              classList={{
                "opacity-0": isClosing(),
                "opacity-80": !isClosing(),
              }}
              style="background-color: rgba(0, 0, 0, 0.3); backdrop-filter: blur(2px);"
              onClick={handleMinimize}
            ></div>
            <div
              class="relative bg-base-200 rounded-xl shadow-2xl border border-base-300 max-h-[90vh] overflow-hidden flex flex-col transition-all duration-300 ease-out"
              style="width: min(calc(100vw - 2 * var(--modal-padding, 1rem)), 64rem);"
              classList={{
                "scale-90 opacity-0 translate-y-0": isClosing(),
                "scale-100 opacity-100 translate-y-0": !isClosing(),
              }}
            >
            <div class="flex justify-between items-center p-4 border-b border-base-300">
              <h3 class="font-bold text-lg truncate">{currentOperation?.title}</h3>
              <div class="flex space-x-2">
                <button
                  class="btn btn-sm btn-circle btn-ghost hover:bg-base-300 transition-colors duration-200"
                  onClick={handleMinimize}
                >
                  <Minimize2 class="w-6 h-6 sm:w-5 sm:h-5" />
                </button>
                <button
                  class="btn btn-sm btn-circle btn-ghost hover:bg-base-300 transition-colors duration-200"
                  onClick={handleForceClose}
                >
                  <X class="w-6 h-6 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            <div
              ref={scrollRef}
              class="bg-black text-white font-mono text-xs p-4 rounded-lg mx-4 my-3 overflow-y-auto grow"
              style="white-space: pre-wrap; word-break: break-word;"
            >
              <For each={currentOperation?.output || []}>
                {(line, index) => (
                  <div class="mb-1">
                    <LineWithLinks
                      line={line.line}
                      isStderr={line.source === "stderr"}
                      previousLines={currentOperation?.output?.slice(0, index()).map(item => item.line)}
                    />
                  </div>
                )}
              </For>
              <Show when={currentOperation?.status === 'in-progress'}>
                <div class="flex items-center animate-pulse mt-2">
                  <span class="loading loading-spinner loading-xs mr-2"></span>
                  {t('status.inProgress')}
                </div>
              </Show>
            </div>

            <Show when={currentOperation?.status === 'error'}>
              <div class="alert alert-error mx-4 my-2 rounded-lg">
                <span>{currentOperation.result?.message || "Operation failed"}</span>
              </div>
            </Show>

            <Show when={currentOperation?.status === 'success'}>
              <div class="alert alert-success mx-4 my-2 rounded-lg">
                <span>{currentOperation.result?.message || "Operation completed successfully"}</span>
              </div>
            </Show>

            <div class="flex justify-end p-4 gap-2 border-t border-base-300">
              <Show when={props.nextStep && currentOperation?.status === 'success'}>
                <button class="btn btn-primary btn-sm" onClick={() => props.nextStep?.onNext()}>
                  {props.nextStep?.buttonLabel}
                </button>
              </Show>
              <button
                classList={{
                  "btn btn-sm": true,
                  "btn-error": currentOperation?.status === 'in-progress',
                  "btn-primary": currentOperation?.status === 'success',
                  "btn-warning": currentOperation?.status === 'error'
                }}
                onClick={handleMainButtonClick}
              >
                {getCloseButtonText()}
              </button>
            </div>
          </div>
        </div>
        </Show>
      </Show>
    </Portal>
  );
}

export default OperationModal;
