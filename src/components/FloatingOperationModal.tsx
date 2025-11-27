import { createSignal, createEffect, onCleanup, For, Show, Component } from "solid-js";
import { Portal } from "solid-js/web";
import { listen, emit } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { VirustotalResult } from "../types/scoop";
import { X, ShieldAlert, TriangleAlert, ExternalLink, Minimize2 } from "lucide-solid";
import { isErrorLine } from "../utils/errorDetection";
import { stripAnsi } from "../utils/ansiUtils";
import MinimizedIndicator from "./MinimizedIndicator";

interface OperationOutput {
  line: string;
  source: string; // "stdout" or "stderr"
  message: string;
}

interface OperationResult {
  success: boolean;
  message: string;
}

// Add type for minimized state with result
interface MinimizedState {
  isMinimized: boolean;
  showIndicator: boolean;
  title: string;
  result?: 'success' | 'error' | 'in-progress';
}

// Helper component to find and render links in a line of text
const LineWithLinks: Component<{ line: string; isStderr?: boolean }> = (props) => {
  const cleanLine = stripAnsi(props.line);

  const urlRegex = /(https?:\/\/[^\s]+)/g;

  // Check if line should be displayed as error
  const isError = isErrorLine(cleanLine, props.isStderr);

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

interface FloatingOperationModalProps {
  // Title for the panel, e.g., "Installing vscode" or "Updating all packages"
  title: string | null;
  onClose: (wasSuccess: boolean) => void;
  nextStep?: {
    buttonLabel: string;
    onNext: () => void;
  };
  // Props for the new VirusTotal scan flow
  isScan?: boolean;
  onInstallConfirm?: () => void;
}

function FloatingOperationModal(props: FloatingOperationModalProps) {
  const [output, setOutput] = createSignal<OperationOutput[]>([]);
  const [result, setResult] = createSignal<OperationResult | null>(null);
  const [showNextStep, setShowNextStep] = createSignal(false);
  const [scanWarning, setScanWarning] = createSignal<VirustotalResult | null>(null);
  const [isClosing, setIsClosing] = createSignal(false);
  const [rendered, setRendered] = createSignal(false);

  // MinimizedIndicator
  const [isMinimized, setIsMinimized] = createSignal(false);
  const [isMinimizing, setIsMinimizing] = createSignal(false); // For animation purposes

  // This effect now correctly manages the lifecycle of the listeners
  let scrollRef: HTMLDivElement | undefined;

  // This effect now correctly manages the lifecycle of the listeners
  createEffect(() => {
    let outputListener: UnlistenFn | undefined;
    let standardResultListener: UnlistenFn | undefined;
    let vtResultListener: UnlistenFn | undefined;

    const setupListeners = async () => {
      // Common output listener for all operations
      outputListener = await listen<OperationOutput>("operation-output", (event) => {
        setOutput(prev => [...prev, event.payload]);
      });

      if (props.isScan) {
        // Listen for the special VirusTotal result event
        vtResultListener = await listen<VirustotalResult>("virustotal-scan-finished", (event) => {
          if (event.payload.detections_found || event.payload.is_api_key_missing) {
            setScanWarning(event.payload);
          } else {
            props.onInstallConfirm?.();
          }

          // Update minimized indicator with error state when scan finishes with warnings
          if (event.payload.detections_found || event.payload.is_api_key_missing) {
            emit('panel-minimize-state', {
              isMinimized: true,
              showIndicator: true,
              title: props.title,
              result: 'error'
            } as MinimizedState);
          }
        });
      } else {
        // Standard listener for install, update, etc.
        standardResultListener = await listen<OperationResult>("operation-finished", (event) => {
          setResult(event.payload);
          if (event.payload.success && props.nextStep) {
            setShowNextStep(true);
          }

          // Update minimized indicator with result state
          emit('panel-minimize-state', {
            isMinimized: false,
            showIndicator: false,
            title: props.title,
            result: event.payload.success ? 'success' : 'error'
          } as MinimizedState);
        });
      }
    };

    // Only set up listeners when the panel is active (has a title)
    if (props.title) {
      // Reset state for the new operation
      setOutput([]);
      setResult(null);
      setShowNextStep(false);
      setScanWarning(null);

      setRendered(true);
      setIsMinimizing(true);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsMinimizing(false);
        });
      });

      setupListeners();

      setIsMinimized(false); // Reset minimized state when new operation starts

      // Emit initial minimized state with in-progress status
      emit('panel-minimize-state', {
        isMinimized: false,
        showIndicator: false,
        title: props.title,
        result: 'in-progress'
      } as MinimizedState);
    }

    // This cleanup runs whenever the effect re-runs or the component is unmounted.
    onCleanup(() => {
      outputListener?.();
      standardResultListener?.();
      vtResultListener?.();
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

    emit('panel-minimize-state', {
      isMinimized: false,
      showIndicator: false,
      title: props.title,
      result: wasSuccessful ? 'success' : 'error'
    } as MinimizedState);

    setTimeout(() => props.onClose(wasSuccessful), 300);
  };

  const handleForceClose = () => {
    if (!result() && !scanWarning()) {
      emit('cancel-operation');
    }
    handleCloseOrCancelPanel(false);
  };

  const handleCancelOperation = () => {
    if (!result() && !scanWarning()) {
      emit('cancel-operation');
    }
  };

  const handleMainButtonClick = () => {
    if (result() || scanWarning()) {
      handleCloseOrCancelPanel(result()?.success ?? false);
    } else {
      handleCancelOperation();
    }
  };

  const getCloseButtonText = () => {
    if (scanWarning()) {
      return "Cancel";
    }

    if (result()) {
      return "Close";
    }

    return "Cancel";
  };

  const handleMinimize = () => {
    if (!isMinimized()) {
      setIsMinimizing(true);

      emit('panel-minimize-state', {
        isMinimized: true,
        showIndicator: true,
        title: props.title,
        result: result()?.success ? 'success' : (result() ? 'error' : 'in-progress')
      } as MinimizedState);

      setTimeout(() => {
        setIsMinimized(true);
        setIsMinimizing(false);
      }, 300);

    } else {

      emit('panel-minimize-state', {
        isMinimized: false,
        showIndicator: false,
        title: props.title,
        result: result()?.success ? 'success' : (result() ? 'error' : 'in-progress')
      } as MinimizedState);

      setIsMinimizing(true);
      setIsMinimized(false);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsMinimizing(false);
        });
      });
    }
  };

  // Listen for restore event from the global indicator
  createEffect(() => {
    let unlisten: (() => void) | undefined;
    listen('restore-panel', () => {
      handleMinimize();
    }).then((unlistenFn) => {
      unlisten = unlistenFn;
    });

    onCleanup(() => {
      if (unlisten) unlisten();
    });
  });

  const handleInstallAnyway = () => {
    props.onInstallConfirm?.();
  };

  const handleNextStepClick = () => {
    if (props.nextStep) {
      props.nextStep.onNext();
      // The title prop will change, triggering the effect above to reset everything.
    }
  };

  // Scroll to bottom when new output is added
  createEffect(() => {
    if (scrollRef && output().length > 0 && !isMinimized()) {
      // Use requestAnimationFrame to ensure DOM is updated before scrolling
      requestAnimationFrame(() => {
        scrollRef!.scrollTop = scrollRef!.scrollHeight;
      });
    }
  });

  return (
    <Portal>
      <Show when={rendered() && !isMinimized()}>
        <div class="fixed inset-0 flex items-center justify-center z-50 p-2">
          <Show when={!isMinimized()}>
            <div
              class="absolute inset-0 transition-all duration-300 ease-out"
              classList={{
                "opacity-0": isClosing() || isMinimizing(),
                "opacity-80": !isClosing() && !isMinimizing(),
              }}
              style="background-color: rgba(0, 0, 0, 0.3); backdrop-filter: blur(2px);"
              onClick={handleMinimize}
            ></div>
          </Show>
          <Show when={!isMinimized()}>
            <div
              class="relative bg-base-200 rounded-xl shadow-2xl border border-base-300 w-full max-w-lg sm:max-w-lg md:max-w-6xl max-h-[90vh] overflow-hidden flex flex-col transition-all duration-300 ease-out"
              classList={{
                "scale-90 opacity-0 translate-y-0": isClosing() || isMinimizing(),
                "scale-100 opacity-100 translate-y-0": !isClosing() && !isMinimizing(),
              }}
            >
              <div class="flex justify-between items-center p-4 border-b border-base-300">
                <h3 class="font-bold text-lg truncate">{props.title}</h3>
                <div class="flex space-x-2">
                  <button
                    class="btn btn-sm btn-circle btn-ghost hover:bg-base-300 transition-colors duration-200"
                    onClick={handleMinimize}
                  >
                    <Minimize2 class="w-5 h-5" />
                  </button>
                  <button
                    class="btn btn-sm btn-circle btn-ghost hover:bg-base-300 transition-colors duration-200"
                    onClick={handleForceClose}
                  >
                    <X class="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div
                ref={scrollRef}
                class="bg-black text-white font-mono text-xs p-4 rounded-lg mx-4 my-3 overflow-y-auto flex-grow"
                style="white-space: pre-wrap; word-break: break-word;"
              >
                <For each={output()}>
                  {(line) => (
                    <div class="mb-1">
                      <LineWithLinks
                        line={line.line}
                        isStderr={line.source === 'stderr'}
                      />
                    </div>
                  )}
                </For>
                <Show when={!result() && !scanWarning()}>
                  <div class="flex items-center animate-pulse mt-2">
                    <span class="loading loading-spinner loading-xs mr-2"></span>
                    In progress...
                  </div>
                </Show>
              </div>

              <Show when={scanWarning()}>
                <div class="alert alert-warning mx-4 my-2 rounded-lg">
                  <ShieldAlert class="w-6 h-6" />
                  <div>
                    <div class="font-bold">VirusTotal Scan Warning</div>
                    <div>{scanWarning()!.message}</div>
                  </div>
                </div>
              </Show>

              <Show when={result()}>
                <div class="alert mx-4 my-2 rounded-lg" classList={{ 'alert-success': result()?.success, 'alert-error': !result()?.success }}>
                  <span>{result()!.message}</span>
                </div>
              </Show>

              <div class="flex justify-end p-4 gap-2 border-t border-base-300">
                <Show when={scanWarning()}>
                  <button class="btn btn-warning btn-sm" onClick={handleInstallAnyway}>
                    <TriangleAlert class="w-4 h-4 mr-2" />
                    Install Anyway
                  </button>
                </Show>
                <Show when={showNextStep()}>
                  <button class="btn btn-primary btn-sm" onClick={handleNextStepClick}>
                    {props.nextStep?.buttonLabel}
                  </button>
                </Show>
                <button
                  classList={{
                    "btn btn-sm": true,
                    "btn-error": (!result() && !scanWarning()) || (!!result() && !result()!.success && !scanWarning()),
                    "btn-primary": !!result() && result()!.success && !scanWarning(),
                    "btn-warning": !!scanWarning()
                  }}
                  onClick={handleMainButtonClick}
                >
                  {getCloseButtonText()}
                </button>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      {/* Use unified MinimizedIndicator component */}
      <MinimizedIndicator
        title={props.title || ""}
        isFloatingPanelMinimized={isMinimized()}
        visible={true}
        onClick={() => {
          handleMinimize();
        }}
      />
    </Portal>
  );
}

export default FloatingOperationModal;