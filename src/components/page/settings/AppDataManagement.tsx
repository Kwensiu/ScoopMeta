import { createSignal, Show, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { HardDrive, Folder, FileText, Trash2 } from "lucide-solid";
import Card from "../../common/Card";
import { t } from "../../../i18n";

// Reusable action button component
function ActionButton(props: {
    title: string;
    description: string;
    buttonText: string;
    confirmText: string;
    loadingText: string;
    icon: typeof Trash2;
    color: 'info' | 'warning' | 'error';
    isLoading: () => boolean;
    isConfirming: () => boolean;
    onClick: () => void;
}) {
    return (
        <div class={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 ${props.color === 'error' || props.color === 'warning' ? 'bg-base-200' : `bg-${props.color}/10`} ${props.color === 'error' ? 'border-red-300' : props.color === 'warning' ? 'border-orange-300' : `border-${props.color}/20`} rounded-md`}>
            <div class="flex items-start gap-2">
                <props.icon class={`text-${props.color} mt-0.5`} size={18} />
                <div>
                    <h3 class={`font-medium text-${props.color} text-sm`}>{props.title}</h3>
                    <p class="text-xs text-base-content/70 mt-0.5">{props.description}</p>
                </div>
            </div>
            <button
                class={`btn btn-xs ${props.color === 'error' ? 'bg-red-600 hover:bg-red-700 text-white border-red-700' : `btn-${props.color}`}`}
                classList={{ 
                    "btn-error": props.isConfirming(),
                    "bg-red-600 hover:bg-red-700 text-white border-red-600": props.color === 'error' && !props.isConfirming()
                }}
                onClick={props.onClick}
                disabled={props.isLoading()}
            >
                <Show when={props.isLoading()} fallback={
                    <Show when={props.isConfirming()} fallback={props.buttonText}>
                        {props.confirmText}
                    </Show>
                }>
                    <span class="loading loading-spinner loading-xs"></span>
                    {props.loadingText}
                </Show>
            </button>
        </div>
    );
}

export default function AppDataManagement() {
    const [appDataDirPath, setAppDataDirPath] = createSignal<string>("");
    const [logDir, setLogDir] = createSignal<string>("");
    const [isLoading, setIsLoading] = createSignal<boolean>(true);
    const [isClearing, setIsClearing] = createSignal<boolean>(false);
    // const [clearSuccess, setClearSuccess] = createSignal<boolean>(false);
    const [clearError, setClearError] = createSignal<string | null>(null);
    const [loadError, setLoadError] = createSignal<string | null>(null);
    const [clearConfirm, setClearConfirm] = createSignal<boolean>(false);
    const [clearTimer, setClearTimer] = createSignal<number | null>(null);

    // Cache clearing states
    const [isClearingCache, setIsClearingCache] = createSignal<boolean>(false);
    const [clearCacheError, setClearCacheError] = createSignal<string | null>(null);
    const [clearCacheConfirm, setClearCacheConfirm] = createSignal<boolean>(false);
    const [clearCacheTimer, setClearCacheTimer] = createSignal<number | null>(null);

    onMount(async () => {
        try {
            const dataDir = await invoke<string>("get_app_data_dir");
            const logDir = await invoke<string>("get_log_dir_cmd");
            setAppDataDirPath(dataDir);
            setLogDir(logDir);

            setLoadError(null);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            setLoadError(t("settings.appData.loadError") + ": " + errorMessage);
            console.error("Failed to load app data info:", error);
        } finally {
            setIsLoading(false);
        }
    });

    const openAppDataDir = async () => {
        if (appDataDirPath()) {
            try {
                await openPath(appDataDirPath());
            } catch (error) {
                console.error("Failed to open app data directory:", error);
            }
        }
    };

    const openLogDir = async () => {
        if (logDir()) {
            try {
                await openPath(logDir());
            } catch (error) {
                console.error("Failed to open log directory:", error);
            }
        }
    };

    const clearApplicationData = async () => {
        if (isClearing()) {
            return;
        }

        if (clearConfirm()) {
            if (clearTimer()) {
                window.clearTimeout(clearTimer()!);
                setClearTimer(null);
            }
            setClearConfirm(false);
            // setClearSuccess(false);
            setClearError(null);
            setIsClearing(true);

            try {
                await invoke("factory_reset");

                // setClearSuccess(true);

                setTimeout(async () => {
                    await relaunch();
                }, 1000);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                setClearError(t("settings.appData.clearError") + ": " + errorMessage);
                setIsClearing(false);
            }
        } else {
            setClearConfirm(true);
            const timer = window.setTimeout(() => {
                setClearConfirm(false);
                setClearTimer(null);
            }, 3000);
            setClearTimer(timer);
        }
    };

    const clearCacheData = async () => {
        if (isClearingCache()) {
            return;
        }

        if (clearCacheConfirm()) {
            if (clearCacheTimer()) {
                window.clearTimeout(clearCacheTimer()!);
                setClearCacheTimer(null);
            }
            setClearCacheConfirm(false);
            setClearCacheError(null);
            setIsClearingCache(true);

            try {
                // Clear WebView cache
                await invoke("clear_webview_cache");

                console.log("Cache cleared successfully");
                setIsClearingCache(false); // 退出loading状态
                // Could show success message here if needed
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                setClearCacheError(t("settings.appData.clearCacheError") + ": " + errorMessage);
                setIsClearingCache(false);
            }
        } else {
            setClearCacheConfirm(true);
            const timer = window.setTimeout(() => {
                setClearCacheConfirm(false);
                setClearCacheTimer(null);
            }, 3000);
            setClearCacheTimer(timer);
        }
    };

    return (
        <Card
            title={t("settings.appData.title")}
            icon={HardDrive}
            description={t("settings.appData.description")}
        >
            <Show when={!isLoading()}>

                <Show when={loadError()}>
                    <div class="alert alert-error mb-2">
                        <span>{loadError()}</span>
                    </div>
                </Show>
                <div class="card-body p-2">
                    <div class="bg-base-100 rounded-lg p-4 border border-base-content/5 shadow-sm">
                        <div class="space-y-3">
                            {/* Data Directory */}
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-base-200 rounded-md">
                                <div class="flex items-start gap-2">
                                    <Folder class="text-primary mt-0.5" size={18} />
                                    <div>
                                        <h3 class="font-medium text-sm">{t("settings.appData.dataDirectory")}</h3>
                                        <p class="text-xs text-base-content/70 break-all mt-0.5">{appDataDirPath()}</p>
                                    </div>
                                </div>
                                <button
                                    class="btn btn-xs btn-primary"
                                    onClick={openAppDataDir}
                                >
                                    {t("settings.appData.openDirectory")}
                                </button>
                            </div>

                            {/* Log Directory */}
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-base-200 rounded-md">
                                <div class="flex items-start gap-2">
                                    <FileText class="text-primary mt-0.5" size={18} />
                                    <div>
                                        <h3 class="font-medium text-sm">{t("settings.appData.logDirectory")}</h3>
                                        <p class="text-xs text-base-content/70 break-all mt-0.5">{logDir()}</p>
                                    </div>
                                </div>
                                <button
                                    class="btn btn-xs btn-primary"
                                    onClick={openLogDir}
                                >
                                    {t("settings.appData.openDirectory")}
                                </button>
                            </div>

                            {/* Clear Cache */}
                            <ActionButton
                                title={t("settings.appData.clearCache")}
                                description={t("settings.appData.clearCacheDescription")}
                                buttonText={t("settings.appData.clearCacheButton")}
                                confirmText={t("settings.appData.sure")}
                                loadingText={t("settings.appData.clearingCache")}
                                icon={Trash2}
                                color="warning"
                                isLoading={isClearingCache}
                                isConfirming={clearCacheConfirm}
                                onClick={clearCacheData}
                            />

                            {/* Factory Reset */}
                            <ActionButton
                                title={t("settings.appData.factoryReset")}
                                description={t("settings.appData.factoryResetDescription")}
                                buttonText={t("settings.appData.factoryResetButton")}
                                confirmText={t("settings.appData.sure")}
                                loadingText={t("settings.appData.resetting")}
                                icon={Trash2}
                                color="error"
                                isLoading={isClearing}
                                isConfirming={clearConfirm}
                                onClick={clearApplicationData}
                            />
                        </div>
                    </div>
                </div>
                <Show when={clearError()}>
                    <div class="alert alert-error mt-2">
                        <span>{clearError()}</span>
                    </div>
                </Show>

                <Show when={clearCacheError()}>
                    <div class="alert alert-error mt-2">
                        <span>{clearCacheError()}</span>
                    </div>
                </Show>
            </Show>
        </Card>
    );
}