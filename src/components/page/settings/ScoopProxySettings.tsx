import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Globe } from "lucide-solid";

function ScoopProxySettings() {
    const [proxyValue, setProxyValue] = createSignal("");
    const [isLoading, setIsLoading] = createSignal(true);
    const [isSaving, setIsSaving] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [successMessage, setSuccessMessage] = createSignal<string | null>(null);

    // Load proxy setting from Scoop config on mount
    onMount(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const proxy = await invoke<string | null>("get_scoop_proxy");
            setProxyValue(proxy ?? "");
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to fetch scoop proxy:", errorMsg);
            setError("Could not load Scoop proxy setting.");
        } finally {
            setIsLoading(false);
        }
    });

    const handleSaveProxy = async () => {
        setIsSaving(true);
        setError(null);
        setSuccessMessage(null);
        try {
            await invoke("set_scoop_proxy", { proxy: proxyValue() });
            setSuccessMessage("Scoop proxy saved successfully!");
            setTimeout(() => setSuccessMessage(null), 5000);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to save scoop proxy:", errorMsg);
            setError("Failed to save Scoop proxy.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleClearProxy = async () => {
        setProxyValue("");
        setIsSaving(true);
        setError(null);
        setSuccessMessage(null);
        try {
            await invoke("set_scoop_proxy", { proxy: "" });
            setSuccessMessage("Scoop proxy cleared successfully!");
            setTimeout(() => setSuccessMessage(null), 5000);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to clear scoop proxy:", errorMsg);
            setError("Failed to clear Scoop proxy.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div class="card bg-base-200 shadow-xl">
            <div class="card-body">
                <h2 class="card-title text-xl">
                    <Globe class="w-6 h-6 mr-2 text-primary" />
                    Scoop Proxy
                </h2>
                <p class="text-base-content/80 mb-4">
                    Configure the proxy server for Scoop to use when downloading packages and updating buckets.
                </p>
                
                <div class="form-control w-full">
                    <label class="label">
                        <span class="label-text font-semibold">Proxy Server</span>
                    </label>
                    <div class="join">
                        <input 
                            type="text"
                            placeholder={isLoading() ? "Loading..." : "e.g. 127.0.0.1:8080 or username:password@proxy:8080"}
                            class="input input-bordered join-item w-full max-w-full" 
                            value={proxyValue()}
                            onInput={(e) => setProxyValue(e.currentTarget.value)}
                            disabled={isLoading() || isSaving()}
                        />
                        <button 
                            class="btn btn-primary join-item" 
                            onClick={handleSaveProxy}
                            disabled={isLoading() || isSaving()}
                        >
                            {isSaving() ? (
                                <>
                                    <span class="loading loading-spinner loading-xs"></span>
                                    Saving...
                                </>
                            ) : (
                                "Save"
                            )}
                        </button>
                        <button 
                            class="btn join-item bg-orange-500 hover:bg-orange-600 border-none" 
                            onClick={handleClearProxy}
                            disabled={isLoading() || isSaving() || !proxyValue()}
                        >
                            Clear
                        </button>
                    </div>
                    <div class="text-sm text-base-content/70 mt-2">
                        Enter proxy in format: [user:password@]proxyhost[:port].
                        <br />
                        Leave empty to disable proxy.
                    </div>
                    

                </div>
                
                {error() && <div class="alert alert-error mt-4 text-sm">{error()}</div>}
                {successMessage() && <div class="alert alert-success mt-4 text-sm">{successMessage()}</div>}
                
                <div class="text-sm text-base-content/60 mt-4">
                    <p><strong>Note:</strong> This setting affects all Scoop operations including package installations, updates, and bucket management.</p>
                </div>
            </div>
        </div>
    );
}

export default ScoopProxySettings;