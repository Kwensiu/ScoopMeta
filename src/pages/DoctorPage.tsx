import { createSignal, onMount, createMemo, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener"; // 添加openPath导入
import Checkup, { CheckupItem } from "../components/page/doctor/Checkup";
import Cleanup from "../components/page/doctor/Cleanup";
import CacheManager from "../components/page/doctor/CacheManager";
import ShimManager from "../components/page/doctor/ShimManager";
import OperationModal from "../components/OperationModal";
import installedPackagesStore from "../stores/installedPackagesStore";

function DoctorPage() {
    const [operationTitle, setOperationTitle] = createSignal<string | null>(null);
    const [installingHelper, setInstallingHelper] = createSignal<string | null>(null);

    // State lifted from Checkup.tsx
    const [checkupResult, setCheckupResult] = createSignal<CheckupItem[]>([]);
    const [isCheckupLoading, setIsCheckupLoading] = createSignal(true);
    const [checkupError, setCheckupError] = createSignal<string | null>(null);
    const [isRetrying, setIsRetrying] = createSignal(false);

    // Logic for running checkup, now in the parent component
    const runCheckup = async (isRetry = false) => {
        if (isRetry) {
            setIsRetrying(true);
        } else {
            setIsCheckupLoading(true);
        }
        setCheckupError(null);
        try {
            const result = await invoke<CheckupItem[]>("run_scoop_checkup");
            setCheckupResult(result);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to run sfsu checkup:", errorMsg);
            setCheckupError("Could not run sfsu checkup. Please ensure 'sfsu' is installed and accessible in your PATH.");
            setCheckupResult([]);
        } finally {
            if (isRetry) {
                setIsRetrying(false);
            } else {
                setIsCheckupLoading(false);
            }
        }
    };

    onMount(runCheckup);

    // Derived state to determine if checkup requires attention
    const needsAttention = createMemo(() => {
        if (isCheckupLoading() || checkupError() || checkupResult().length === 0) {
            return false;
        }
        // Needs attention if any item is not OK (status is false)
        return checkupResult().some(item => !item.status);
    });

    const handleInstallHelper = async (helperId: string) => {
        setInstallingHelper(helperId);
        try {
            await invoke("install_package", { packageName: helperId, bucket: '' });
            await runCheckup();
            installedPackagesStore.refetch();
        } catch (err) {
            console.error(`Failed to install ${helperId}:`, err);
        } finally {
            setInstallingHelper(null);
        }
    };

    const runOperation = (title: string, command: Promise<any>) => {
        setOperationTitle(title);
        command.catch(err => {
            console.error(`Operation "${title}" failed:`, err);
        }).finally(() => {
            // Modal closure is handled by its own event
        });
    };

    const handleCleanupApps = () => {
        runOperation(
            "Cleaning up old app versions...",
            invoke("cleanup_all_apps")
        );
    };

    const handleCleanupCache = () => {
        runOperation(
            "Cleaning up outdated cache...",
            invoke("cleanup_outdated_cache")
        );
    };
    
    const handleCloseOperationModal = () => {
        setOperationTitle(null);
    };
    
    // 添加打开缓存目录的函数
    const handleOpenCacheDirectory = async () => {
        try {
            const scoopPath = await invoke<string>("get_scoop_path");
            const cachePath = `${scoopPath}\\cache`;
            console.log("Attempting to open cache directory:", cachePath);
            await openPath(cachePath);
        } catch (err) {
            console.error("Failed to open cache directory:", err);
        }
    };
    
    // 添加打开shim目录的函数
    const handleOpenShimDirectory = async () => {
        try {
            const scoopPath = await invoke<string>("get_scoop_path");
            const shimPath = `${scoopPath}\\shims`;
            console.log("Attempting to open shim directory:", shimPath);
            await openPath(shimPath);
        } catch (err) {
            console.error("Failed to open shim directory:", err);
        }
    };
    
    return (
        <>
            <div class="p-4 sm:p-6 md:p-8">
                <h1 class="text-3xl font-bold mb-6">Scoop Doctor</h1>
                
                <div class="space-y-8">
                    <Show when={needsAttention()}>
                        <Checkup
                            checkupResult={checkupResult()}
                            isLoading={isCheckupLoading()}
                            isRetrying={isRetrying()}
                            error={checkupError()}
                            onRerun={() => runCheckup(true)}
                            onInstallHelper={handleInstallHelper}
                            installingHelper={installingHelper()}
                        />
                    </Show>
                    
                    <div>
                        <div class="flex items-center justify-between mb-4">
                            <h2 class="text-2xl font-bold">Scoop Cleanup</h2>
                        </div>
                        <Cleanup 
                            onCleanupApps={handleCleanupApps}
                            onCleanupCache={handleCleanupCache}
                        />
                    </div>
                    
                    <div>
                        <CacheManager onOpenDirectory={handleOpenCacheDirectory} />
                    </div>
                    
                    <div>
                        <ShimManager onOpenDirectory={handleOpenShimDirectory} />
                    </div>

                    <Show when={!needsAttention()}>
                         <Checkup
                            checkupResult={checkupResult()}
                            isLoading={isCheckupLoading()}
                            isRetrying={isRetrying()}
                            error={checkupError()}
                            onRerun={() => runCheckup(true)}
                            onInstallHelper={handleInstallHelper}
                            installingHelper={installingHelper()}
                        />
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

export default DoctorPage;