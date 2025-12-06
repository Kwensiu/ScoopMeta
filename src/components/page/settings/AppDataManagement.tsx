import { createSignal, Show, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { HardDrive, Folder, FileText, RotateCcw, Trash2 } from "lucide-solid";
import Card from "../../common/Card";
import { t } from "../../../i18n";

export default function AppDataManagement() {
    const [appDataDirPath, setAppDataDirPath] = createSignal<string>("");
    const [logDir, setLogDir] = createSignal<string>("");
    const [logRetentionDays, setLogRetentionDays] = createSignal<number>(7);
    const [isLoading, setIsLoading] = createSignal<boolean>(true);
    const [isClearing, setIsClearing] = createSignal<boolean>(false);
    const [clearSuccess, setClearSuccess] = createSignal<boolean>(false);
    const [clearError, setClearError] = createSignal<string | null>(null);

    onMount(async () => {
        try {
            const dataDir = await invoke<string>("get_app_data_dir");
            const logDir = await invoke<string>("get_log_dir_cmd");
            setAppDataDirPath(dataDir);
            setLogDir(logDir);
            
            // 获取日志保留天数设置
            const retentionDays = await invoke<number>("get_log_retention_days");
            setLogRetentionDays(retentionDays);
        } catch (error) {
            console.error("Failed to load app data info:", error);
        } finally {
            setIsLoading(false);
        }
    });

    const openAppDataDir = async () => {
        if (appDataDirPath()) {
            await openPath(appDataDirPath());
        }
    };

    const openLogDir = async () => {
        if (logDir()) {
            await openPath(logDir());
        }
    };

    const clearApplicationData = async () => {
        if (!confirm(t("settings.app_data.clear_confirm"))) {
            return;
        }

        setIsClearing(true);
        setClearSuccess(false);
        setClearError(null);

        try {
            await invoke("clear_application_data");
            setClearSuccess(true);
            
            // 3秒后重启应用
            setTimeout(async () => {
                await relaunch();
            }, 3000);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            setClearError(t("settings.app_data.clear_error") + ": " + errorMessage);
        } finally {
            setIsClearing(false);
        }
    };

    const handleLogRetentionChange = async (days: number) => {
        try {
            await invoke("set_log_retention_days", { days });
            setLogRetentionDays(days);
        } catch (error) {
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
                <div class="space-y-6">
                    {/* Data Directory */}
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-base-200 rounded-lg">
                        <div class="flex items-start gap-3">
                            <Folder class="mt-1 text-primary" size={20} />
                            <div>
                                <h3 class="font-medium">{t("settings.app_data.data_directory")}</h3>
                                <p class="text-sm text-base-content/70 mt-1 break-all">{appDataDirPath()}</p>
                            </div>
                        </div>
                        <button 
                            class="btn btn-sm btn-primary whitespace-nowrap"
                            onClick={openAppDataDir}
                        >
                            {t("settings.app_data.open_directory")}
                        </button>
                    </div>

                    {/* Log Directory */}
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-base-200 rounded-lg">
                        <div class="flex items-start gap-3">
                            <FileText class="mt-1 text-primary" size={20} />
                            <div>
                                <h3 class="font-medium">{t("settings.app_data.log_directory")}</h3>
                                <p class="text-sm text-base-content/70 mt-1 break-all">{logDir()}</p>
                            </div>
                        </div>
                        <button 
                            class="btn btn-sm btn-primary whitespace-nowrap"
                            onClick={openLogDir}
                        >
                            {t("settings.app_data.open_directory")}
                        </button>
                    </div>

                    {/* Log Retention */}
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-base-200 rounded-lg">
                        <div class="flex items-start gap-3">
                            <RotateCcw class="mt-1 text-primary" size={20} />
                            <div>
                                <h3 class="font-medium">{t("settings.app_data.log_retention")}</h3>
                                <p class="text-sm text-base-content/70 mt-1">
                                    {t("settings.app_data.log_retention_description")}
                                </p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <select 
                                class="select select-bordered select-sm"
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
                    </div>

                    {/* Clean App data */}
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-warning/10 rounded-lg border border-warning/20">
                        <div class="flex items-start gap-3">
                            <Trash2 class="mt-1 text-warning" size={20} />
                            <div>
                                <h3 class="font-medium text-warning">{t("settings.app_data.clear_data")}</h3>
                                <p class="text-sm text-base-content/70 mt-1">
                                    {t("settings.app_data.clear_data_description")}
                                </p>
                            </div>
                        </div>
                        <button 
                            class="btn btn-sm btn-warning whitespace-nowrap"
                            onClick={clearApplicationData}
                            disabled={isClearing()}
                        >
                            <Show when={isClearing()} fallback={t("settings.app_data.clear_button")}>
                                <span class="loading loading-spinner loading-xs"></span>
                                {t("settings.app_data.clearing")}
                            </Show>
                        </button>
                    </div>

                    <Show when={clearSuccess()}>
                        <div class="alert alert-success">
                            <span>{t("settings.app_data.clear_success")}</span>
                        </div>
                    </Show>

                    <Show when={clearError()}>
                        <div class="alert alert-error">
                            <span>{clearError()}</span>
                        </div>
                    </Show>
                </div>
            </Show>

            <Show when={isLoading()}>
                <div class="flex justify-center p-4">
                    <span class="loading loading-dots loading-md"></span>
                </div>
            </Show>
        </Card>
    );
}