import { createSignal, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ShieldCheck, KeyRound, Save } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import SettingsToggle from "../../common/SettingsToggle";
import Card from "../../common/Card";
import { t } from "../../../i18n";

export default function VirusTotalSettings() {
    const { settings, setVirusTotalSettings } = settingsStore;
    const [apiKey, setApiKey] = createSignal("");
    const [isLoading, setIsLoading] = createSignal(true);
    const [error, setError] = createSignal<string | null>(null);
    const [successMessage, setSuccessMessage] = createSignal<string | null>(null);

    const fetchApiKey = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const key = await invoke<string | null>("get_virustotal_api_key");
            setApiKey(key ?? "");
            if (key) {
                // If an API key is present, assume the user wants the feature enabled.
                if (!settings.virustotal.enabled) {
                    await setVirusTotalSettings({ enabled: true });
                }
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to fetch API key:", errorMsg);
            setError(t("settings.virustotal.loadError"));
        } finally {
            setIsLoading(false);
        }
    };

    const validateApiKey = (key: string): boolean => {
        // An empty string is valid, it just means no key is set.
        if (key === "") return true;
        // Must be exactly 64 lowercase hex characters.
        const isValid = /^[a-f0-9]{64}$/.test(key);
        return isValid;
    };

    const handleSave = async () => {
        setError(null);
        setSuccessMessage(null);

        if (!validateApiKey(apiKey())) {
            setError(t("settings.virustotal.invalidApiKey"));
            return;
        }

        try {
            await invoke("set_virustotal_api_key", { key: apiKey() });
            // Enable the feature if a valid API key is being saved.
            if (apiKey() && !settings.virustotal.enabled) {
                await setVirusTotalSettings({ enabled: true });
            }
            setSuccessMessage(t("settings.virustotal.saveSuccess"));
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to save API key:", errorMsg);
            setError(t("settings.virustotal.saveError"));
        }
    };

    onMount(() => {
        fetchApiKey();
    });

    return (
        <Card
            title={t("settings.virustotal.title")}
            icon={ShieldCheck}
            description={
                <span>
                    {t("settings.virustotal.description")}
                    <a href="https://www.virustotal.com/gui/my-apikey" target="_blank" class="link link-primary">VirusTotal website</a>.
                </span>
            }
            headerAction={
                    <SettingsToggle
                        checked={settings.virustotal.enabled}
                        onChange={async (checked) => await setVirusTotalSettings({ enabled: checked })}
                        disabled={!apiKey()}
                        showStatusLabel={true}
                    />
            }
        >
            <label class="label">
                <span class="label-text font-semibold flex items-center">
                    <KeyRound class="w-4 h-4 mr-2" />
                    {t("settings.virustotal.apiKey")}
                </span>
            </label>
            <div class="form-control w-full max-w-lg">

                <div class="join w-full">
                    <input
                        type="password"
                        placeholder={isLoading() ? t("settings.virustotal.loading") : t("settings.virustotal.apiKeyPlaceholder")}
                        class="input input-bordered join-item w-full bg-base-100"
                        value={apiKey()}
                        onInput={(e) => setApiKey(e.currentTarget.value)}
                        disabled={isLoading()}
                    />
                    <button class="btn btn-primary join-item" onClick={handleSave} disabled={isLoading()}>
                        <Save class="w-4 h-4 mr-1" />
                        {t("settings.virustotal.save")}
                    </button>
                </div>
            </div>

            <Show when={settings.virustotal.enabled}>
                <div class="divider"></div>
                <div class="space-y-4">
                    <div class="form-control">
                        <SettingsToggle
                            checked={settings.virustotal.autoScanOnInstall}
                            onChange={async (checked) => await setVirusTotalSettings({ autoScanOnInstall: checked })}
                            label={t("settings.virustotal.autoScanPackages")}
                        />
                    </div>
                </div>
            </Show>

            {error() && <div class="alert alert-error mt-4 text-sm">{error()}</div>}
            {successMessage() && <div class="alert alert-success mt-4 text-sm">{successMessage()}</div>}
        </Card>
    );
}