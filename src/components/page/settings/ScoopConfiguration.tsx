import { createSignal, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { FolderCog, Save, CircleCheckBig, Folder, RefreshCw } from "lucide-solid";
import Card from "../../common/Card";
import { t } from "../../../i18n";

export interface ScoopConfigurationProps {
    onOpenDirectory?: () => void;
}

export default function ScoopConfiguration(props: ScoopConfigurationProps) {
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
            setPathError(t("settings.scoop_configuration.load_error"));
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
            setPathSuccessMessage(t("settings.scoop_configuration.save_success"));
            setTimeout(() => setPathSuccessMessage(null), 5000);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to save scoop path:", errorMsg);
            setPathError(t("settings.scoop_configuration.save_error") + errorMsg);
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
            setPathSuccessMessage(t("settings.scoop_configuration.detect_success"));
            setIsValidPath(true);
            setValidationResult(null);
            setTimeout(() => setPathSuccessMessage(null), 5000);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to detect scoop path:", errorMsg);
            setPathError(t("settings.scoop_configuration.detect_error"));
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
                message: t("settings.scoop_configuration.validation_error")
            });
            return;
        }

        setIsValidating(true);
        setPathError(null);
        try {
            const isValid = await invoke<boolean>("validate_scoop_directory", { path: scoopPath() });
            if (isValid) {
                setPathSuccessMessage(t("settings.scoop_configuration.valid_directory"));
            } else {
                setPathSuccessMessage(t("settings.scoop_configuration.invalid_directory"));
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to validate scoop directory:", errorMsg);
            setValidationResult({
                isValid: false,
                message: t("settings.scoop_configuration.validation_failed") + errorMsg
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
            title={t("settings.scoop_configuration.title")}
            icon={FolderCog}
            description={t("settings.scoop_configuration.description")}
            headerAction={
                <div class="flex items-center gap-2">
                    <Show when={props.onOpenDirectory}>
                        <button
                            class="btn btn-ghost btn-sm"
                            onClick={props.onOpenDirectory}
                            title="Open Scoop Directory"
                        >
                            <Folder class="w-5 h-5" />
                        </button>
                    </Show>
                    <button
                        class="btn btn-ghost btn-sm"
                        onClick={fetchScoopPath}
                        disabled={pathIsLoading() || isDetecting() || isSaving() || isValidating()}
                    >
                        <RefreshCw class="w-5 h-5" classList={{ "animate-spin": pathIsLoading() }} />
                    </button>
                </div>
            }
        >
            <label class="label">
                <span class="label-text font-semibold flex items-center">
                    {t("settings.scoop_configuration.path_label")}
                </span>
            </label>

            <div class="form-control w-full max-w-lg">

                <div class="join w-full">
                    <input
                        type="text"
                        placeholder={pathIsLoading() ? t("settings.scoop_configuration.loading") : t("settings.scoop_configuration.path_placeholder")}
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
                        <Save class="w-4 h-4 mr-1" />
                        {t("settings.scoop_configuration.save")}
                    </button>
                    <button
                        class={`btn join-item ${isDetecting() ? 'btn-info' : 'btn-info'}`}
                        onClick={detectScoopPath}
                        disabled={pathIsLoading() || isDetecting() || isSaving() || isValidating()}
                    >
                        {t("settings.scoop_configuration.auto")}
                    </button>
                    <button
                        class={`btn join-item ${validationResult()?.isValid ? 'btn-soft' : 'btn-soft btn-primary'}`}
                        onClick={validateScoopDirectory}
                        disabled={pathIsLoading() || isDetecting() || isSaving() || isValidating() || !scoopPath()}
                    >
                        {t("settings.scoop_configuration.test")}
                    </button>
                </div>

                <div class="text-sm text-base-content/70 mt-2">
                    {t("settings.scoop_configuration.auto_detect_description")}
                </div>

                {validationResult() && (
                    <div class={`alert mt-4 text-sm ${validationResult()?.isValid ? 'alert-success' : 'alert-warning'}`}>
                        <CircleCheckBig class={`w-4 h-4 ${validationResult()?.isValid ? 'text-success' : 'text-warning'}`} />
                        <span>{validationResult()?.message}</span>
                    </div>
                )}

                {pathError() && <div class="alert alert-error mt-4 text-sm">{pathError()}</div>}
                {pathSuccessMessage() && <div class="alert alert-success mt-4 text-sm">{pathSuccessMessage()}</div>}
            </div>
        </Card>
    );
}