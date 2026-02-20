import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Globe } from "lucide-solid";
import Card from "../../common/Card";
import { t } from "../../../i18n";

function ScoopProxySettings() {
    const [proxyValue, setProxyValue] = createSignal("");
    const [isLoading, setIsLoading] = createSignal(true);
    const [isSaving, setIsSaving] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [successMessage, setSuccessMessage] = createSignal<string | null>(null);

    // Load proxy setting from Scoop config on mount
    onMount(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const proxy = await invoke<string | null>("get_scoop_proxy");
            setProxyValue(proxy ?? "");
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to fetch scoop proxy:", errorMsg);
            setError(t('doctor.proxySettings.loadError'));
        } finally {
            setIsLoading(false);
        }
    });

    const saveProxySetting = async (proxy: string, successMsg: string) => {
        setIsSaving(true);
        setError(null);
        setSuccessMessage(null);
        try {
            await invoke("set_scoop_proxy", { proxy });
            setSuccessMessage(successMsg);
            setTimeout(() => setSuccessMessage(null), 5000);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to save scoop proxy:", errorMsg);
            setError(`${t('doctor.proxySettings.saveError')} ${errorMsg}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveProxy = async () => {
        await saveProxySetting(proxyValue(), t('doctor.proxySettings.saveSuccess'));
    };

    const handleClearProxy = async () => {
        setProxyValue("");
        await saveProxySetting("", t('doctor.proxySettings.clearSuccess'));
    };

    return (
        <Card
            title={t('doctor.proxySettings.title')}
            icon={Globe}
            description={t('doctor.proxySettings.description')}
        >
            <div class="form-control w-full max-w-lg">
                <label class="label">
                    <span class="label-text font-semibold">
                        {t('doctor.proxySettings.proxyAddress')}
                    </span>
                </label>

                <div class="mt-2">
                    <div class="join w-full">
                        <input
                            type="text"
                            placeholder={isLoading() ? t('doctor.proxySettings.loading') : t('doctor.proxySettings.proxyPlaceholder')}
                            class="input input-bordered join-item flex-1 min-w-70"
                            value={proxyValue()}
                            onInput={(e) => setProxyValue(e.currentTarget.value)}
                            disabled={isLoading() || isSaving()}
                        />
                        <button
                            class="btn btn-primary join-item"
                            onClick={handleSaveProxy}
                            disabled={isLoading() || isSaving()}
                        >
                            {t('doctor.proxySettings.save')}
                        </button>
                        <button
                            class="btn join-item bg-orange-500 hover:bg-orange-600 border-none"
                            onClick={handleClearProxy}
                            disabled={isLoading() || isSaving() || !proxyValue()}
                        >
                            {t('doctor.proxySettings.clear')}
                        </button>
                    </div>
                </div>

                {error() && <div class="alert alert-error mt-4 text-sm">{error()}</div>}
                {successMessage() && <div class="alert alert-success mt-4 text-sm">{successMessage()}</div>}
            </div>
        </Card>
    );
}

export default ScoopProxySettings;