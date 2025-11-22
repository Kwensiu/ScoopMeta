import { createSignal, onMount, createMemo, Show, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import Checkup, { CheckupItem } from "../components/page/doctor/Checkup";
import Cleanup from "../components/page/doctor/Cleanup";
import CacheManager from "../components/page/doctor/CacheManager";
import ShimManager from "../components/page/doctor/ShimManager";
import ScoopInfo from "../components/page/doctor/ScoopInfo";
import ScoopProxySettings from "../components/page/settings/ScoopProxySettings";
import CommandInputField from "../components/page/doctor/CommandInputField";
import FloatingOperationPanel from "../components/FloatingOperationPanel";
import installedPackagesStore from "../stores/installedPackagesStore";

const CACHE_DIR = "cache";
const SHIMS_DIR = "shims";

function DoctorPage() {
    const [operationTitle, setOperationTitle] = createSignal<string | null>(null);
    const [installingHelper, setInstallingHelper] = createSignal<string | null>(null);

    // State lifted from Checkup.tsx
    const [checkupResult, setCheckupResult] = createSignal<CheckupItem[]>([]);
    const [isCheckupLoading, setIsCheckupLoading] = createSignal(true);
    const [checkupError, setCheckupError] = createSignal<string | null>(null);
    const [isRetrying, setIsRetrying] = createSignal(false);
    const [activeOperations, setActiveOperations] = createSignal<Set<string>>(new Set());

    // Logic for running checkup, now in the parent component
    const runCheckup = async (isRetry = false) => {
        const operationId = 'checkup';
        setActiveOperations(prev => new Set(prev).add(operationId));
        
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
            setActiveOperations(prev => {
                const newSet = new Set(prev);
                newSet.delete(operationId);
                return newSet;
            });
            if (isRetry) {
                setIsRetrying(false);
            } else {
                setIsCheckupLoading(false);
            }
        }
    };

    onMount(() => {
        runCheckup();
    });

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
        const operationId = `install-${helperId}`;
        setActiveOperations(prev => new Set(prev).add(operationId));
        try {
            await invoke("install_package", { packageName: helperId, bucket: '' });
            await runCheckup();
            installedPackagesStore.refetch();
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(`Failed to install ${helperId}:`, errorMsg);
        } finally {
            setActiveOperations(prev => {
                const newSet = new Set(prev);
                newSet.delete(operationId);
                return newSet;
            });
            setInstallingHelper(null);
        }
    };

    const runOperation = (title: string, command: Promise<any>, operationId: string) => {
        if (activeOperations().has(operationId)) {
            return;
        }
        
        setActiveOperations(prev => new Set(prev).add(operationId));
        setOperationTitle(title);
        command.then(() => {
            // Operation succeeded
            console.log(`Operation "${title}" completed successfully`);
        }).catch(err => {
            // Operation failed
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(`Operation "${title}" failed:`, errorMsg);
        }).finally(() => {
            setActiveOperations(prev => {
                const newSet = new Set(prev);
                newSet.delete(operationId);
                return newSet;
            });
            // Modal closure is handled by its own event
        });
    };

    const handleCleanupApps = () => {
        runOperation(
            "Cleaning up old app versions...",
            invoke("cleanup_all_apps"),
            "cleanup-apps"
        );
    };

    const handleCleanupCache = () => {
        runOperation(
            "Cleaning up outdated cache...",
            invoke("cleanup_outdated_cache"),
            "cleanup-cache"
        );
    };
    
    const handleCloseOperationModal = (wasSuccess: boolean) => {
        setOperationTitle(null);
        if (wasSuccess) {
            runCheckup();
        }
    };
    
    const getScoopSubPath = (subPath: string) => {
        return async () => {
            try {
                const scoopPath = await invoke<string>("get_scoop_path");
                return `${scoopPath}\\${subPath}`;
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                console.error(`Failed to get scoop path for ${subPath}:`, errorMsg);
                throw err;
            }
        };
    };
    
    const handleOpenCacheDirectory = async () => {
        try {
            const getPath = getScoopSubPath(CACHE_DIR);
            const cachePath = await getPath();
            console.log("Attempting to open cache directory:", cachePath);
            await openPath(cachePath);
        } catch (err) {
            console.error("Failed to open cache directory:", err);
        }
    };
    
    const handleOpenShimDirectory = async () => {
        try {
            const getPath = getScoopSubPath(SHIMS_DIR);
            const shimPath = await getPath();
            console.log("Attempting to open shim directory:", shimPath);
            await openPath(shimPath);
        } catch (err) {
            console.error("Failed to open shim directory:", err);
        }
    };
    
    onCleanup(() => {
        setActiveOperations(new Set<string>());
    });
    
    const checkupComponent = (
        <Checkup
            checkupResult={checkupResult()}
            isLoading={isCheckupLoading()}
            isRetrying={isRetrying()}
            error={checkupError()}
            onRerun={() => runCheckup(true)}
            onInstallHelper={handleInstallHelper}
            installingHelper={installingHelper()}
        />
    );

  return (
    <>
      <div class="p-4 sm:p-6 md:p-8">
        <h1 class="text-3xl font-bold mb-6">Scoop Doctor</h1>
        
        <div class="space-y-8">
          <ScoopInfo />
          <CommandInputField />
          <ScoopProxySettings />
          
          <Show when={needsAttention()}>
            {checkupComponent}
          </Show>
          
          <Cleanup 
            onCleanupApps={handleCleanupApps}
            onCleanupCache={handleCleanupCache}
          />
          <CacheManager 
            onOpenDirectory={handleOpenCacheDirectory}
            onCleanupApps={handleCleanupApps}
            onCleanupCache={handleCleanupCache}
          />
          <ShimManager onOpenDirectory={handleOpenShimDirectory} />

          <Show when={!needsAttention() && (isCheckupLoading() || checkupResult().length > 0 || checkupError())}>
               {checkupComponent}
          </Show>
        </div>
      </div>
      <FloatingOperationPanel 
        title={operationTitle()}
        onClose={handleCloseOperationModal}
      />
    </>
  );
}

export default DoctorPage;