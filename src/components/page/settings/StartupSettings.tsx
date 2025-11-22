import { createSignal, onMount, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Power } from "lucide-solid";

export default function StartupSettings() {
    const [isAutoStartEnabled, setIsAutoStartEnabled] = createSignal(false);
    const [isLoading, setIsLoading] = createSignal(true);
    const [isToggling, setIsToggling] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [successMessage, setSuccessMessage] = createSignal<string | null>(null);

    let isComponentMounted = true;

    onMount(() => {
        fetchAutoStartStatus();
        return () => {
            isComponentMounted = false;
        };
    });

    onCleanup(() => {
        isComponentMounted = false;
    });

    const fetchAutoStartStatus = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const status = await invoke<boolean>("is_auto_start_enabled");
            if (isComponentMounted) {
                setIsAutoStartEnabled(status);
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to fetch auto-start status:", errorMsg);
            if (isComponentMounted) {
                setError("Could not load auto-start setting: " + errorMsg);
            }
        } finally {
            if (isComponentMounted) {
                setIsLoading(false);
            }
        }
    };

    const toggleAutoStart = async () => {
        setIsToggling(true);
        setError(null);
        setSuccessMessage(null);
        const previousState = isAutoStartEnabled();
        
        try {
            const newState = !previousState;
            await invoke("set_auto_start_enabled", { enabled: newState });
            if (isComponentMounted) {
                setIsAutoStartEnabled(newState);
                setSuccessMessage(
                    newState 
                        ? "Set Startup successfully!" 
                        : "Removed Startup successfully!"
                );
                setTimeout(() => {
                    if (isComponentMounted) {
                        setSuccessMessage(null);
                    }
                }, 3000);
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to toggle auto-start:", errorMsg);
            if (isComponentMounted) {
                setError("Failed to update auto-start setting: " + errorMsg);
                // Restore to previous state to prevent UI inconsistency with actual state
                setIsAutoStartEnabled(previousState);
            }
        } finally {
            if (isComponentMounted) {
                setIsToggling(false);
            }
        }
    };

    return (
        <div class="card bg-base-200 shadow-xl">
            <div class="card-body">
                <div class="flex justify-between items-start">
                    <h2 class="card-title text-xl">
                        <Power class="w-6 h-6 mr-2 text-primary" />
                        Rscoop Startup
                    </h2>
                    <input
                        type="checkbox"
                        class="toggle toggle-primary"
                        checked={isAutoStartEnabled()}
                        onChange={toggleAutoStart}
                        disabled={isLoading() || isToggling()}
                    />
                </div>
                <p class="text-base-content/80 mt-2 mb-3">
                    Auotostart Rscoop when Windows boots up via system registry.
                </p>
                {isLoading() && (
                    <div class="text-sm text-base-content/70 mt-2">Loading...</div>
                )}
                {error() && <div class="alert alert-error mt-4 text-sm">{error()}</div>}
                {successMessage() && <div class="alert alert-success mt-4 text-sm">{successMessage()}</div>}
            </div>
        </div>
    );
}