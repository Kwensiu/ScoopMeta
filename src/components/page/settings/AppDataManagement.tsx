import { createSignal, Show, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { HardDrive, Folder, FileText, Trash2 } from "lucide-solid";
import Card from "../../common/Card";
import { t } from "../../../i18n";
import { createStoredSignal } from "../../../hooks/createStoredSignal";

export default function AppDataManagement() {
    const [appDataDirPath, setAppDataDirPath] = createSignal<string>("");
    const [logDir, setLogDir] = createSignal<string>("");
    const [logRetentionDays, setLogRetentionDays] = createStoredSignal<number>("logRetentionDays", 7);
    const [isLoading, setIsLoading] = createSignal<boolean>(true);
    const [isClearing, setIsClearing] = createSignal<boolean>(false);
    // const [clearSuccess, setClearSuccess] = createSignal<boolean>(false);
    const [clearError, setClearError] = createSignal<string | null>(null);
    const [loadError, setLoadError] = createSignal<string | null>(null);
    const [clearConfirm, setClearConfirm] = createSignal<boolean>(false);
    const [clearTimer, setClearTimer] = createSignal<number | null>(null);

    onMount(async () => {
        try {
            const dataDir = await invoke<string>("get_app_data_dir");
            const logDir = await invoke<string>("get_log_dir_cmd");
            setAppDataDirPath(dataDir);
            setLogDir(logDir);

            const retentionDays = await invoke<number>("get_log_retention_days");
            setLogRetentionDays(retentionDays);
            setLoadError(null);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            setLoadError(t("settings.app_data.load_error") + ": " + errorMessage);
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
                // 错误处理
                const errorMessage = error instanceof Error ? error.message : String(error);
                setClearError(t("settings.app_data.clear_error") + ": " + errorMessage);
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

    const handleLogRetentionChange = async (days: number) => {
        try {
            await invoke("set_log_retention_days", { days });
            setLogRetentionDays(days);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            setClearError(t("settings.app_data.log_retention_error") + ": " + errorMessage);
            console.error("Failed to set log retention days:", error);
        }
    };

    return (
        <Card
            title={t("settings.app_data.title")}
            icon={HardDrive}
            description={t("settings.app_data.description")}
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
                                        <h3 class="font-medium text-sm">{t("settings.app_data.data_directory")}</h3>
                                        <p class="text-xs text-base-content/70 break-all mt-0.5">{appDataDirPath()}</p>
                                    </div>
                                </div>
                                <button
                                    class="btn btn-xs btn-primary"
                                    onClick={openAppDataDir}
                                >
                                    {t("settings.app_data.open_directory")}
                                </button>
                            </div>

                            {/* Log Directory */}
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-base-200 rounded-md">
                                <div class="flex items-start gap-2">
                                    <FileText class="text-primary mt-0.5" size={18} />
                                    <div>
                                        <h3 class="font-medium text-sm">{t("settings.app_data.log_directory")}</h3>
                                        <p class="text-xs text-base-content/70 break-all mt-0.5">{logDir()}</p>
                                    </div>
                                </div>

                                <div class="flex gap-2">
                                    <div class="flex gap-2">
                                        <select
                                            class="select select-bordered select-xs"
                                            value={logRetentionDays()}
                                            onChange={(e) => handleLogRetentionChange(Number(e.target.value))}
                                        >
                                            <option value="1">{t("settings.app_data.1_day")}</option>
                                            <option value="3">{t("settings.app_data.3_days")}</option>
                                            <option value="7">{t("settings.app_data.7_days")}</option>
                                            <option value="14">{t("settings.app_data.14_days")}</option>
                                            <option value="30">{t("settings.app_data.30_days")}</option>
                                        </select>
                                    </div>
                                    <button
                                        class="btn btn-xs btn-primary w-full max-w-[calc(100%-60px)]"
                                        onClick={openLogDir}
                                    >
                                        {t("settings.app_data.open_directory")}
                                    </button>
                                </div>

                            </div>
                            {/* Clean App data */}
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-warning/10 rounded-md border border-warning/20">
                                <div class="flex items-start gap-2">
                                    <Trash2 class="text-warning mt-0.5" size={18} />
                                    <div>
                                        <h3 class="font-medium text-warning text-sm">{t("settings.app_data.clear_data")}</h3>
                                        <p class="text-xs text-base-content/70 mt-0.5">
                                            {t("settings.app_data.clear_data_description")}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    class="btn btn-xs btn-warning"
                                    classList={{ "btn-error": clearConfirm() }}
                                    onClick={clearApplicationData}
                                    disabled={isClearing()}
                                >
                                    <Show when={isClearing()} fallback={
                                        <Show when={clearConfirm()} fallback={t("settings.app_data.clear_button")}>
                                            {t("settings.app_data.sure")}
                                        </Show>
                                    }>
                                        <span class="loading loading-spinner loading-xs"></span>
                                        {t("settings.app_data.clearing")}
                                    </Show>
                                </button>
                            </div>
                        </div>
                        {/* Maybe no necessary
                    <Show when={clearSuccess()}>
                        <div class="alert alert-success">
                            <span>{t("settings.app_data.clear_success")}</span>
                        </div>
                    </Show>
                    */}
                    </div>
                </div>
                <Show when={clearError()}>
                    <div class="alert alert-error mt-2">
                        <span>{clearError()}</span>
                    </div>
                </Show>

            </Show>

            <Show when={isLoading()}>
                <div class="flex justify-center p-3">
                    <span class="loading loading-dots loading-sm"></span>
                </div>
            </Show>
        </Card>
    );
}