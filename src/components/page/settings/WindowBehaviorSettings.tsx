import { createSignal, onMount, For, Show, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Monitor, ChevronUp, ChevronDown, X, Settings } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import SettingsToggle from "../../common/SettingsToggle";
import Modal from "../../common/Modal";
import Card from "../../common/Card";
import { t } from "../../../i18n";

interface ScoopApp {
    name: string;
    display_name: string;
}

function WindowBehaviorSettings() {
    const { settings, setWindowSettings } = settingsStore;
    const [isSaving, setIsSaving] = createSignal(false);
    const [availableApps, setAvailableApps] = createSignal<ScoopApp[]>([]);
    const [selectedApps, setSelectedApps] = createSignal<ScoopApp[]>([]);
    const [isLoadingApps, setIsLoadingApps] = createSignal(false);
    const [isTrayAppsModalOpen, setIsTrayAppsModalOpen] = createSignal(false);
    const [saveTimeoutId, setSaveTimeoutId] = createSignal<number | null>(null);

    // Memoize available apps to avoid recalculating on every render
    const getAvailableApps = createMemo(() => {
        const selectedNames = selectedApps().map(app => app.name);
        return availableApps().filter(app => !selectedNames.includes(app.name));
    });

    // Load settings from the persistent store on mount
    onMount(async () => {
        try {
            const closeToTray = await invoke<boolean>("get_config_value", {
                key: "window.closeToTray"
            });
            const firstTrayNotificationShown = await invoke<boolean>("get_config_value", {
                key: "window.firstTrayNotificationShown"
            });

            if (closeToTray !== null || firstTrayNotificationShown !== null) {
                setWindowSettings({
                    closeToTray: closeToTray ?? true,
                    firstTrayNotificationShown: firstTrayNotificationShown ?? false,
                });
            }
        } catch (error) {
            console.error("Failed to load window settings:", error);
        }

        // Load tray apps
        loadTrayApps();
    });

    const loadTrayApps = async () => {
        setIsLoadingApps(true);
        try {
            // Get all available Scoop apps with type validation
            const appsData = await invoke("get_scoop_app_shortcuts");
            let apps: ScoopApp[] = [];
            if (Array.isArray(appsData)) {
                apps = appsData
                    .filter((item: any) =>
                        item &&
                        typeof item === 'object' &&
                        typeof item.name === 'string' &&
                        typeof item.display_name === 'string' &&
                        item.name.trim() &&
                        item.display_name.trim()
                    )
                    .map((item: any) => ({
                        name: item.name.trim(),
                        display_name: item.display_name.trim()
                    }));
            } else {
                console.warn("get_scoop_app_shortcuts returned non-array:", appsData);
            }
            setAvailableApps(apps);

            // Get currently configured tray apps with type validation
            const configuredAppNames = await invoke("get_config_value", {
                key: "tray.appsList"
            });

            if (Array.isArray(configuredAppNames) &&
                configuredAppNames.every(name => typeof name === 'string')) {
                const validNames = configuredAppNames.filter(name =>
                    typeof name === 'string' && name.trim()
                );
                const selected = apps.filter(app => validNames.includes(app.name));
                setSelectedApps(selected);
            } else if (configuredAppNames !== null && configuredAppNames !== undefined) {
                console.warn("Invalid tray.appsList configuration:", configuredAppNames);
            }
        } catch (error) {
            console.error("Failed to load tray apps:", error);
        } finally {
            setIsLoadingApps(false);
        }
    };

    const handleCloseToTrayChange = async (enabled: boolean) => {
        setIsSaving(true);
        try {
            await invoke("set_config_value", {
                key: "window.closeToTray",
                value: enabled
            });
            await setWindowSettings({ closeToTray: enabled });
        } catch (error) {
            console.error("Failed to save close to tray setting:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleTrayAppsEnabledChange = async (enabled: boolean) => {
        try {
            await invoke("set_config_value", {
                key: "settings.window.trayAppsEnabled",
                value: enabled
            });
            await setWindowSettings({ trayAppsEnabled: enabled });
        } catch (error) {
            console.error("Failed to save tray apps enabled setting:", error);
        }
    };

    const addApp = (app: ScoopApp) => {
        if (!selectedApps().find(a => a.name === app.name)) {
            const newSelected = [...selectedApps(), app];
            setSelectedApps(newSelected);
            saveSelectedApps(newSelected);
        }
    };

    const removeApp = (appName: string) => {
        const newSelected = selectedApps().filter(app => app.name !== appName);
        setSelectedApps(newSelected);
        saveSelectedApps(newSelected);
    };

    const moveAppUp = (index: number) => {
        if (index > 0) {
            const apps = [...selectedApps()];
            [apps[index - 1], apps[index]] = [apps[index], apps[index - 1]];
            setSelectedApps(apps);
            saveSelectedApps(apps);
        }
    };

    const moveAppDown = (index: number) => {
        const apps = [...selectedApps()];
        if (index < apps.length - 1) {
            [apps[index], apps[index + 1]] = [apps[index + 1], apps[index]];
            setSelectedApps(apps);
            saveSelectedApps(apps);
        }
    };

    const saveSelectedApps = async (apps: ScoopApp[]) => {
        // Clear any pending save operation
        const currentTimeoutId = saveTimeoutId();
        if (currentTimeoutId !== null) {
            clearTimeout(currentTimeoutId);
            setSaveTimeoutId(null);
        }

        // Debounce saves to prevent rapid consecutive calls
        const timeoutId = setTimeout(async () => {
            setSaveTimeoutId(null);

            // Use current state at save time for proper rollback
            const currentStateAtSave = [...selectedApps()];

            try {
                const appNames = apps.map(app => app.name);
                await invoke("set_config_value", {
                    key: "tray.appsList",
                    value: appNames
                });
                // Success - state is already updated in UI
            } catch (error) {
                console.error("Failed to save selected apps:", error);
                // Revert UI state to what it was when save started
                setSelectedApps(currentStateAtSave);
                // TODO: Show proper error notification instead of alert
                alert(`Failed to save tray apps: ${error}`);
            }
        }, 300); // 300ms debounce

        setSaveTimeoutId(timeoutId as any);
    };

    return (
        <Card
            title={t("settings.windowBehavior.title")}
            icon={Monitor}
            description={t("settings.windowBehavior.description")}
            headerAction={
                <SettingsToggle
                    checked={settings.window.closeToTray}
                    onChange={(checked) => handleCloseToTrayChange(checked)}
                    disabled={isSaving()}
                    showStatusLabel={true}
                />
            }
        >
            <div class="space-y-6 mt-4">
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <h4 class="font-medium text-base-content ">{t("settings.trayApps.manageContextMenu")}</h4>
                        <p class="text-sm text-base-content/70">{t("settings.trayApps.manageTrayAppsDescription")}</p>
                    </div>
                    <button
                        class="btn btn-outline btn-sm"
                        onClick={() => setIsTrayAppsModalOpen(true)}
                    >
                        <Settings size={16} />
                        {t("settings.trayApps.configure")}
                    </button>
                </div>
            </div>

            {/* Tray Apps Modal */}
            <Modal
                isOpen={isTrayAppsModalOpen()}
                onClose={() => setIsTrayAppsModalOpen(false)}
                title={t("settings.trayApps.title")}
                size="large"
            >
                <div class="space-y-6">
                    {/* Enable Tray Apps Toggle */}
                    <div class="flex items-center justify-between p-4 bg-base-200 rounded-lg">
                        <div class="flex-1">
                            <h4 class="font-medium text-base-content">{t("settings.trayApps.enableTrayApps")}</h4>
                            <p class="text-sm text-base-content/70">{t("settings.trayApps.enableTrayAppsDescription")}</p>
                        </div>
                        <SettingsToggle
                            checked={settings.window.trayAppsEnabled}
                            onChange={(checked) => handleTrayAppsEnabledChange(checked)}
                            disabled={false}
                            showStatusLabel={true}
                        />
                    </div>

                    {/* Apps Management Section */}
                    <Show when={!isLoadingApps()} fallback={<div>{t("loading")}</div>}>
                        {/* Selected Apps */}
                        <div class="mb-6">
                            <h5 class="text-lg font-medium text-base-content mb-3">{t("settings.trayApps.selectedApps")}</h5>
                            <div class="space-y-3">
                                <For each={selectedApps()}>
                                    {(app, index) => (
                                        <div class="flex items-center gap-3 p-3 bg-base-100 rounded-lg border">
                                            <button
                                                class="btn btn-sm btn-square btn-ghost"
                                                onClick={() => moveAppUp(index())}
                                                disabled={index() === 0}
                                            >
                                                <ChevronUp size={18} />
                                            </button>
                                            <button
                                                class="btn btn-sm btn-square btn-ghost"
                                                onClick={() => moveAppDown(index())}
                                                disabled={index() === selectedApps().length - 1}
                                            >
                                                <ChevronDown size={18} />
                                            </button>
                                            <span class="flex-1 text-base font-medium">{app.display_name}</span>
                                            <button
                                                class="btn btn-sm btn-square btn-ghost text-error"
                                                onClick={() => removeApp(app.name)}
                                            >
                                                <X size={18} />
                                            </button>
                                        </div>
                                    )}
                                </For>
                                <Show when={selectedApps().length === 0}>
                                    <p class="text-base text-base-content/50 italic p-3 bg-base-100 rounded-lg border">
                                        {t("settings.trayApps.noSelectedApps")}
                                    </p>
                                </Show>
                            </div>
                        </div>

                        {/* Available Apps */}
                        <div>
                            <h5 class="text-lg font-medium text-base-content mb-3">{t("settings.trayApps.availableApps")}</h5>
                            <div class="flex flex-wrap gap-3">
                                <For each={getAvailableApps()}>
                                    {(app) => (
                                        <button
                                            class="btn btn-outline h-auto py-2 px-3 text-left justify-start w-auto min-w-fit"
                                            onClick={() => addApp(app)}
                                        >
                                            <span class="text-sm whitespace-nowrap">{app.display_name}</span>
                                        </button>
                                    )}
                                </For>
                            </div>
                            <Show when={getAvailableApps().length === 0}>
                                <p class="text-base text-base-content/50 italic p-3 bg-base-100 rounded-lg border">
                                    {t("settings.trayApps.noAvailableApps")}
                                </p>
                            </Show>
                        </div>
                    </Show>
                </div>
            </Modal>
        </Card>
    );
}

export default WindowBehaviorSettings;