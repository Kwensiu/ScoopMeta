import PackageInfoModal from "../components/PackageInfoModal";
import FloatingOperationPanel from "../components/FloatingOperationPanel";

import { useSearch } from "../hooks/useSearch";
import SearchBar from "../components/page/search/SearchBar";
import SearchResultsTabs from "../components/page/search/SearchResultsTabs";
import SearchResultsList from "../components/page/search/SearchResultsList";
import { createSignal, createEffect, onCleanup, onMount } from "solid-js";

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
    restoreSearchResults,
    cleanup
  } = useSearch();

  // 添加分页状态
  const [currentPage, setCurrentPage] = createSignal(1);

  onMount(() => {
    // 检查是否有缓存的结果并恢复
    restoreSearchResults();
  });

  // 当搜索结果或标签页改变时，重置到第一页
  createEffect(() => {
    // 监听resultsToShow和activeTab变化
    resultsToShow();
    activeTab();
    // 重置到第一页
    setCurrentPage(1);
  });

  // 清理资源
  onCleanup(() => {
    cleanup();
  });

  return (
    <div class="p-4 sm:p-6 md:p-8">
      <div class="max-w-3xl mx-auto">
        <SearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} loading={loading} />

        <SearchResultsTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          packageCount={packageResults().length}
          includesCount={binaryResults().length}
        />

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
        onPackageStateChanged={() => {
          // This will be called when install/uninstall buttons are clicked
          // The actual refresh will happen in closeOperationModal when the operation completes
        }}
      />
      <FloatingOperationPanel
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