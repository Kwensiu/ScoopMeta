import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { FolderCog, Save, RefreshCw, CheckCircle } from "lucide-solid";

export default function ScoopConfiguration() {
    const [scoopPath, setScoopPath] = createSignal("");
    const [pathIsLoading, setPathIsLoading] = createSignal(true);
    const [isDetecting, setIsDetecting] = createSignal(false);
    const [isSaving, setIsSaving] = createSignal(false);
    const [pathError, setPathError] = createSignal<string | null>(null);
    const [pathSuccessMessage, setPathSuccessMessage] = createSignal<string | null>(null);
    const [isValidPath, setIsValidPath] = createSignal(true);

    const fetchScoopPath = async () => {
        setPathIsLoading(true);
        setPathError(null);
        try {
            const path = await invoke<string | null>("get_scoop_path", {});
            setScoopPath(path ?? "");
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to fetch scoop path:", errorMsg);
            setPathError("Could not load Scoop path setting.");
        } finally {
            setPathIsLoading(false);
        }
    };
    
    const handleSavePath = async () => {
        setIsSaving(true);
        setPathError(null);
        setPathSuccessMessage(null);
        try {
            await invoke("set_scoop_path", { path: scoopPath() });
            setPathSuccessMessage("Scoop path saved! Restart the app for it to take effect everywhere.");
            setTimeout(() => setPathSuccessMessage(null), 5000);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to save scoop path:", errorMsg);
            setPathError("Failed to save Scoop path: " + errorMsg);
        } finally {
            setIsSaving(false);
        }
    };
    
    const detectScoopPath = async () => {
        setIsDetecting(true);
        setPathError(null);
        try {
            const detectedPath = await invoke<string>("detect_scoop_path");
            setScoopPath(detectedPath);
            setPathSuccessMessage("Scoop path detected successfully!");
            setIsValidPath(true);
            setTimeout(() => setPathSuccessMessage(null), 5000);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to detect scoop path:", errorMsg);
            setPathError(`Failed to detect Scoop path. Please make sure the SCOOP environment variable is set correctly.`);
        } finally {
            setIsDetecting(false);
        }
    };
    
    // Validate path format
    const validatePath = (path: string) => {
        // Simple validation to check if path contains invalid characters
        const invalidChars = /[<>:"|?*]/;
        const isValid = !invalidChars.test(path) && path.length > 0;
        setIsValidPath(isValid);
        return isValid;
    };
    
    // Validate when path changes
    const handlePathChange = (value: string) => {
        setScoopPath(value);
        if (value.trim() !== "") {
            validatePath(value);
        } else {
            setIsValidPath(true); // Empty path is considered valid
        }
    };
    
    onMount(() => {
        fetchScoopPath();
    });

    return (
        <div class="card bg-base-200 shadow-xl">
            <div class="card-body">
                <h2 class="card-title text-xl">
                    <FolderCog class="w-6 h-6 mr-2 text-primary" />
                    Scoop Configuration
                </h2>
                <p class="text-base-content/80 mb-4">
                    Set the installation path for your Scoop directory. The application may need to be restarted for this to take full effect.
                </p>
                <div class="form-control w-full max-w-lg">
                    <label class="label">
                        <span class="label-text font-semibold flex items-center">
                            Scoop Installation Path
                        </span>
                    </label>
                    <div class="join">
                        <input 
                            type="text"
                            placeholder={pathIsLoading() ? "Loading..." : "Enter Scoop path (e.g. C:\\scoop)"}
                            class={`input input-bordered join-item w-full ${!isValidPath() ? 'input-error' : ''}`} 
                            value={scoopPath()}
                            onInput={(e) => handlePathChange(e.currentTarget.value)}
                            disabled={pathIsLoading() || isDetecting() || isSaving()}
                        />
                        <button 
                            class="btn btn-primary join-item" 
                            onClick={handleSavePath} 
                            disabled={pathIsLoading() || isDetecting() || isSaving() || !isValidPath()}
                        >
                            {isSaving() ? (
                                <>
                                    <span class="loading loading-spinner loading-xs"></span>
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save class="w-4 h-4 mr-1" />
                                    Save
                                </>
                            )}
                        </button>
                        <button 
                            class={`btn join-item ${isDetecting() ? 'btn-info' : 'btn-info'}`} 
                            onClick={detectScoopPath} 
                            disabled={pathIsLoading() || isDetecting() || isSaving()}
                        >
                            <RefreshCw class={`w-4 h-4 mr-1 ${isDetecting() ? 'animate-spin' : ''}`} />
                            Auto-detect
                        </button>
                    </div>
                    {!isValidPath() && scoopPath() && (
                        <div class="text-sm text-error mt-2">
                            Invalid path: contains illegal characters
                        </div>
                    )}
                    {isValidPath() && scoopPath() && (
                        <div class="text-sm text-success flex items-center mt-2">
                            <CheckCircle class="w-4 h-4 mr-1" />
                            Path format is valid
                        </div>
                    )}
                    <div class="text-sm text-base-content/70 mt-2">
                        Automatically detects Scoop installation directory from the SCOOP environment variable.
                    </div>
                </div>
                {pathError() && <div class="alert alert-error mt-4 text-sm">{pathError()}</div>}
                {pathSuccessMessage() && <div class="alert alert-success mt-4 text-sm">{pathSuccessMessage()}</div>}
            </div>
        </div>
    );
}