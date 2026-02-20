import { createSignal, createEffect, on, Setter, onMount, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ScoopPackage, ScoopInfo } from "../types/scoop";
import { usePackageOperations } from "./usePackageOperations";
import { usePackageInfo } from "./usePackageInfo";
import { OperationNextStep } from "../types/operations";
import { createTauriSignal } from "./createTauriSignal";

interface UseSearchReturn {
  searchTerm: () => string;
  setSearchTerm: Setter<string>;
  loading: () => boolean;
  error: () => string | null;
  activeTab: () => "packages" | "includes";
  setActiveTab: Setter<"packages" | "includes">;
  resultsToShow: () => ScoopPackage[];
  packageResults: () => ScoopPackage[];
  binaryResults: () => ScoopPackage[];
  
  // From usePackageInfo
  selectedPackage: () => ScoopPackage | null;
  info: () => ScoopInfo | null;
  infoLoading: () => boolean;
  infoError: () => string | null;
  fetchPackageInfo: (pkg: ScoopPackage) => Promise<void>;
  closeModal: () => void;
  updateSelectedPackage: (pkg: ScoopPackage) => void;
  
  // From usePackageOperations (with enhanced closeOperationModal)
  operationTitle: () => string | null;
  operationNextStep: () => OperationNextStep | null;
  isScanning: () => boolean;
  handleInstall: (pkg: ScoopPackage) => void;
  handleUninstall: (pkg: ScoopPackage) => void;
  handleInstallConfirm: () => void;
  closeOperationModal: (operationId: string, wasSuccess: boolean) => Promise<void>;

  // Cleanup function
  cleanup: () => void;
  // Refresh function
  refreshSearchResults: (force?: boolean) => Promise<void>;
  // Restore search results
  restoreSearchResults: () => void;
  // Check if has cached results
  hasCachedResults: () => boolean;
  
  // Bucket filter
  bucketFilter: () => string;
  setBucketFilter: Setter<string>;
}

let searchResultsCache: ScoopPackage[] | null = null;
let currentSearchTermCache: string | null = null;

