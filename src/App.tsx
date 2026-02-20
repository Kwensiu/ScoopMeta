import { createSignal, Show, onMount, createMemo, createEffect, onCleanup, For } from "solid-js";
import "./App.css";
import "./i18n";
import "./styles/minimized-indicator.css";
import Header from "./components/Header.tsx";
import SearchPage from "./pages/SearchPage.tsx";
import BucketPage from "./pages/BucketPage.tsx";
import InstalledPage from "./pages/InstalledPage.tsx";
import { View } from "./types/scoop";
import type { OperationState } from "./types/operations";
import SettingsPage from "./pages/SettingsPage.tsx";
import DoctorPage from "./pages/DoctorPage.tsx";
import DebugModal from "./components/DebugModal.tsx";
import MinimizedIndicatorManager from "./components/MinimizedIndicatorManager.tsx";
import MultiInstanceWarning from "./components/MultiInstanceWarning.tsx";
import AnimatedButton from "./components/AnimatedButton";
import OperationModal from "./components/OperationModal.tsx";
import { listen } from "@tauri-apps/api/event";
import { info, error as logError } from "@tauri-apps/plugin-log";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import installedPackagesStore from "./stores/installedPackagesStore";
import settingsStore from "./stores/settings";
import { checkCwdMismatch } from "./utils/installCheck";
import { BucketInfo, updateBucketsCache } from "./hooks/useBuckets";
import { usePackageOperations } from "./hooks/usePackageOperations";
import { useOperations } from "./stores/operations";
import { t } from "./i18n";

