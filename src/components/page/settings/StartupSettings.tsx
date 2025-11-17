import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Power } from "lucide-solid";

export default function StartupSettings() {
    const [isAutoStartEnabled, setIsAutoStartEnabled] = createSignal(false);
    const [isLoading, setIsLoading] = createSignal(true);
    const [isToggling, setIsToggling] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [successMessage, setSuccessMessage] = createSignal<string | null>(null);

    const fetchAutoStartStatus = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const status = await invoke<boolean>("is_auto_start_enabled");
            setIsAutoStartEnabled(status);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to fetch auto-start status:", errorMsg);
            setError("Could not load auto-start setting: " + errorMsg);
        } finally {
            setIsLoading(false);
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
            setIsAutoStartEnabled(newState);
            setSuccessMessage(
                newState 
                    ? "Application will start automatically on boot." 
                    : "Application will no longer start automatically on boot."
            );
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to toggle auto-start:", errorMsg);
            setError("Failed to update auto-start setting: " + errorMsg);
            // Restore to previous state to prevent UI inconsistency with actual state
            setIsAutoStartEnabled(previousState);
        } finally {
            setIsToggling(false);
        }
    };

    onMount(() => {
        fetchAutoStartStatus();
    });

    return (
        <div class="card bg-base-200 shadow-xl">
            <div class="card-body">
                <h2 class="card-title text-xl">
                    <Power class="w-6 h-6 mr-2 text-primary" />
                    Startup Settings
                </h2>
                <p class="text-base-content/80 mb-4">
                    Configure whether the application should automatically start when Windows boots.
                </p>
                <div class="form-control w-full max-w-lg">
                    <label class="label cursor-pointer justify-between">
                        <span class="label-text font-semibold">Start Rscoop on Windows startup</span>
                        <input
                            type="checkbox"
                            class="toggle toggle-primary"
                            checked={isAutoStartEnabled()}
                            onChange={toggleAutoStart}
                            disabled={isLoading() || isToggling()}
                        />
                    </label>
                    {(isLoading() || isToggling()) && (
                        <div class="text-sm text-base-content/70 mt-2">
                            {isLoading() ? "Loading..." : "Updating..."}
                        </div>
                    )}
                </div>
                {error() && <div class="alert alert-error mt-4 text-sm">{error()}</div>}
                {successMessage() && <div class="alert alert-success mt-4 text-sm">{successMessage()}</div>}
            </div>
        </div>
    );
}