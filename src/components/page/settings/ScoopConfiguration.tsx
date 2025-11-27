import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { FolderCog, Save, CheckCircle } from "lucide-solid";
import Card from "../../common/Card";

export default function ScoopConfiguration() {
    const [scoopPath, setScoopPath] = createSignal("");
    const [pathIsLoading, setPathIsLoading] = createSignal(true);
    const [isDetecting, setIsDetecting] = createSignal(false);
    const [isSaving, setIsSaving] = createSignal(false);
    const [isValidating, setIsValidating] = createSignal(false);
    const [pathError, setPathError] = createSignal<string | null>(null);
    const [pathSuccessMessage, setPathSuccessMessage] = createSignal<string | null>(null);
    const [isValidPath, setIsValidPath] = createSignal(true);
    const [validationResult, setValidationResult] = createSignal<{ isValid: boolean; message: string } | null>(null);

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
            setPathSuccessMessage("Scoop path saved and applied successfully!");
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
            setValidationResult(null);
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
        const invalidChars = /[<>|"?*]/;
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
        // Clear previous validation result when path changes
        setValidationResult(null);
    };
    
    // Validate Scoop directory structure
    const validateScoopDirectory = async () => {
        if (!scoopPath() || !isValidPath()) {
            setValidationResult({
                isValid: false,
                message: "Please enter a valid path first"
            });
            return;
        }

        setIsValidating(true);
        setPathError(null);
        try {
            const isValid = await invoke<boolean>("validate_scoop_directory", { path: scoopPath() });
            if (isValid) {
                setPathSuccessMessage("Scoop directory structure is valid");
            } else {
                setPathSuccessMessage("Directory exists but Scoop structure is invalid. Missing 'apps' or 'buckets' directories.");
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to validate scoop directory:", errorMsg);
            setValidationResult({
                isValid: false,
                message: `Validation failed: ${errorMsg}`
            });
        } finally {
            setIsValidating(false);
        }
    };
    
    onMount(() => {
        fetchScoopPath();
    });

    return (
        <Card
            title="Scoop Configuration"
            icon={FolderCog}
            description="Set the installation path for your Scoop directory. Changes will take effect immediately."
        >
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
                        disabled={pathIsLoading() || isDetecting() || isSaving() || isValidating()}
                    />
                    <button 
                        class="btn btn-primary join-item" 
                        onClick={handleSavePath} 
                        disabled={pathIsLoading() || isDetecting() || isSaving() || !isValidPath() || isValidating()}
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
                        disabled={pathIsLoading() || isDetecting() || isSaving() || isValidating()}
                    >
                        {isDetecting() ? (
                            <>
                                <span class="loading loading-spinner loading-xs"></span>
                                Detecting...
                            </>
                        ) : (
                            "Auto"
                        )}
                    </button>
                    <button 
                        class={`btn join-item ${validationResult()?.isValid ? 'btn-success' : 'btn-outline'}`} 
                        onClick={validateScoopDirectory} 
                        disabled={pathIsLoading() || isDetecting() || isSaving() || isValidating() || !scoopPath()}
                    >
                        {isValidating() ? (
                            <>
                                <span class="loading loading-spinner loading-xs"></span>
                                Testing...
                            </>
                        ) : (
                            "Test"
                        )}
                    </button>
                </div>
                
                <div class="text-sm text-base-content/70 mt-2">
                    Automatically detects Scoop installation directory from the SCOOP environment variable.
                </div>

                {validationResult() && (
                    <div class={`alert mt-4 text-sm ${validationResult()?.isValid ? 'alert-success' : 'alert-warning'}`}>
                        <CheckCircle class={`w-4 h-4 ${validationResult()?.isValid ? 'text-success' : 'text-warning'}`} />
                        <span>{validationResult()?.message}</span>
                    </div>
                )}

                {pathError() && <div class="alert alert-error mt-4 text-sm">{pathError()}</div>}
                {pathSuccessMessage() && <div class="alert alert-success mt-4 text-sm">{pathSuccessMessage()}</div>}
            </div>
        </Card>
    );
}