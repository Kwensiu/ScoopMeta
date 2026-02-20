import PackageInfoModal from "../components/PackageInfoModal";
import OperationModal from "../components/OperationModal";

import { useSearch } from "../hooks/useSearch";
import SearchBar from "../components/page/search/SearchBar";
import SearchResultsTabs from "../components/page/search/SearchResultsTabs";
import SearchResultsList from "../components/page/search/SearchResultsList";

import { createSignal, createEffect, onCleanup, onMount } from "solid-js";
import { t } from "../i18n";
import { createTauriSignal } from "../hooks/createTauriSignal";
import { RefreshCw } from "lucide-solid";

function SearchPage() {
  const {
    searchTerm, setSearchTerm,
    loading,
    activeTab, setActiveTab,
    resultsToShow,
    packageResults,
    binaryResults,
    selectedPackage,
    info,
    infoLoading,
    infoError,
    operationTitle,
    operationNextStep,
    isScanning,
    handleInstall,
    handleUninstall,
    handleInstallConfirm,
    fetchPackageInfo,
    closeModal,
    closeOperationModal,
    cleanup,
    restoreSearchResults,
    refreshSearchResults,
    bucketFilter,
    setBucketFilter
  } = useSearch();

  const [currentPage, setCurrentPage] = createTauriSignal('searchCurrentPage', 1);
  const [uniqueBuckets, setUniqueBuckets] = createSignal<string[]>([]);
  const [refreshing, setRefreshing] = createSignal(false);

  onMount(() => {
    restoreSearchResults();
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshSearchResults();
    } finally {
      setRefreshing(false);
    }
  };

  createEffect(() => {
    resultsToShow();
    activeTab();
    setCurrentPage(1);

    // Get the bucket's name
    const buckets = [...new Set([...packageResults(), ...binaryResults()].map(p => p.source))];
    setUniqueBuckets(buckets);
  });

  onCleanup(() => {
    cleanup();
  });

  return (
    <div class="p-4">
      <div class="max-w-3xl mx-auto">
        <div class="flex items-center gap-2 mb-4">
          <div class="flex-1">
            <SearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
          </div>
          <button
            class="btn btn-square tooltip tooltip-top hover:btn-outline"
            data-tip={t("search.refreshResults")}
            onClick={handleRefresh}
            disabled={refreshing() || !searchTerm()}
          >
            <RefreshCw class={`w-5 h-5 ${refreshing() || loading() ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Tabs and bucket filter on the same line */}
        <div class="flex justify-between items-center mb-6">
          <div class="flex-1">
            <SearchResultsTabs
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              packageCount={packageResults().length}
              includesCount={binaryResults().length}
            />
          </div>
          <div class="ml-4 w-48">
            <select
              class="select select-bordered w-full max-w-xs"
              value={bucketFilter()}
              onChange={(e) => setBucketFilter(e.currentTarget.value)}
            >
              <option value="">{t("search.filter.allBuckets")}</option>
              {uniqueBuckets().map(bucket => (
                <option value={bucket}>{bucket}</option>
              ))}
            </select>
          </div>
        </div>

        <SearchResultsList
          loading={loading()}
          results={resultsToShow()}
          searchTerm={searchTerm()}
          activeTab={activeTab()}
          onViewInfo={fetchPackageInfo}
          onInstall={handleInstall}
          onPackageStateChanged={() => {
            // This will be called when install buttons are clicked
            // The actual refresh will happen in closeOperationModal when the operation completes
          }}
          currentPage={currentPage()}
          onPageChange={setCurrentPage}
        />
      </div>

      <PackageInfoModal
        pkg={selectedPackage()}
        info={info()}
        loading={infoLoading()}
        error={infoError()}
        onClose={closeModal}
        onInstall={handleInstall}
        onUninstall={handleUninstall}
        context="search"
        onPackageStateChanged={() => {
          // This will be called when install/uninstall buttons are clicked
          // The actual refresh will happen in closeOperationModal when the operation completes
        }}
      />
      <OperationModal
        title={operationTitle()}
        onClose={closeOperationModal}
        isScan={isScanning()}
        onInstallConfirm={handleInstallConfirm}
        nextStep={operationNextStep() ?? undefined}
      />
    </div>
  );
}

export default SearchPage;