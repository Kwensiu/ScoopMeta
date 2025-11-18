import { createSignal, createEffect, onCleanup, For, Show, Component } from "solid-js";
import { listen, emit } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { VirustotalResult } from "../types/scoop";
import { ShieldAlert, AlertTriangle, ExternalLink, X } from "lucide-solid";

// Custom hook for tracking window size
const useWindowSize = () => {
  const [windowSize, setWindowSize] = createSignal({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  createEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);
    onCleanup(() => window.removeEventListener("resize", handleResize));
  });

  return windowSize;
};

interface OperationOutput {
  line: string;
  source: string; // "stdout" or "stderr"
  message: string;
}

interface OperationResult {
  success: boolean;
  message: string;
}

// Helper component to find and render links in a line of text
const LineWithLinks: Component<{ line: string }> = (props) => {
  // This regex is designed to strip ANSI color codes from the string.
  const ansiRegex = /[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  const cleanLine = props.line.replace(ansiRegex, '');
  
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = cleanLine.split(urlRegex);

  return (
    <span>
      <For each={parts}>
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
    </span>
  );
};

interface FloatingOperationPanelProps {
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

function FloatingOperationPanel(props: FloatingOperationPanelProps) {
  const [output, setOutput] = createSignal<OperationOutput[]>([]);
  const [result, setResult] = createSignal<OperationResult | null>(null);
  const [showNextStep, setShowNextStep] = createSignal(false);
  const [scanWarning, setScanWarning] = createSignal<VirustotalResult | null>(null);
  const windowSize = useWindowSize();
  let scrollRef: HTMLDivElement | undefined;
  
  // Effect to handle window resize
  createEffect(() => {
    // Accessing windowSize() triggers the effect when window is resized
    windowSize();
    
    // Keep scroll at the bottom
    if (scrollRef) {
      scrollRef.scrollTop = scrollRef.scrollHeight;
    }
  });
  
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
            // If scan is clean, proceed immediately
            props.onInstallConfirm?.();
          }
        });
      } else {
        // Standard listener for install, update, etc.
        standardResultListener = await listen<OperationResult>("operation-finished", (event) => {
          setResult(event.payload);
          if (event.payload.success && props.nextStep) {
            setShowNextStep(true);
          }
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
      setupListeners();
    }

    // This cleanup runs whenever the effect re-runs or the component is unmounted.
    onCleanup(() => {
      outputListener?.();
      standardResultListener?.();
      vtResultListener?.();
    });
  });

  // Effect to auto-scroll the output view
  createEffect(() => {
    if (scrollRef) {
      scrollRef.scrollTop = scrollRef.scrollHeight;
    }
  });

  const handleCloseOrCancel = () => {
    // If we are in the warning phase, this is a explicit cancel
    if (scanWarning()) {
      props.onClose(false);
      return;
    }
    
    if (result()) {
      props.onClose(result()?.success ?? false);
    } else {
      // If the operation is ongoing, emit an event to cancel it
      emit('cancel-operation');
    }
  };

  const handleInstallAnyway = () => {
    props.onInstallConfirm?.();
  };

  const handleNextStepClick = () => {
    if (props.nextStep) {
        props.nextStep.onNext();
        // The title prop will change, triggering the effect above to reset everything.
    }
  };

  return (
    <Show when={!!props.title}>
      <div class="fixed inset-0 flex items-center justify-center z-50 p-2">
        <div 
          class="absolute inset-0 transition-all duration-300 ease-in-out"
          style="background-color: rgba(0, 0, 0, 0.3);"
          onClick={handleCloseOrCancel}
        ></div>
        <div class="relative bg-base-200 rounded-lg shadow-xl border border-base-300 w-full max-w-md sm:max-w-lg md:max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
          <div class="flex justify-between items-center p-3 border-b border-base-300">
            <h3 class="font-bold text-lg truncate">{props.title}</h3>
            <button 
              class="btn btn-sm btn-circle btn-ghost"
              onClick={handleCloseOrCancel}
            >
              <X class="w-4 h-4" />
            </button>
          </div>
          
          <div 
            ref={scrollRef}
            class="bg-black text-white font-mono text-xs p-3 rounded-lg m-3 overflow-y-auto flex-grow"
          >
            <For each={output()}>
              {(line) => (
                <p classList={{ 'text-red-400': line.source === 'stderr' }}>
                  <LineWithLinks line={line.line} />
                </p>
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
              <div class="alert alert-warning mx-3">
                  <ShieldAlert class="w-6 h-6" />
                  <span>{scanWarning()!.message}</span>
              </div>
          </Show>

          <Show when={result()}>
              <div class="alert mx-3" classList={{ 'alert-success': result()?.success, 'alert-error': !result()?.success }}>
                  <span>{result()!.message}</span>
              </div>
          </Show>

          <div class="flex justify-end p-3 gap-2">
              <Show when={scanWarning()}>
                  <button class="btn btn-warning btn-sm" onClick={handleInstallAnyway}>
                      <AlertTriangle class="w-4 h-4 mr-2" />
                      Install Anyway
                  </button>
              </Show>
              <Show when={showNextStep()}>
                  <button class="btn btn-info btn-sm" onClick={handleNextStepClick}>
                      {props.nextStep?.buttonLabel}
                  </button>
              </Show>
              <button class="btn btn-sm" onClick={handleCloseOrCancel}>
                  { result() || scanWarning() ? 'Close' : 'Cancel' }
              </button>
          </div>
        </div>
      </div>
    </Show>
  );
}

export default FloatingOperationPanel;