export function useSearch(): UseSearchReturn {
    const [searchTerm, setSearchTerm] = createTauriSignal<string>(
        "scoopmeta-search-term",
        ""
    );
    
    const [error, setError] = createSignal<string | null>(null);
    const [results, setResults] = createSignal<ScoopPackage[]>([]);
    const [loading, setLoading] = createSignal(false);
    const [activeTab, setActiveTab] = createTauriSignal<"packages" | "includes">(
        "search-active-tab",
        "packages"
    );
    const [cacheVersion, setCacheVersion] = createSignal(0);
    const [bucketFilter, setBucketFilter] = createSignal<string>("");
    
    let isRestoring = false;

    // Use shared hooks
    const packageOperations = usePackageOperations();
    const packageInfo = usePackageInfo();

    let debounceTimer: ReturnType<typeof setTimeout>;
    let currentCacheVersion: number = 0;
    let currentSearchController: AbortController | null = null;

    onMount(async () => {
        restoreSearchResults();
        const unlistenBuckets = await listen("buckets-changed", () => setCacheVersion(v => v + 1));
        const unlistenPackages = await listen("packages-refreshed", () => setCacheVersion(v => v + 1));
        return () => {
            unlistenBuckets();
            unlistenPackages();
        };
    });

    // Memoized check for cached results
    const hasCachedResults = createMemo(() => {
        return Boolean(searchResultsCache && 
               currentSearchTermCache === searchTerm() && 
               searchTerm().trim() !== "" &&
               currentCacheVersion === cacheVersion());
    });

    const handleSearch = async (force: boolean = false) => {
        if (currentSearchController && !force) {
            currentSearchController.abort();
        }
        
        if (isRestoring && !force) {
            console.log("Skipping search - currently restoring");
            return;
        }

        if (searchTerm().trim() === "") {
            setResults([]);
            searchResultsCache = null;
            currentSearchTermCache = null;
            setLoading(false);
            setError(null);
            return;
        }

        currentSearchController = new AbortController();
        const { signal } = currentSearchController;

        setLoading(true);
        setError(null);
        try {
            const response = await invoke<{ packages: ScoopPackage[], is_cold: boolean }>("search_scoop", {
                term: searchTerm(),
            });
            if (!signal.aborted || force) {
                setResults(response.packages);
                searchResultsCache = response.packages;
                currentSearchTermCache = searchTerm();
                currentCacheVersion = cacheVersion();
                console.log("Search completed and results cached");
            }
        } catch (error: any) {
            if (error.name !== 'AbortError') {
                console.error("Search error:", error);
                setError("搜索失败，请检查网络或稍后重试");
            }
        } finally {
            setLoading(false);
            currentSearchController = null;
        }
    };

    // Function to refresh search results after package operations
    const refreshSearchResults = async (force: boolean = false) => {
        if (searchTerm().trim() !== "" || force) {
            console.log(`Refreshing search results ${force ? '(forced)' : ''}...`);
            await handleSearch(force);
        }
    };

    // Restore search results from cache
    const restoreSearchResults = () => {
        isRestoring = true;
        console.log("Attempting to restore search results");
        if (searchResultsCache && currentSearchTermCache === searchTerm() && searchTerm().trim() !== "" && currentCacheVersion === cacheVersion()) {
            setResults(searchResultsCache);
            setLoading(false);
            console.log("Restored search results from cache");
        } 
        else if (searchTerm().trim() !== "") {
            console.log("No cache found, initiating search");
            handleSearch();
        }
        setTimeout(() => {
            isRestoring = false;
        }, 0);
    };

    createEffect(on([searchTerm], () => {
        if (isRestoring) {
            console.log("Skipping search effect during restore process");
            return;
        }
        
        if (searchTerm().trim() === "") {
            setResults([]);
            searchResultsCache = null;
            currentSearchTermCache = null;
            setLoading(false);
            setError(null);
            return;
        }
        
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            console.log("Initiating search after debounce, term:", searchTerm());
            handleSearch()
        }, 600);
    }));

    // Cleanup function to cancel ongoing search and clear timer
    const cleanup = () => {
        clearTimeout(debounceTimer);
        if (currentSearchController) {
            currentSearchController.abort();
        }
    };

    // Enhanced close operation modal that refreshes search results
    const closeOperationModal = async (_operationId: string, wasSuccess: boolean) => {
        packageOperations.closeOperationModal(wasSuccess);
        if (wasSuccess) {
            // Refresh search results to reflect installation state changes
            await refreshSearchResults();

            // Update selectedPackage if it exists
            const currentSelected = packageInfo.selectedPackage();
            if (currentSelected) {
                const updatedPackage = results().find(p => p.name === currentSelected.name);
                if (updatedPackage) {
                    packageInfo.updateSelectedPackage(updatedPackage);
                }
            }
        }
    };

    const packageResults = () => results().filter((p) => p.match_source === "name");
    const binaryResults = () => results().filter((p) => p.match_source === "binary");
    const resultsToShow = () => {
        const filteredResults = activeTab() === "packages" ? packageResults() : binaryResults();
        if (bucketFilter()) {
            return filteredResults.filter((p) => p.source === bucketFilter());
        }
        return filteredResults;
    };

    return {
        searchTerm,
        setSearchTerm,
        error,
        loading,
        activeTab,
        setActiveTab,
        resultsToShow,
        packageResults,
        binaryResults,

        // From usePackageInfo
        selectedPackage: packageInfo.selectedPackage,
        info: packageInfo.info,
        infoLoading: packageInfo.loading,
        infoError: packageInfo.error,
        fetchPackageInfo: packageInfo.fetchPackageInfo,
        closeModal: packageInfo.closeModal,
        updateSelectedPackage: packageInfo.updateSelectedPackage,

        // From usePackageOperations (with enhanced closeOperationModal)
        operationTitle: packageOperations.operationTitle,
        operationNextStep: packageOperations.operationNextStep,
        isScanning: packageOperations.isScanning,
        handleInstall: packageOperations.handleInstall,
        handleUninstall: packageOperations.handleUninstall,
        handleInstallConfirm: packageOperations.handleInstallConfirm,
        closeOperationModal,

        // Cleanup function
        cleanup,
        // Refresh function
        refreshSearchResults,
        // Restore function
        restoreSearchResults,
        // Check cached results
        hasCachedResults,
        // Bucket filter
        bucketFilter,
        setBucketFilter
    };
}