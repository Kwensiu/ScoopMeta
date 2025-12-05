import { Show, Component, createEffect, createSignal } from "solid-js";
import { CircleCheckBig, XCircle } from "lucide-solid";
import { listen } from "@tauri-apps/api/event";

interface MinimizedIndicatorProps {
  title: string;
  visible: boolean;
  onClick: () => void;

  isFloatingPanelMinimized?: boolean;
}

interface MinimizedState {
  isMinimized: boolean;
  showIndicator: boolean;
  title: string;
  result?: 'success' | 'error' | 'in-progress';
}

const MinimizedIndicator: Component<MinimizedIndicatorProps> = (props) => {
  const [result, setResult] = createSignal<'success' | 'error' | 'in-progress'>('in-progress');

  // Listen for minimize events with result status
  createEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<MinimizedState>('panel-minimize-state', (event) => {
      if (event.payload.result) {
        setResult(event.payload.result);
      }
    }).then((unlistenFn) => {
      unlisten = unlistenFn;
    });
    return () => { if (unlisten) unlisten(); };
  });

  return (
    <div
      class="fixed bottom-4 left-4 z-50 bg-base-200 rounded-lg shadow-lg border border-base-300 p-3 transition-all duration-300 ease-in-out transform"
      onClick={props.onClick}

      classList={{
        "opacity-100 translate-y-20 pointer-events-none": !props.isFloatingPanelMinimized,
        "opacity-100 translate-y-0 pointer-events-auto": props.isFloatingPanelMinimized,
        "cursor-pointer": true,
      }}
    >
      <div class="flex items-center">
        <div class="font-medium text-sm truncate max-w-xs mr-2">
          {props.title}
        </div>
        <div class="flex items-center">
          <Show when={result() === 'in-progress'}>
            <span class="loading loading-spinner loading-xs mr-1"></span>
          </Show>
          <Show when={result() === 'success'}>
            <CircleCheckBig class="w-4 h-4 text-success mr-1" />
          </Show>
          <Show when={result() === 'error'}>
            <XCircle class="w-4 h-4 text-error mr-1" />
          </Show>
        </div>
      </div>
    </div>
  );
};

export default MinimizedIndicator;