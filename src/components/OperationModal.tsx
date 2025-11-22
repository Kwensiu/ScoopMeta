import { createSignal, createEffect, onCleanup, For, Show, Component } from "solid-js";
import { listen, emit } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { VirustotalResult } from "../types/scoop";
import { ShieldAlert, TriangleAlert, ExternalLink } from "lucide-solid";
import { isErrorLine } from "../utils/errorDetection";

// Shared types for backend operations
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
const LineWithLinks: Component<{ line: string; isError?: boolean }> = (props) => {
  // This regex is designed to strip ANSI color codes from the string.
  const ansiRegex = /[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-Za-z\[\]\\`_=@:;,.?!#$%&*+\-^_|~<>]/g;
  const cleanLine = props.line.replace(ansiRegex, '');

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  
  // Check if line should be displayed as error
  const isError = props.isError || isErrorLine(cleanLine, false);
  const linkClass = isError ? "link link-error" : "link link-info";
  const textColorClass = isError ? "text-red-400" : "";
  
  const renderContent = () => {
    if (cleanLine.match(urlRegex)) {
      return (
        <For each={cleanLine.split(urlRegex)}>
          {(part) => {
            if (part.match(urlRegex)) {
              return (
                <a href={part} target="_blank" class={`${linkClass} inline-flex items-center`}>
                  {part}
                  <ExternalLink class="w-3 h-3 ml-1" />
                </a>
              );
            }
            return <span>{part}</span>;
          }}
        </For>
      );
    }
    return <span>{cleanLine}</span>;
  };

  return (
    <span class={`font-mono ${textColorClass}`}>
      {renderContent()}
    </span>
  );
};

interface OperationModalProps {
  // Title for the modal, e.g., "Installing vscode" or "Updating all packages"
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

function OperationModal(props: OperationModalProps) {
  const [output, setOutput] = createSignal<OperationOutput[]>([]);
  const [result, setResult] = createSignal<OperationResult | null>(null);
  const [showNextStep, setShowNextStep] = createSignal(false);
  const [scanWarning, setScanWarning] = createSignal<VirustotalResult | null>(null);
  let scrollRef: HTMLDivElement | undefined;

  // This effect now correctly manages the lifecycle of the listeners
  createEffect(() => {
    const listeners: UnlistenFn[] = [];

    const setupListeners = async () => {
      try {
        // Common output listener for all operations
        const outputListener = await listen<OperationOutput>("operation-output", (event) => {
          setOutput(prev => [...prev, event.payload]);
        });
        listeners.push(outputListener);

        if (props.isScan) {
          // Listen for the special VirusTotal result event
          const vtResultListener = await listen<VirustotalResult>("virustotal-scan-finished", (event) => {
            if (event.payload.detections_found || event.payload.is_api_key_missing) {
              setScanWarning(event.payload);
            } else {
              // If scan is clean, proceed immediately
              props.onInstallConfirm?.();
            }
          });
          listeners.push(vtResultListener);
        } else {
          // Standard listener for install, update, etc.
          const standardResultListener = await listen<OperationResult>("operation-finished", (event) => {
            setResult(event.payload);
            if (event.payload.success && props.nextStep) {
              setShowNextStep(true);
            }
          });
          listeners.push(standardResultListener);
        }
      } catch (error) {
        console.error("Failed to set up event listeners:", error);
      }
    };

    // Only set up listeners when the modal is active (has a title)
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
      listeners.forEach(unlisten => {
        try {
          unlisten();
        } catch (error) {
          console.error("Failed to remove listener:", error);
        }
      });
    });
  });

  // Effect to auto-scroll the output view
  createEffect(() => {
    const outputLength = output().length;
    if (scrollRef) {
      // Only scroll if we're near the bottom
      const isNearBottom = scrollRef.scrollHeight - scrollRef.scrollTop <= scrollRef.clientHeight + 100;
      if (isNearBottom) {
        scrollRef.scrollTop = scrollRef.scrollHeight;
      }
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

  // Determine if the operation is still running
  const isOperationRunning = () => {
    return !result() && !scanWarning() && props.title;
  };

  return (
    <Show when={!!props.title}>
      <div class="modal modal-open backdrop-blur-sm" role="dialog">
        <div class="modal-box w-11/12 max-w-5xl mx-auto">
          <h3 class="font-bold text-lg">{props.title}</h3>
          <div 
            ref={el => (scrollRef = el)}
            class="bg-black text-white font-mono text-sm p-4 rounded-lg my-4 max-h-96 overflow-y-auto whitespace-pre-wrap break-words"
          >
            <For each={output()}>
              {(line) => (
                <div>
                  <LineWithLinks line={line.line} isError={line.source === 'stderr'} />
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
            <div class="alert alert-warning">
              <ShieldAlert class="w-6 h-6" />
              <span>{scanWarning()?.message}</span>
            </div>
          </Show>

          <Show when={result()}>
            <div class="alert" classList={{ 'alert-success': result()?.success, 'alert-error': !result()?.success }}>
              <span>{result()?.message}</span>
            </div>
          </Show>

          <div class="modal-action">
            <Show when={scanWarning()}>
              <button class="btn btn-warning" onClick={handleInstallAnyway}>
                <TriangleAlert class="w-4 h-4 mr-2" />
                Install Anyway
              </button>
            </Show>
            <Show when={showNextStep()}>
              <button class="btn btn-info" onClick={handleNextStepClick}>
                {props.nextStep?.buttonLabel}
              </button>
            </Show>
            <button class="btn" onClick={handleCloseOrCancel}>
              {result() || scanWarning() ? 'Close' : 'Cancel'}
            </button>
          </div>
        </div>
        <div class="modal-backdrop" onClick={() => props.onClose(result()?.success ?? false)}></div>
      </div>
    </Show>
  );
}

export default OperationModal; 