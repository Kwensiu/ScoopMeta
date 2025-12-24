import { createSignal, onMount, Show, For, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { History, RefreshCw, X, TriangleAlert, Inbox, Trash2 } from "lucide-solid";
import Card from "../../common/Card";
import { t } from "../../../i18n";

interface UpdateLogEntry {
    timestamp: string;
    operation_type: string;
    operation_result: string;
    success_count: number;
    total_count: number;
    details: string[];
}

export default function UpdateHistory() {
    const [logs, setLogs] = createSignal<UpdateLogEntry[]>([]);
    const [selectedItems, setSelectedItems] = createSignal<Set<string>>(new Set());
    const [loading, setLoading] = createSignal(false);
    const [forceSpin, setForceSpin] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [selectedLog, setSelectedLog] = createSignal<UpdateLogEntry | null>(null);

    const isAllSelected = createMemo(() => {
        const logItems = logs();
        if (logItems.length === 0) return false;
        return logItems.every(log => selectedItems().has(log.timestamp));
    });

    const fetchLogs = async () => {
        setLoading(true);
        setError(null);
        setSelectedItems(new Set<string>());
        try {
            const fetchedLogs = await invoke<UpdateLogEntry[]>("get_update_logs", { limit: 50 });
            setLogs(fetchedLogs);
        } catch (e) {
            setError(t("settings.update_history.fetch_error"));
        } finally {
            setTimeout(() => {
                setLoading(false);
                setForceSpin(true);
                setTimeout(() => {
                    setForceSpin(false);
                }, 600);
            }, 300);
        }
    };

    const clearAllLogs = async () => {
        if (!confirm(t("settings.update_history.clear_confirm"))) return;
        
        try {
            await invoke("clear_all_update_logs");
            setLogs([]);
            setSelectedItems(new Set<string>());
        } catch (e) {
            setError(t("settings.update_history.clear_error"));
        }
    };

    const removeLogEntry = async (timestamp: string) => {
        try {
            await invoke("remove_update_log_entry", { timestamp });
            setLogs(logs().filter(log => log.timestamp !== timestamp));
            // 从选中项中移除
            const newSelected = new Set<string>(selectedItems());
            newSelected.delete(timestamp);
            setSelectedItems(newSelected);
        } catch (e) {
            setError(t("settings.update_history.delete_error"));
        }
    };

    const toggleSelection = (timestamp: string) => {
        setSelectedItems(prev => {
            const next = new Set<string>(prev);
            if (next.has(timestamp)) {
                next.delete(timestamp);
            } else {
                next.add(timestamp);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (isAllSelected()) {
            setSelectedItems(new Set<string>());
        } else {
            setSelectedItems(new Set<string>(logs().map(log => log.timestamp)));
        }
    };

    const clearSelectedLogs = async () => {
        const selectedTimestamps = Array.from(selectedItems());
        if (selectedTimestamps.length === 0) return;

        try {
            // 逐个删除选中的日志条目
            for (const timestamp of selectedTimestamps) {
                await invoke("remove_update_log_entry", { timestamp });
            }
            
            // 更新本地状态
            setLogs(prevLogs => prevLogs.filter(log => !selectedTimestamps.includes(log.timestamp)));
            setSelectedItems(new Set<string>());
        } catch (e) {
            setError(t("settings.update_history.delete_error"));
        }
    };

    const formatDate = (timestamp: string) => {
        try {
            const date = new Date(timestamp);
            return date.toLocaleString();
        } catch {
            return timestamp;
        }
    };

    const getStatusColor = (result: string) => {
        switch (result) {
            case "success":
                return "text-success";
            case "partial":
                return "text-warning";
            case "failed":
                return "text-error";
            default:
                return "";
        }
    };

    const getStatusBgColor = (result: string) => {
        switch (result) {
            case "success":
                return "bg-success/10";
            case "partial":
                return "bg-warning/10";
            case "failed":
                return "bg-error/10";
            default:
                return "bg-base-200";
        }
    };

    const getStatusIcon = (result: string) => {
        switch (result) {
            case "success":
                return "✓";
            case "partial":
                return "⚠";
            case "failed":
                return "✗";
            default:
                return "";
        }
    };

    const getOperationTypeText = (type: string) => {
        switch (type) {
            case "bucket":
                return t("settings.update_history.bucket_update");
            case "package":
                return t("settings.update_history.package_update");
            default:
                return type;
        }
    };

    const getResultText = (result: string) => {
        switch (result) {
            case "success":
                return t("settings.update_history.success");
            case "partial":
                return t("settings.update_history.partial");
            case "failed":
                return t("settings.update_history.failed");
            default:
                return result;
        }
    };

    onMount(() => {
        fetchLogs();
    });

    return (
        <Card
            title={t("settings.update_history.title")}
            icon={History}
            headerAction={
                <div class="flex items-center gap-2">
                    <Show when={logs().length > 0 && selectedItems().size > 0}>
                        <button
                            type="button"
                            class="btn btn-warning btn-sm"
                            onClick={clearSelectedLogs}
                            disabled={selectedItems().size === 0 || loading()}
                        >
                            <Trash2 class="w-4 h-4" />
                            {t('settings.update_history.selected')} ({selectedItems().size})
                        </button>
                        <button
                            type="button"
                            class="btn btn-error btn-sm"
                            onClick={clearAllLogs}
                            title={t("settings.update_history.clear_all")}
                        >
                            <Trash2 class="w-4 h-4" />
                            {t("settings.update_history.clear_all")}
                        </button>
                        <div class="divider divider-horizontal m-1" />
                    </Show>
                    <button
                        type="button"
                        class="btn btn-ghost btn-sm"
                        disabled={loading() || forceSpin()}
                        onClick={fetchLogs}
                    >
                        <RefreshCw class="w-5 h-5" classList={{ "animate-spin": loading() || forceSpin() }} />
                    </button>
                </div>
            }
        >
            <div class="max-h-[60vh] overflow-y-auto">
                <Show when={error()}>
                    <div role="alert" class="alert alert-error my-4">
                        <TriangleAlert class="w-5 h-5" />
                        <span>{error()}</span>
                    </div>
                </Show>

                <Show when={!error() && logs().length === 0}>
                    <div class="text-center p-8">
                        <Inbox class="w-16 h-16 mx-auto text-base-content/30" />
                        <p class="mt-4 text-lg font-semibold">{t("settings.update_history.no_logs")}</p>
                        <p class="text-base-content/60">{t("settings.update_history.no_logs_description")}</p>
                    </div>
                </Show>

                <Show when={!error() && logs().length > 0}>
                    <div class="overflow-x-auto">
                        <table class="table table-sm">
                            <thead class="sticky top-0 bg-base-200 z-10">
                                <tr>
                                    <th>
                                        <label>
                                            <input
                                                type="checkbox"
                                                class="checkbox checkbox-primary"
                                                checked={isAllSelected()}
                                                onChange={toggleSelectAll}
                                            />
                                        </label>
                                    </th>
                                    <th>{t("settings.update_history.time")}</th>
                                    <th>{t("settings.update_history.type")}</th>
                                    <th>{t("settings.update_history.result")}</th>
                                    <th class="text-right w-16"></th>
                                </tr>
                            </thead>
                            <tbody>
                                <For each={logs()}>
                                    {(log) => (
                                        <tr class="hover">
                                            <td>
                                                <label>
                                                    <input
                                                        type="checkbox"
                                                        class="checkbox checkbox-primary"
                                                        checked={selectedItems().has(log.timestamp)}
                                                        onChange={() => toggleSelection(log.timestamp)}
                                                    />
                                                </label>
                                            </td>
                                            <td class="font-mono text-sm">{formatDate(log.timestamp)}</td>
                                            <td>{getOperationTypeText(log.operation_type)}</td>
                                            <td>
                                                <div class={`badge gap-1 ${getStatusBgColor(log.operation_result)} ${getStatusColor(log.operation_result)}`}>
                                                    {getStatusIcon(log.operation_result)} {getResultText(log.operation_result)}
                                                </div>
                                            </td>
                                            <td class="text-right">
                                                <button
                                                    type="button"
                                                    class="btn btn-xs btn-ghost"
                                                    onClick={() => setSelectedLog(log)}
                                                >
                                                    {t("settings.update_history.view_details")}
                                                </button>
                                            </td>
                                        </tr>
                                    )}
                                </For>
                            </tbody>
                        </table>
                    </div>
                </Show>
            </div>

            {/* Details Modal */}
            <Show when={selectedLog()}>
                <div class="modal modal-open">
                    <div class="modal-box w-11/12 max-w-2xl">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-lg font-bold">{t("settings.update_history.details_title")}</h3>
                            <button
                                type="button"
                                class="btn btn-sm btn-circle btn-ghost"
                                onClick={() => setSelectedLog(null)}
                            >
                                <X class="w-4 h-4" />
                            </button>
                        </div>

                        <div class="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <span class="font-medium">{t("settings.update_history.time")}: </span>
                                <span class="font-mono">{formatDate(selectedLog()!.timestamp)}</span>
                            </div>
                            <div>
                                <span class="font-medium">{t("settings.update_history.type")}: </span>
                                <span>{getOperationTypeText(selectedLog()!.operation_type)}</span>
                            </div>
                            <div>
                                <span class="font-medium">{t("settings.update_history.result")}: </span>
                                <span class={`badge gap-1 ${getStatusBgColor(selectedLog()!.operation_result)} ${getStatusColor(selectedLog()!.operation_result)}`}>
                                    {getStatusIcon(selectedLog()!.operation_result)} {getResultText(selectedLog()!.operation_result)}
                                </span>
                            </div>
                            <div>
                                <span class="font-medium">{t("settings.update_history.success_rate")}: </span>
                                <span>
                                    {selectedLog()!.success_count}/{selectedLog()!.total_count}
                                </span>
                            </div>
                        </div>

                        <div class="bg-base-300 p-4 max-h-64 overflow-y-auto rounded-lg">
                            <Show when={selectedLog()!.details.length > 0}>
                                <For each={selectedLog()!.details}>
                                    {(detail) => {
                                        // 尝试解析可能的包更新信息
                                        const isUpdateLine = detail.startsWith("Updating") || detail.startsWith("Updated") || detail.includes("更新");
                                        const isErrorLine = detail.includes("Error:") || detail.includes("错误:");
                                        
                                        return (
                                            <div 
                                                classList={{
                                                    "text-error": isErrorLine,
                                                    "text-info": isUpdateLine && !isErrorLine,
                                                    "py-1": true
                                                }}
                                            >
                                                {detail}
                                            </div>
                                        );
                                    }}
                                </For>
                            </Show>
                            <Show when={selectedLog()!.details.length === 0}>
                                <div class="text-center text-base-content/50 py-4">
                                    {t("settings.update_history.no_details")}
                                </div>
                            </Show>
                        </div>

                        <div class="modal-action">
                            <button
                                type="button"
                                class="btn btn-primary"
                                onClick={() => setSelectedLog(null)}
                            >
                                {t("buttons.close")}
                            </button>
                        </div>
                    </div>
                </div>
            </Show>
        </Card>
    );
}