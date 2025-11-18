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
    // 使用持久化信号存储搜索词
    const [searchTerm, setSearchTerm] = createStoredSignal<string>(
        "rscoop-search-term",
        ""
    );
    
    // 结果不持久化存储，但需要在组件重新挂载时恢复搜索
    const [results, setResults] = createSignal<ScoopPackage[]>([]);
    const [loading, setLoading] = createSignal(false);
    const [activeTab, setActiveTab] = createSignal<"packages" | "includes">(
        "packages"
    );
    
    // 添加一个标志来跟踪是否正在恢复搜索结果
    let isRestoring = false;

    // Use shared hooks
    const packageOperations = usePackageOperations();
    const packageInfo = usePackageInfo();

    let debounceTimer: ReturnType<typeof setTimeout>;
    let currentSearchController: AbortController | null = null;

    // 组件挂载时尝试恢复缓存结果
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
        // 取消之前的搜索
        if (currentSearchController) {
            currentSearchController.abort();
        }
        
        // 如果正在恢复搜索结果，则不执行新的搜索
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

        // 创建新的 AbortController
        currentSearchController = new AbortController();
        const { signal } = currentSearchController;

        setLoading(true);
        try {
            const response = await invoke<{ packages: ScoopPackage[], is_cold: boolean }>("search_scoop", {
                term: searchTerm(),
            });
            // 检查请求是否被取消
            if (!signal.aborted) {
                setResults(response.packages);
                // 缓存搜索结果和对应的搜索词
                searchResultsCache = response.packages;
                currentSearchTermCache = searchTerm();
                console.log("Search completed and results cached");
            }
        } catch (error: any) {
            // 忽略取消的请求错误
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
        // 如果有缓存的结果且搜索词匹配，则恢复结果
        if (searchResultsCache && currentSearchTermCache === searchTerm() && searchTerm().trim() !== "") {
            setResults(searchResultsCache);
            setLoading(false);
            console.log("Restored search results from cache");
        } 
        // 如果有搜索词但没有缓存结果，则执行搜索
        else if (searchTerm().trim() !== "") {
            console.log("No cache found, initiating search");
            handleSearch();
        }
        // 使用setTimeout确保在下一个tick重置isRestoring标志
        setTimeout(() => {
            isRestoring = false;
        }, 0);
    };

    createEffect(on([searchTerm], () => {
        // 如果正在恢复搜索结果，则不触发新的搜索
        if (isRestoring) {
            console.log("Skipping search effect during restore process");
            return;
        }
        
        // 如果搜索词为空，直接清空结果
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
        }, 600); // 增加到1000ms，给用户更多输入时间
    }));

    // Cleanup function to cancel ongoing search and clear timer
    const cleanup = () => {
        clearTimeout(debounceTimer);
        if (currentSearchController) {
            currentSearchController.abort();
        }
    };

    // Enhanced close operation modal that refreshes search results
    const closeOperationModal = (wasSuccess: boolean) => {
        packageOperations.closeOperationModal(wasSuccess);
        if (wasSuccess) {
            // Refresh search results to reflect installation state changes
            refreshSearchResults();
        }
    };

    // 计算属性定义
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