import { createSignal, onMount, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import OperationModal from "../components/OperationModal";
import ScoopConfiguration from "../components/page/settings/ScoopConfiguration";
import StartupSettings from "../components/page/settings/StartupSettings";
import VirusTotalSettings from "../components/page/settings/VirusTotalSettings";
import HeldPackagesManagement from "../components/page/settings/HeldPackagesManagement";
import AboutSection, { AboutSectionRef } from "../components/page/settings/AboutSection";
import DebugSettings from "../components/page/settings/DebugSettings";
import AutoCleanupSettings from "../components/page/settings/AutoCleanupSettings";
import BucketAutoUpdateSettings from "../components/page/settings/BucketAutoUpdateSettings";
import WindowBehaviorSettings from "../components/page/settings/WindowBehaviorSettings";
import ThemeSettings from "../components/page/settings/ThemeSettings";
import DefaultLaunchPageSettings from "../components/page/settings/DefaultLaunchPageSettings";
import AppDataManagement from "../components/page/settings/AppDataManagement";
import heldStore from "../stores/held";
import { t } from "../i18n";
import { createStoredSignal } from "../hooks/createStoredSignal";

interface SettingsPageProps {
    activeSection: string;
    onSectionChange: (section: string) => void;
    isScoopInstalled?: boolean;
}

function SettingsPage(props: SettingsPageProps) {
    const { refetch: refetchHeldPackages } = heldStore;
    const [operationTitle, setOperationTitle] = createSignal<string | null>(null);
    const [isUnholding, setIsUnholding] = createSignal(false);
    let aboutSectionRef: AboutSectionRef | undefined;

    const TABS = [
        { key: 'automation', labelkey: "settings.category.automation" },
        { key: 'management', labelkey: "settings.category.management" },
        { key: 'security', labelkey: "settings.category.security" },
        { key: 'window', labelkey: "settings.category.window_ui" },
        { key: 'about', labelkey: "settings.category.about" },
    ];
    const [activeTab, setActiveTab] = createStoredSignal<string>('settingsActiveTab', 'automation');

    onMount(() => {
        // Preload update info silently
        aboutSectionRef?.checkForUpdates(false);
    });

    const handleUnhold = (packageName: string) => {
        setIsUnholding(true);
        invoke("unhold_package", { packageName }).finally(() => {
            refetchHeldPackages();
            setIsUnholding(false);
        });
    };

    const handleCloseOperationModal = () => {
        setOperationTitle(null);
    };

    return (
        <>
            <div class="p-6">
                <h1 class="text-3xl font-bold mb-4">{t("settings.title")}</h1>
                {/* Tab Navigation */}
                <div role="tablist" aria-label="Settings Sections" class="tabs tabs-border mb-6">
                    <For each={TABS}>
                        {(tab) => (
                            <a
                                class="tab"
                                classList={{ 'tab-active': activeTab() === tab.key }}
                                onClick={() => setActiveTab(tab.key)}
                                role="tab"
                                aria-selected={activeTab() === tab.key}
                            >
                                {t(tab.labelkey)}
                            </a>
                        )}
                    </For>
                </div>

                <div class="space-y-6">
                    {/* Automation Tab */}
                    <Show when={activeTab() === 'automation'}>
                        <div class="space-y-8">
                            <AutoCleanupSettings />
                            <BucketAutoUpdateSettings />
                        </div>
                    </Show>

                    {/* Management Tab */}
                    <Show when={activeTab() === 'management'}>
                        <div class="space-y-8">
                            <ScoopConfiguration />

                            <HeldPackagesManagement
                                onUnhold={handleUnhold}
                                operationInProgress={!!operationTitle() || isUnholding()}
                            />
                        </div>
                    </Show>

                    {/* Security Tab */}
                    <Show when={activeTab() === 'security'}>
                        <div class="space-y-8">
                            <VirusTotalSettings />
                        </div>
                    </Show>

                    {/* Window & UI Tab */}
                    <Show when={activeTab() === 'window'}>
                        <div class="space-y-8">
                            <ThemeSettings />
                            <WindowBehaviorSettings />
                            <StartupSettings />
                            <DefaultLaunchPageSettings />
                            <DebugSettings />
                        </div>
                    </Show>

                    {/* About Tab */}
                    <Show when={activeTab() === 'about'}>
                        <AboutSection
                            ref={(r) => (aboutSectionRef = r)}
                            isScoopInstalled={props.isScoopInstalled}
                        />
                                                    <AppDataManagement />
                    </Show>
                </div>
            </div>
            <OperationModal
                title={operationTitle()}
                onClose={handleCloseOperationModal}
            />
        </>
    );
}

export default SettingsPage;