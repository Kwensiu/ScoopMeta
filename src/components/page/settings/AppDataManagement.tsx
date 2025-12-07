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
    const [clearSuccess, setClearSuccess] = createSignal<boolean>(false);
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

            // 获取日志保留天数设置
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
        // 防止并发操作
        if (isClearing()) {
            return;
        }

        if (clearConfirm()) {
            // 第二次点击 - 执行清理
            if (clearTimer()) {
                window.clearTimeout(clearTimer()!);
                setClearTimer(null);
            }
            setClearConfirm(false);

            // 重置状态
            setClearSuccess(false);
            setClearError(null);
            setIsClearing(true);

            try {
                // Clear both regular application data and Tauri store data
                await invoke("clear_application_data");
                await invoke("clear_store_data");

                // 只有在清理操作真正完成后才显示成功消息
                setClearSuccess(true);

                // 3秒后重启应用
                setTimeout(async () => {
                    await relaunch();
                }, 3000);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                setClearError(t("settings.app_data.clear_error") + ": " + errorMessage);
                setIsClearing(false);  // 只有在失败时才重置清理状态
            }
        } else {
            // 第一次点击 - 显示确认
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
                    <div class="alert alert-error">
                        <span>{loadError()}</span>
                    </div>
                </Show>
                <div class="card-body p-2">
                    <div class="bg-base-100 rounded-xl p-5 border border-base-content/5 shadow-sm">
                        <div class="space-y-4">
                            {/* Data Directory */}
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-base-200 rounded-lg">
                                <div class="flex items-start gap-3">
                                    <Folder class="text-primary" size={20} />
                                    <div>
                                        <h3 class="font-medium">{t("settings.app_data.data_directory")}</h3>
                                        <p class="text-sm text-base-content/70 break-all">{appDataDirPath()}</p>
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
                                    <FileText class="text-primary" size={20} />
                                    <div>
                                        <h3 class="font-medium">{t("settings.app_data.log_directory")}</h3>
                                        <p class="text-sm text-base-content/70 break-all">{logDir()}</p>
                                    </div>
                                </div>

                                <div class="flex gap-2">
                                    <div class="flex gap-2">
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
                                    <button
                                        class="btn btn-sm btn-primary whitespace-nowrap w-full max-w-[calc(100%-60px)]"
                                        onClick={openLogDir}
                                    >
                                        {t("settings.app_data.open_directory")}
                                    </button>
                                </div>

                            </div>
                            {/* Clean App data */}
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-warning/10 rounded-lg border border-warning/20">
                                <div class="flex items-start gap-3">
                                    <Trash2 class="text-warning" size={20} />
                                    <div>
                                        <h3 class="font-medium text-warning">{t("settings.app_data.clear_data")}</h3>
                                        <p class="text-sm text-base-content/70">
                                            {t("settings.app_data.clear_data_description")}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    class="btn btn-sm btn-warning whitespace-nowrap"
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
                    <div class="alert alert-error">
                        <span>{clearError()}</span>
                    </div>
                </Show>

            </Show>

            <Show when={isLoading()}>
                <div class="flex justify-center p-4">
                    <span class="loading loading-dots loading-md"></span>
                </div>
            </Show>
        </Card>
    );
}