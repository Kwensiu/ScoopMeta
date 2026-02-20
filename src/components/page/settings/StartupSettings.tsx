import { createSignal, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Power } from "lucide-solid";
import SettingsToggle from "../../common/SettingsToggle";
import Card from "../../common/Card";
import { t } from "../../../i18n";
import settingsStore from "../../../stores/settings";

export default function StartupSettings() {
    const [isAutoStartEnabled, setIsAutoStartEnabled] = createSignal(false);
    const [isSilentStartupEnabled, setIsSilentStartupEnabled] = createSignal(false);
    const [isLoading, setIsLoading] = createSignal(true);
    const { setWindowSettings } = settingsStore;

    const fetchAutoStartStatus = async () => {
        setIsLoading(true);
        try {
            const [autoStartStatus, silentStartupStatus] = await Promise.all([
                invoke<boolean>("is_auto_start_enabled"),
                invoke<boolean>("is_silent_startup_enabled")
            ]);
            setIsAutoStartEnabled(autoStartStatus);
            setIsSilentStartupEnabled(silentStartupStatus);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to fetch auto-start status:", errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleAutoStart = async () => {
        try {
            const newState = !isAutoStartEnabled();
            await invoke("set_auto_start_enabled", { enabled: newState });
            setIsAutoStartEnabled(newState);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to toggle auto-start:", errorMsg);
        }
    };

    const toggleSilentStartup = async () => {
        try {
            const newState = !isSilentStartupEnabled();
            await invoke("set_silent_startup_enabled", { enabled: newState });
            setIsSilentStartupEnabled(newState);
            await setWindowSettings({ silentStartup: newState });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to toggle silent startup:", errorMsg);
        }
    };

    onMount(() => {
        fetchAutoStartStatus();
    });

    return (
        <Card
            title={t("settings.startup.title")}
            icon={Power}
            description={t("settings.startup.description")}
            headerAction={
                <SettingsToggle
                    checked={isAutoStartEnabled()}
                    onChange={toggleAutoStart}
                    disabled={isLoading()}
                    showStatusLabel={true}
                />
            }
        >
            <Show when={isAutoStartEnabled()}>
                <div class="divider my-4"></div>
                <div class="flex items-center justify-between">
                    <div class="flex flex-col">
                        <span class="text-sm font-medium">{t("settings.startup.silentStartup.title")}</span>
                        <span class="text-[11px] text-base-content/60">{t("settings.startup.silentStartup.description")}</span>
                    </div>
                    <label class="label cursor-pointer">
                        <input
                            type="checkbox"
                            class="toggle toggle-primary"
                            checked={isSilentStartupEnabled()}
                            onChange={async () => {
                                await toggleSilentStartup();
                            }}
                        />
                    </label>
                </div>
            </Show>
        </Card>
    );
}