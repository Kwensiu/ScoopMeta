import { Home } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import Card from "../../common/Card";
import { View } from "../../../types/scoop";
import { t } from "../../../i18n";
import { createMemo } from "solid-js";

function DefaultLaunchPageSettings() {
    const { settings, setDefaultLaunchPage } = settingsStore;

    const pages = createMemo<{ value: View; label: string }[]>(() => [
        { value: "search", label: t("settings.defaultLaunchPage.search") },
        { value: "bucket", label: t("settings.defaultLaunchPage.buckets") },
        { value: "installed", label: t("settings.defaultLaunchPage.installed") },
        { value: "doctor", label: t("settings.defaultLaunchPage.doctor") },
        { value: "settings", label: t("settings.defaultLaunchPage.settings") },
    ]);

    const handlePageChange = async (e: Event) => {
        const target = e.currentTarget as HTMLSelectElement;
        await setDefaultLaunchPage(target.value as View);
    };

    return (
        <Card
            title={t("settings.defaultLaunchPage.title")}
            icon={Home}
            description={t("settings.defaultLaunchPage.description")}
            headerAction={
                <label class="label cursor-pointer gap-3">
                    <select
                        class="select select-bordered select-outline select-sm min-w-[140px]"
                        value={settings.defaultLaunchPage || "search"}
                        onChange={handlePageChange}
                    >
                        {pages().map((page) => (
                            <option value={page.value}>{page.label}</option>
                        ))}
                    </select>
                </label>
            }
        />
    );
}

export default DefaultLaunchPageSettings;
