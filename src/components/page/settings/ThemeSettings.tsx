import { Sun, Moon } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import Card from "../../common/Card";
import { t } from "../../../i18n";

function ThemeSettings() {
    const { settings, setTheme } = settingsStore;

    return (
        <Card
            title={t("settings.theme.title")}
            icon={settings.theme === 'dark' ? Moon : Sun}
            description={t("settings.theme.description")}
            headerAction={
                <select
                    class="select select-bordered select-sm min-w-[140px]"
                    value={settings.theme}
                    onChange={(e) => {
                        const newTheme = e.target.value;
                        if (newTheme !== settings.theme) {
                            setTheme(newTheme as 'light' | 'dark');
                        }
                    }}
                >
                    <option value="light">{t("settings.theme.lightMode")}</option>
                    <option value="dark">{t("settings.theme.darkMode")}</option>
                </select>
            }
        />
    );
}

export default ThemeSettings;