function App() {
    const { settings } = settingsStore;

    // Persist selected view across sessions.
    const [view, setView] = createSignal<View>(settings.defaultLaunchPage);

    const packageOperations = usePackageOperations();
    const { operations, removeOperation } = useOperations();

    // Always start with false on app launch to ensure loading screen shows
    const [readyFlag, setReadyFlag] = createSignal<"true" | "false">("false");

    // Track if the app is installed via Scoop
    const [isScoopInstalled, setIsScoopInstalled] = createSignal<boolean>(false);

    const isReady = createMemo(() => readyFlag() === "true");

    const [error, setError] = createSignal<string | null>(null);
    const [update, setUpdate] = createSignal<Update | null>(null);
    const [isInstalling, setIsInstalling] = createSignal(false);

    // Track if there's a CWD mismatch (MSI installation issue)
    const [hasCwdMismatch, setHasCwdMismatch] = createSignal(false);

    // Dev mode: allow bypassing the MSI modal for this session
    const [bypassCwdMismatch, setBypassCwdMismatch] = createSignal(false);

    // Track initialization timeout
    const [initTimedOut, setInitTimedOut] = createSignal(false);

    // Auto-update modal state
    const [autoUpdateTitle, setAutoUpdateTitle] = createSignal<string | null>(null);

    createEffect(() => {
        document.documentElement.setAttribute('data-theme', settings.theme);
    });

        // Debug: track state changes (only in development)
    if (process.env.NODE_ENV === 'development') {
        createEffect(() => {
            console.log("App State Debug:", {
                "readyFlag": readyFlag(),
                "isReady": isReady(),
                "hasCwdMismatch": hasCwdMismatch(),
                "bypassCwdMismatch": bypassCwdMismatch(),
                "error": error(),
                "isScoopInstalled": isScoopInstalled(),
                "initTimedOut": initTimedOut()
            });
        });
    }

    const handleInstallUpdate = async () => {
        if (!update()) return;
        setIsInstalling(true);
        try {
            await update()!.downloadAndInstall();
            await relaunch();
        } catch (e) {
            console.error("Failed to install update", e);
            setError("Failed to install the update. Please try restarting the application.");
            setIsInstalling(false);
        }
    };

    const handleCloseApp = async () => {
        try {
            await invoke("close_app");
        } catch (e) {
            console.error("Failed to close app:", e);
        }
    };

    const handleUpdateAll = () => {
        return packageOperations.handleUpdateAll();
    };

    const handleCloseAutoUpdateModal = (wasSuccess: boolean) => {
        setAutoUpdateTitle(null);
        if (wasSuccess) {
            // Refresh installed packages after auto-update
            installedPackagesStore.refetch();
        }
    };

    onMount(async () => {
        // Setup event listeners FIRST so early backend emits are captured
        const setupColdStartListeners = async () => {
            const webview = getCurrentWebviewWindow();
            const unlistenFunctions: (() => void)[] = [];

            // Listen for auto-update start events
            try {
                const unlisten = await listen<string>("auto-operation-start", (event) => {
                    info(`Auto-operation started: ${event.payload}`);
                    // 检查是否启用了静默自动更新
                    if (!settings.buckets.silentUpdateEnabled) {
                        setAutoUpdateTitle(event.payload);
                    }
                });
                unlistenFunctions.push(unlisten);
            } catch (e) {
                logError(`Failed to register auto-operation-start listener: ${e}`);
            }

            // Listen for window-specific cold-start-finished event
            try {
                const unlisten1 = await webview.listen<boolean>("cold-start-finished", (event) => {
                    info(`Received window-specific cold-start-finished event with payload: ${event.payload}`);
                    handleColdStartEvent(event.payload);
                });
                unlistenFunctions.push(unlisten1);
            } catch (e) {
                logError(`Failed to register window-specific cold-start-finished listener: ${e}`);
            }

            // Listen for global cold-start-finished event as fallback
            try {
                const unlisten2 = await listen<boolean>("cold-start-finished", (event) => {
                    info(`Received global cold-start-finished event with payload: ${event.payload}`);
                    handleColdStartEvent(event.payload);
                });
                unlistenFunctions.push(unlisten2);
            } catch (e) {
                logError(`Failed to register global cold-start-finished listener: ${e}`);
            }

            // Listen for window-specific scoop-ready event
            try {
                const unlisten3 = await webview.listen<boolean>("scoop-ready", (event) => {
                    info(`Received window-specific scoop-ready event with payload: ${event.payload}`);
                    handleColdStartEvent(event.payload);
                });
                unlistenFunctions.push(unlisten3);
            } catch (e) {
                logError(`Failed to register window-specific scoop-ready listener: ${e}`);
            }

            // Listen for global scoop-ready event as fallback
            try {
                const unlisten4 = await listen<boolean>("scoop-ready", (event) => {
                    info(`Received global scoop-ready event with payload: ${event.payload}`);
                    handleColdStartEvent(event.payload);
                });
                unlistenFunctions.push(unlisten4);
            } catch (e) {
                logError(`Failed to register global scoop-ready listener: ${e}`);
            }

            return () => {
                // Cleanup all listeners on unmount
                unlistenFunctions.forEach(unlisten => unlisten());
            };
        };

        // Store cleanup function to be called when component unmounts
        let cleanupFunction: (() => void) | null = null;

        onCleanup(() => {
            if (cleanupFunction) {
                cleanupFunction();
            }
        });

        cleanupFunction = await setupColdStartListeners();

        // After listeners are in place, perform fast local checks (no network) sequentially
        let autoStartEnabled = false;
        try { autoStartEnabled = await invoke<boolean>("is_auto_start_enabled"); } catch (e) { console.warn("Failed to query auto-start status", e); }
        let isNewVersion = false;
        try { isNewVersion = await invoke<boolean>("check_and_update_version"); } catch (e) { console.warn("Failed to check/update version file", e); }
        try {
            const cwdMismatch = await checkCwdMismatch();
            if (cwdMismatch) {
                if (autoStartEnabled && !isNewVersion) {
                    info("CWD mismatch suppressed (auto-start, not new version)");
                    setHasCwdMismatch(false);
                } else {
                    setHasCwdMismatch(true);
                }
            } else {
                setHasCwdMismatch(false);
            }
            const scoopInstalled = await invoke<boolean>("is_scoop_installation");
            setIsScoopInstalled(scoopInstalled);
            if (scoopInstalled) {
                info("App is installed via Scoop. Auto-update disabled.");
            }
        } catch (e) {
            console.error("Failed during initial local startup checks", e);
        }

        // Deferred / concurrent update check logic (network) with timeout; triggered after ready event
        const triggerUpdateCheck = async () => {
            if (isScoopInstalled() || update()) return;
            const TIMEOUT_MS = 4000;
            let timedOut = false;
            const timeoutPromise = new Promise<null>(resolve => setTimeout(() => { timedOut = true; resolve(null); }, TIMEOUT_MS));
            try {
                info("Checking for application updates...");
                const result = await Promise.race([check(), timeoutPromise]);
                if (timedOut) {
                    info("Update check timed out; continuing without update info.");
                    return;
                }
                if (result) {
                    info(`Update ${result.version} is available.`);
                    setUpdate(result);
                } else {
                    info("Application is up to date.");
                }
            } catch (e) {
                console.error("Failed to check for updates", e);
            }
        };

        // Handle cold start event payload
        const handleColdStartEvent = (payload: boolean) => {
            if (!isReady() && !error()) {
                info(`Handling cold start event with payload: ${payload}`);
                console.log(`Handling cold start event with payload: ${payload}`);
                console.log(`Current state before event: ready=${isReady()}, error=${error()}`);
                // Only update if not already ready
                if (payload) {
                    info("Cold start ready event - triggering installed packages refetch");
                    console.log("Setting ready flag to true");
                    setReadyFlag("true");

                    // Set initial view to default launch page
                    setView(settings.defaultLaunchPage);

                    // Trigger refetch of installed packages to ensure we get the freshly prefetched data
                    // Use a small delay to ensure backend event is fully processed
                    setTimeout(() => {
                        info("Executing deferred refetch of installed packages");
                        installedPackagesStore.refetch()
                            .then(() => info("Refetch completed successfully"))
                            .catch(err => {
                                logError(`Failed to refetch installed packages on cold start: ${err}`);
                            });

                        // Fetch and cache buckets list after initialization
                        invoke<BucketInfo[]>("get_buckets")
                            .then((buckets) => {
                                if (buckets && buckets.length > 0) {
                                    console.log(`Preloaded ${buckets.length} buckets`);
                                    // Also update the buckets cache in the useBuckets hook
                                    updateBucketsCache(buckets);
                                }
                            })
                            .catch((err) => {
                                logError(`Failed to fetch buckets: ${err}`);
                                setError("Failed to load bucket list.");
                            });
                    }, 100);
                    // Kick off update check shortly after readiness if applicable
                    setTimeout(() => { triggerUpdateCheck(); }, 150);
                } else {
                    const errorMsg = "Scoop initialization failed. Please make sure Scoop is installed correctly and restart.";
                    setError(errorMsg);
                    setReadyFlag("false");
                    logError(errorMsg);
                }
            } else if (isReady()) {
                info(`Received cold start event with payload: ${payload} (already ready)`);
            }
        };

        // Force ready state after a timeout as a fallback
        const timeoutId = setTimeout(() => {
            if (!isReady() && !error()) {
                const timeoutMsg = "Initialization is taking longer than expected. This might be due to a slow system or Scoop configuration issue.";
                info(`Forcing ready state after timeout. ${timeoutMsg}`);
                console.log(`Forcing ready state after timeout. ${timeoutMsg}`);
                setInitTimedOut(true);
                setReadyFlag("true");
                // Ensure update check still runs even if events were missed
                triggerUpdateCheck();
            }
        }, 3000); // Further reduce timeout to 3 seconds for immediate display

        // Also set up an immediate fallback for white screen issues
        const immediateFallback = setTimeout(() => {
            console.log("Immediate fallback: Setting ready flag to true after 1 second");
            setReadyFlag("true");
        }, 1000);

        // Clean up on unmount
        return () => {
            clearTimeout(timeoutId);
            clearTimeout(immediateFallback);
            cleanupFunction();
        };
    });

    return (
        <>
            <Show when={hasCwdMismatch() && !bypassCwdMismatch()}>
                <div class="flex flex-col items-center justify-center h-screen bg-base-100 p-8 text-white">
                    <div class="alert outline-warning text-white shadow-lg max-w-lg">
                        <div class="flex flex-col gap-4 w-full">
                            <div class="flex items-start gap-3">
                                <svg class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M12 9v2m0 4v2m0 4v2M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2h-4m-6 0V3m0 0a2 2 0 012-2h0a2 2 0 012 2v0m0 0h4v4m0-4h0a2 2 0 00-2-2h0a2 2 0 00-2 2v4" />
                                </svg>
                                <div>
                                    <h3 class="font-bold text-lg">{t('msiNotice.title')}</h3>
                                    <p class="text-sm opacity-90">
                                        {t('msiNotice.description')}
                                    </p>
                                </div>
                            </div>

                            <div class="text-sm opacity-90">
                                <p innerHTML={t('msiNotice.instruction')}></p>
                            </div>

                            <div class="flex justify-end gap-2">
                                <button class="btn btn-sm btn-outline btn-neutral" onClick={() => {
                                    console.log("Proceed Anyway clicked");
                                    setBypassCwdMismatch(true);
                                }}>
                                    {t('msiNotice.proceedAnyway')}
                                </button>
                                <button class="btn btn-sm btn-outline btn-info" onClick={handleCloseApp}>
                                    {t('msiNotice.closeApp')}
                                </button>
                            </div>

                            <details class="mt-2 text-sm opacity-80">
                                <summary class="cursor-pointer hover:underline">
                                    {t('msiNotice.moreDetails')}
                                </summary>
                                <p class="mt-2">{t('msiNotice.detailsDescription')}</p>
                                <ul class="list-disc list-inside mt-1">
                                    <li>{t('msiNotice.detailsPoint1')}</li>
                                    <li>{t('msiNotice.detailsPoint2')}</li>
                                    <li>{t('msiNotice.detailsPoint3')}</li>
                                    <li>{t('msiNotice.detailsPoint4')}</li>
                                </ul>
                                <p class="mt-2">{t('msiNotice.detailsSolution')}</p>
                                <p class="mt-3 opacity-70">
                                    {t('msiNotice.workaround')} <a href="https://github.com/amarbego/rscoop" target="_blank" class="link underline">Open a PR</a>.
                                </p>
                            </details>
                        </div>
                    </div>
                </div>
            </Show>

            <Show when={update() && !error() && !isScoopInstalled() && (!hasCwdMismatch() || bypassCwdMismatch())}>
                <div class="bg-sky-600 text-white p-2 text-center text-sm flex justify-center items-center gap-4">
                    <span>{t('appUpdate.available', { version: update()!.version })}</span>
                    <button
                        class="bg-sky-800 hover:bg-sky-900 text-white font-bold py-1 px-3 rounded text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isInstalling()}
                        onClick={handleInstallUpdate}
                    >
                        {isInstalling() ? t('appUpdate.installing') : t('appUpdate.installNow')}
                    </button>
                    <button
                        class="hover:bg-sky-700 text-white font-bold py-1 px-3 rounded text-xs disabled:opacity-50"
                        disabled={isInstalling()}
                        onClick={() => setUpdate(null)}
                    >
                        {t('appUpdate.later')}
                    </button>
                </div>
            </Show>

            <Show when={!isReady() && !error()}>
                <div class="flex flex-col items-center justify-center h-screen bg-base-100">
                    <h1 class="text-2xl font-bold mb-4">{t('app.title')}</h1>
                    <p>{t('messages.loading')}</p>
                    <span class="loading loading-spinner loading-lg mt-4"></span>
                    <Show when={initTimedOut()}>
                        <div class="mt-4 text-warning text-center max-w-md">
                            <p>{t('messages.initTimeout')}</p>
                            <p class="text-sm mt-2">{t('messages.initTimeoutReason')}</p>
                        </div>
                    </Show>
                </div>
            </Show>

            <Show when={error()}>
                <div class="flex flex-col items-center justify-center h-screen bg-base-100">
                    <h1 class="text-2xl font-bold text-error mb-4">{t('status.error')}</h1>
                    <p>{error()}</p>
                    <Show when={initTimedOut()}>
                        <div class="mt-4 text-center max-w-md">
                            <p class="text-sm">{t('messages.initTimeoutShow')}</p>
                        </div>
                    </Show>
                </div>
            </Show>

            <Show when={isReady() && (!hasCwdMismatch() || bypassCwdMismatch())}>
                <div class="drawer" overflow-y-hidden>
                    <input id="my-drawer" type="checkbox" class="drawer-toggle" />
                    <div class="drawer-content flex flex-col h-screen">
                        <Header currentView={view()} onNavigate={setView} />
                        <main class="flex-1 p-6 overflow-y-auto overflow-x-hidden z-1">
                            <Show when={view() === "search"}>
                                <SearchPage />
                            </Show>
                            <Show when={view() === "bucket"}>
                                <BucketPage />
                            </Show>
                            <Show when={view() === "installed"}>
                                <InstalledPage onNavigate={setView} />
                            </Show>
                            <Show when={view() === "settings"}>
                                <SettingsPage
                                    activeSection=""
                                    onSectionChange={() => { }}
                                    isScoopInstalled={isScoopInstalled()}
                                />
                            </Show>
                            <Show when={view() === "doctor"}>
                                <DoctorPage />
                            </Show>
                        </main>
                    </div>
                    <div class="drawer-side">
                        <label
                            for="my-drawer"
                            aria-label="close sidebar"
                            class="drawer-overlay"
                        ></label>
                        <ul class="menu p-4 w-80 min-h-full bg-base-200 text-base-content">
                            <li>
                                <a onClick={() => setView("search")}>{t('app.search')}</a>
                            </li>
                            <li>
                                <a onClick={() => setView("bucket")}>{t('app.buckets')}</a>
                            </li>
                            <li>
                                <a onClick={() => setView("installed")}>{t('installed.header.title')}</a>
                            </li>
                            <li>
                                <a onClick={() => setView("settings")}>{t('settings.title')}</a>
                            </li>
                            <li>
                                <a onClick={() => setView("doctor")}>{t('doctor.title')}</a>
                            </li>
                        </ul>
                    </div>
                </div>
                {/* Update ALL floating button in the bottom-right corner */}
                <Show when={settings.ui.showGlobalUpdateButton}>
                    <AnimatedButton
                        onClick={handleUpdateAll}
                        initialState="circle"
                    />
                </Show>
                <DebugModal />
                <MinimizedIndicatorManager />
                <MultiInstanceWarning />
            </Show>
            {/* Render all active operation modals */}
            <For each={Object.values(operations())}>
                {(operation: OperationState) => (
                    <Show when={!operation.isMinimized}>
                        <OperationModal
                            operationId={operation.id}
                            title={operation.title}
                            onClose={(operationId, wasSuccess) => {
                                removeOperation(operationId);
                                if (operation.title === autoUpdateTitle()) {
                                    handleCloseAutoUpdateModal(wasSuccess);
                                }
                            }}
                        />
                    </Show>
                )}
            </For>
        </>
    );
}

export default App;
