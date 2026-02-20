import { Eye, EyeOff } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import SettingsToggle from "../../common/SettingsToggle";
import Card from "../../common/Card";
import { t } from "../../../i18n";


// 暂时只用“Update All”按钮的显示控制

function UISettings() {
    const { settings, setUISettings } = settingsStore;

    const handleShowGlobalUpdateButtonChange = async (enabled: boolean) => {
        await setUISettings({ showGlobalUpdateButton: enabled });
    };

    return (
        <Card
            title={t("settings.ui.UDABottonTitle")}
            icon={settings.ui.showGlobalUpdateButton ? Eye : EyeOff}
            description={t("settings.ui.UDABottonDescription")}
            headerAction={
                <SettingsToggle
                    checked={settings.ui.showGlobalUpdateButton}
                    onChange={(checked) => handleShowGlobalUpdateButtonChange(checked)}
                    showStatusLabel={true}
                />
            }
        >
        </Card>
    );
}

export default UISettings;