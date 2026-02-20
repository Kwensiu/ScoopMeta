import { createSignal, Show } from "solid-js";
import { Recycle, Sparkles } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import SettingsToggle from "../../common/SettingsToggle";
import Card from "../../common/Card";
import { t } from "../../../i18n";

function AutoCleanupSettings() {
    const { settings, setCleanupSettings } = settingsStore;
    const [localVersionCount, setLocalVersionCount] = createSignal(settings.cleanup.preserveVersionCount);

    const handleVersionCountChange = async (e: Event) => {
        const value = parseInt((e.target as HTMLInputElement).value);
        setLocalVersionCount(value);
        if (value >= 1 && value <= 10) {
            await setCleanupSettings({ preserveVersionCount: value });
        }
    };

    return (
        <Card
            title={t("settings.autoCleanup.title")}
            icon={Recycle}
            description={t("settings.autoCleanup.description")}
            headerAction={
                <SettingsToggle
                    checked={settings.cleanup.autoCleanupEnabled}
                    onChange={async (checked) => await setCleanupSettings({ autoCleanupEnabled: checked })}
                    showStatusLabel={true}
                    className="gap-3"
                />
            }
        >
            <Show when={settings.cleanup.autoCleanupEnabled}>
                <div class="space-y-6">
                    {/* Old Versions Section */}
                    <div class="bg-base-300/60 rounded-lg p-4 border border-base-content/50">
                        <div class="flex items-start justify-between">
                            <div class="flex-1">
                                <h3 class="font-medium flex items-center text-sm">
                                    <Sparkles class="w-4 h-4 mr-2 text-primary" />
                                    {t("settings.autoCleanup.cleanOldVersions")}
                                </h3>
                                <p class="text-xs mt-1 text-base-content/60">
                                    {t("settings.autoCleanup.cleanOldVersionsDescription")}
                                </p>
                            </div>
                            <input
                                type="checkbox"
                                class="toggle toggle-primary"
                                checked={settings.cleanup.cleanupOldVersions}
                                onChange={async (e) => await setCleanupSettings({ cleanupOldVersions: e.currentTarget.checked })}
                            />
                        </div>

                        <Show when={settings.cleanup.cleanupOldVersions}>
                            <div class="mt-4">
                                <label for="preserveVersionCount" class="block text-xs font-semibold mb-2">
                                    {t("settings.autoCleanup.versionsToKeep", { count: localVersionCount() })}
                                </label>
                                <input
                                    type="range"
                                    id="preserveVersionCount"
                                    min="1"
                                    max="10"
                                    value={localVersionCount()}
                                    onInput={handleVersionCountChange}
                                    class="range range-primary"
                                />
                            </div>
                        </Show>
                    </div>

                    {/* Cache Section */}
                    <div class="bg-base-300/60 rounded-lg p-4 border border-base-content/50">
                        <div class="flex items-start justify-between">
                            <div class="flex-1">
                                <h3 class="font-medium text-sm">{t("settings.autoCleanup.cleanOutdatedCache")}</h3>
                                <p class="text-xs mt-1 text-base-content/60">
                                    {t("settings.autoCleanup.cleanOutdatedCacheDescription")}
                                </p>
                            </div>
                            <input
                                type="checkbox"
                                class="toggle toggle-primary"
                                checked={settings.cleanup.cleanupCache}
                                onChange={async (e) => await setCleanupSettings({ cleanupCache: e.currentTarget.checked })}
                            />
                        </div>
                    </div>
                </div>
            </Show>
        </Card>
    );
}

export default AutoCleanupSettings;