import { createSignal, onMount, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Monitor } from "lucide-solid";
import Card from "../../common/Card";
import { t } from "../../../i18n";

interface ScoopApp {
    name: string;
    display_name: string;
}

function TrayAppsSettings() {
    const [availableApps, setAvailableApps] = createSignal<ScoopApp[]>([]);
    const [selectedApps, setSelectedApps] = createSignal<string[]>([]);
    const [isLoading, setIsLoading] = createSignal(false);
    const [isSaving, setIsSaving] = createSignal(false);

    // Load available apps and current settings
    onMount(async () => {
        setIsLoading(true);
        try {
            // Get all available Scoop apps
            const appsData = await invoke<any[]>("get_scoop_app_shortcuts");
            const apps: ScoopApp[] = appsData.map(item => ({
                name: item.name,
                display_name: item.display_name
            }));
            setAvailableApps(apps);

            // Get currently configured tray apps
            const configuredApps = await invoke<string[]>("get_config_value", {
                key: "tray.appsList"
            });

            if (configuredApps && Array.isArray(configuredApps)) {
                setSelectedApps(configuredApps);
            }
        } catch (error) {
            console.error("Failed to load tray apps settings:", error);
        } finally {
            setIsLoading(false);
        }
    });

    const handleAppToggle = async (appName: string, enabled: boolean) => {
        const currentSelected = selectedApps();
        let newSelected: string[];

        if (enabled) {
            newSelected = [...currentSelected, appName];
        } else {
            newSelected = currentSelected.filter(name => name !== appName);
        }

        setSelectedApps(newSelected);

        // Save to backend
        setIsSaving(true);
        try {
            await invoke("set_config_value", {
                key: "tray.appsList",
                value: newSelected
            });
        } catch (error) {
            console.error("Failed to save tray apps setting:", error);
            // Revert on error
            setSelectedApps(currentSelected);
        } finally {
            setIsSaving(false);
        }
    };

    const isAppSelected = (appName: string) => selectedApps().includes(appName);

    return (
        <Card
            title={t("settings.trayApps.title")}
            icon={Monitor}
            description={t("settings.trayApps.description")}
        >
            <Show when={!isLoading()} fallback={<div>{t("loading")}</div>}>
                <div class="space-y-3">
                    <p class="text-sm text-base-content/70 mb-4">
                        {t("settings.trayApps.helpText")}
                    </p>

                    <Show when={availableApps().length === 0} fallback={
                        <div class="grid gap-2">
                            <For each={availableApps()}>
                                {(app) => (
                                    <label class="flex items-center space-x-3 p-3 rounded-lg border border-base-300 hover:bg-base-100 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={isAppSelected(app.name)}
                                            onChange={(e) => handleAppToggle(app.name, e.target.checked)}
                                            disabled={isSaving()}
                                            class="checkbox checkbox-primary"
                                        />
                                        <div class="flex-1">
                                            <div class="font-medium">{app.display_name}</div>
                                            <div class="text-sm text-base-content/60">{app.name}</div>
                                        </div>
                                    </label>
                                )}
                            </For>
                        </div>
                    }>
                        <p class="text-sm text-base-content/50">
                            {t("settings.trayApps.noAppsFound")}
                        </p>
                    </Show>

                    <Show when={selectedApps().length > 0}>
                        <div class="mt-4 p-3 bg-info/10 rounded-lg border border-info/20">
                            <p class="text-sm font-medium text-info mb-2">
                                {t("settings.trayApps.selectedCount", { count: selectedApps().length })}
                            </p>
                            <div class="flex flex-wrap gap-2">
                                <For each={selectedApps()}>
                                    {(appName) => {
                                        const app = availableApps().find(a => a.name === appName);
                                        return (
                                            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-info/20 text-info">
                                                {app?.display_name || appName}
                                            </span>
                                        );
                                    }}
                                </For>
                            </div>
                        </div>
                    </Show>
                </div>
            </Show>
        </Card>
    );
}

export default TrayAppsSettings;
