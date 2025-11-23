import { For, Show, createSignal, createMemo } from "solid-js";
import PackageInfoModal from "../components/PackageInfoModal";
import OperationModal from "../components/OperationModal";
import ScoopStatusModal from "../components/ScoopStatusModal";
import { useInstalledPackages } from "../hooks/useInstalledPackages";
import InstalledPageHeader from "../components/page/installed/InstalledPageHeader";
import PackageListView from "../components/page/installed/PackageListView";
import PackageGridView from "../components/page/installed/PackageGridView";
import { View } from "../types/scoop";
import ConfirmationModal from "../components/ConfirmationModal";
import { createStoredSignal } from "../hooks/createStoredSignal";
import FloatingOperationPanel from "../components/FloatingOperationPanel";

interface InstalledPageProps {
  onNavigate?: (view: View) => void;
}

function InstalledPage(props: InstalledPageProps) {
  const {
    loading,
    error,
    processedPackages,
    updatableCount,
    uniqueBuckets,
    isCheckingForUpdates,
    viewMode, setViewMode,
    sortKey, sortDirection,
    selectedBucket, setSelectedBucket,
    selectedPackage, info, infoLoading, infoError,
    operationTitle,
    operationNextStep,
    operatingOn,
    scoopStatus,
    statusLoading,
    statusError,
    isPackageVersioned,
    checkScoopStatus,
    handleSort,
    handleUpdate,
    handleUpdateAll,
    handleHold,
    handleUnhold,
    handleSwitchVersion,
    handleUninstall,
    handleOpenChangeBucket,
    handleFetchPackageInfo,
    handleFetchPackageInfoForVersions,
    handleCloseInfoModalWithVersions,
    autoShowVersions,
    handleCloseOperationModal,
    fetchInstalledPackages,
    checkForUpdates,
    // Change bucket states
    changeBucketModalOpen,
    currentPackageForBucketChange,
    newBucketName,
    setNewBucketName,
    handleChangeBucketConfirm,
    handleChangeBucketCancel,
    // Buckets for selection
    buckets
  } = useInstalledPackages();

  const [searchQuery, setSearchQuery] = createStoredSignal<string>('installedSearchQuery', "");
  const [showStatusModal, setShowStatusModal] = createSignal(false);

  const handleCheckStatus = async () => {
    await checkScoopStatus();
    setShowStatusModal(true);
  };

  const filteredPackages = createMemo(() => {
    const query = searchQuery().toLowerCase();
    if (!query) return processedPackages();

    return processedPackages().filter(p => p.name.toLowerCase().includes(query));
  });

  return (
    <div class="p-8 sm:p-8 md:p-8">
      <InstalledPageHeader
        updatableCount={updatableCount}
        onUpdateAll={handleUpdateAll}
        onCheckStatus={handleCheckStatus}
        statusLoading={statusLoading}
        scoopStatus={scoopStatus}
        uniqueBuckets={uniqueBuckets}
        selectedBucket={selectedBucket}
        setSelectedBucket={setSelectedBucket}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        viewMode={viewMode}
        setViewMode={setViewMode}
        isCheckingForUpdates={isCheckingForUpdates}
        onCheckForUpdates={checkForUpdates}
        onRefresh={fetchInstalledPackages}
      />

      <Show when={loading()}>
        <div class="flex justify-center items-center h-64">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      </Show>

      <Show when={error()}>
        <div role="alert" class="alert alert-error">
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>Error: {error()}</span>
          <button class="btn btn-sm btn-primary" onClick={fetchInstalledPackages}>Try Again</button>
        </div>
      </Show>

      <Show when={!loading() && !error() && filteredPackages().length === 0}>
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <div class="bg-base-300 rounded-full p-4 mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-base-content/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          </div>
          <h3 class="text-2xl font-bold mb-2">No packages found</h3>
          <p class="text-lg text-base-content/70 mb-6 max-w-md">
            <Show when={searchQuery() || selectedBucket() !== 'all'}>
              No installed packages match your current filter criteria.
            </Show>
            <Show when={!searchQuery() && selectedBucket() === 'all'}>
              You don't have any packages installed yet.
            </Show>
          </p>
          <Show when={searchQuery() || selectedBucket() !== 'all'}>
            <button 
              class="btn btn-primary mb-4"
              onClick={() => {
                setSearchQuery("");
                setSelectedBucket("all");
              }}
            >
              Clear Filters
            </button>
          </Show>
          <Show when={!searchQuery() && selectedBucket() === 'all'}>
            <button 
              class="btn btn-primary"
              onClick={() => props.onNavigate?.("search")}
            >
              Browse Packages
            </button>
          </Show>
        </div>
      </Show>

      <Show when={!loading() && !error() && filteredPackages().length > 0}>
        <Show when={viewMode() === 'list'}
          fallback={<PackageGridView
            packages={filteredPackages}
            onViewInfo={handleFetchPackageInfo}
            onViewInfoForVersions={handleFetchPackageInfoForVersions}
            onUpdate={handleUpdate}
            onHold={handleHold}
            onUnhold={handleUnhold}
            onSwitchVersion={handleSwitchVersion}
            onUninstall={handleUninstall}
            onChangeBucket={handleOpenChangeBucket}
            operatingOn={operatingOn}
            isPackageVersioned={isPackageVersioned}
          />}
        >
          <PackageListView
            packages={filteredPackages}
            onSort={handleSort}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onViewInfo={handleFetchPackageInfo}
            onViewInfoForVersions={handleFetchPackageInfoForVersions}
            onUpdate={handleUpdate}
            onHold={handleHold}
            onUnhold={handleUnhold}
            onSwitchVersion={handleSwitchVersion}
            onUninstall={handleUninstall}
            onChangeBucket={handleOpenChangeBucket}
            operatingOn={operatingOn}
            isPackageVersioned={isPackageVersioned}
          />
        </Show>
      </Show>

      <Show when={changeBucketModalOpen()}>
        <div class="fixed inset-0 flex items-center justify-center z-50 p-2">
          <div 
            class="absolute inset-0 transition-all duration-300 ease-out"
            classList={{
              "opacity-0": !changeBucketModalOpen(),
              "opacity-100": changeBucketModalOpen(),
            }}
            style="background-color: rgba(0, 0, 0, 0.3); backdrop-filter: blur(2px);"
            onClick={handleChangeBucketCancel}
          ></div>
          <div 
            class="relative bg-base-200 rounded-xl shadow-2xl border border-base-300 w-full max-w-lg sm:max-w-lg md:max-w-md overflow-hidden transition-all duration-300 ease-out"
            classList={{
              "scale-90 opacity-0 translate-y-4": !changeBucketModalOpen(),
              "scale-100 opacity-100 translate-y-0": changeBucketModalOpen(),
            }}
          >
            <div class="flex justify-between items-center p-4 border-b border-base-300">
              <h3 class="font-bold text-lg">Select new bucket for {currentPackageForBucketChange()?.name}:</h3>
              <button 
                class="btn btn-sm btn-circle btn-ghost hover:bg-base-300 transition-colors duration-200"
                onClick={handleChangeBucketCancel}
              >
                ✕
              </button>
            </div>
            
            <div class="p-4">
              <select
                value={newBucketName()}
                onInput={(e) => setNewBucketName(e.currentTarget.value)}
                class="select select-bordered w-full max-w-xs"
              >
                <option value="" disabled>Select a bucket</option>
                <For each={buckets()}>
                  {(bucket) => (
                    <option value={bucket.name}>{bucket.name}</option>
                  )}
                </For>
              </select>
              <div class="text-sm text-base-content/70 mt-2">
                Current bucket: {currentPackageForBucketChange()?.source}
              </div>
              <div class="mt-4 p-3 bg-info/10 rounded-lg border border-info/20">
                <p class="text-xs text-info-content/85">
                  <strong class="text-yellow-800 dark:text-yellow-200">Warning:</strong> Ensure the software package is present in the target repository.
                </p>
              </div>
              <div class="flex justify-end gap-2 mt-4">
                <button class="btn btn-ghost" onClick={handleChangeBucketCancel}>
                  Cancel
                </button>
                <button 
                  class="btn btn-primary" 
                  onClick={async () => {
                    await handleChangeBucketConfirm();
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      </Show>

      <PackageInfoModal 
        pkg={selectedPackage()}
        info={info()}
        loading={infoLoading()}
        error={infoError()}
        onClose={handleCloseInfoModalWithVersions}
        onUninstall={handleUninstall}

        onSwitchVersion={(pkg, version) => {
          console.log(`Switched ${pkg.name} to version ${version}`);
          // The PackageInfoModal already calls onPackageStateChanged which triggers a refresh
        }}
        autoShowVersions={autoShowVersions()}
        isPackageVersioned={isPackageVersioned}
        onPackageStateChanged={fetchInstalledPackages}
      />
      <OperationModal
        title={operationTitle()}
        onClose={handleCloseOperationModal}
        nextStep={operationNextStep() ?? undefined}
      />
      <ScoopStatusModal
        isOpen={showStatusModal()}
        onClose={() => setShowStatusModal(false)}
        status={scoopStatus()}
        loading={statusLoading()}
        error={statusError()}
        onNavigate={props.onNavigate}
      />
    </div>
  );
}

export default InstalledPage;