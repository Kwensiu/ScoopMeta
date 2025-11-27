import { createSignal, createEffect, on, Setter, onMount, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage, ScoopInfo } from "../types/scoop";
import { usePackageOperations } from "./usePackageOperations";
import { usePackageInfo } from "./usePackageInfo";
import { OperationNextStep } from "../types/operations";
import { createStoredSignal } from "./createStoredSignal";

interface UseSearchReturn {
  searchTerm: () => string;
  setSearchTerm: Setter<string>;
  loading: () => boolean;
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
  
  // From usePackageOperations (with enhanced closeOperationModal)
  operationTitle: () => string | null;
  operationNextStep: () => OperationNextStep | null;
  isScanning: () => boolean;
  handleInstall: (pkg: ScoopPackage) => void;
  handleUninstall: (pkg: ScoopPackage) => void;
  handleInstallConfirm: () => void;
  closeOperationModal: (wasSuccess: boolean) => void;

  // Cleanup function
  cleanup: () => void;
  // Refresh function
  refreshSearchResults: () => Promise<void>;
  // Restore search results
  restoreSearchResults: () => void;
  // Check if has cached results
  hasCachedResults: () => boolean | null;
}

// 缓存搜索结果，避免页面切换时丢失
let searchResultsCache: ScoopPackage[] | null = null;
let currentSearchTermCache: string | null = null;

export function useSearch(): UseSearchReturn {
    const [searchTerm, setSearchTerm] = createStoredSignal<string>(
        "rscoop-search-term",
        ""
    );
    
    const [results, setResults] = createSignal<ScoopPackage[]>([]);
    const [loading, setLoading] = createSignal(false);
    const [activeTab, setActiveTab] = createSignal<"packages" | "includes">(
        "packages"
    );
    
    let isRestoring = false;

    // Use shared hooks
    const packageOperations = usePackageOperations();
    const packageInfo = usePackageInfo();

    let debounceTimer: ReturnType<typeof setTimeout>;
    let currentSearchController: AbortController | null = null;

    onMount(() => {
        restoreSearchResults();
    });

    // Memoized check for cached results
    const hasCachedResults = createMemo(() => {
        return searchResultsCache && 
               currentSearchTermCache === searchTerm() && 
               searchTerm().trim() !== "";
    });

    const handleSearch = async () => {
        if (currentSearchController) {
            currentSearchController.abort();
        }
        
        if (isRestoring) {
            console.log("Skipping search - currently restoring");
            return;
        }

        if (searchTerm().trim() === "") {
            setResults([]);
            searchResultsCache = null;
            currentSearchTermCache = null;
            setLoading(false);
            return;
        }

        currentSearchController = new AbortController();
        const { signal } = currentSearchController;

        setLoading(true);
        try {
            const response = await invoke<{ packages: ScoopPackage[], is_cold: boolean }>("search_scoop", {
                term: searchTerm(),
            });
            if (!signal.aborted) {
                setResults(response.packages);
                searchResultsCache = response.packages;
                currentSearchTermCache = searchTerm();
                console.log("Search completed and results cached");
            }
        } catch (error: any) {
            if (error.name !== 'AbortError') {
                console.error("Search error:", error);
            }
        } finally {
            if (!signal.aborted) {
                setLoading(false);
            }
            currentSearchController = null;
        }
    };

    // Function to refresh search results after package operations
    const refreshSearchResults = async () => {
        if (searchTerm().trim() !== "") {
            console.log('Refreshing search results after package operation...');
            await handleSearch();
        }
    };

    // Restore search results from cache
    const restoreSearchResults = () => {
        isRestoring = true;
        console.log("Attempting to restore search results");
        if (searchResultsCache && currentSearchTermCache === searchTerm() && searchTerm().trim() !== "") {
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
    const closeOperationModal = async (wasSuccess: boolean) => {
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
        return activeTab() === "packages" ? packageResults() : binaryResults();
    };

    return {
        searchTerm,
        setSearchTerm,
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
        hasCachedResults
    };
}