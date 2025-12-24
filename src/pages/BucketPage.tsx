import { createSignal, onMount, Show, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { useBuckets, type BucketInfo } from "../hooks/useBuckets";
import { usePackageInfo } from "../hooks/usePackageInfo";

import { createStoredSignal } from "../hooks/createStoredSignal";
import { ScoopPackage } from "../types/scoop";
import BucketInfoModal from "../components/BucketInfoModal";
import BucketSearch from "../components/page/buckets/BucketSearch";
import BucketGrid from "../components/page/buckets/BucketGrid";
import BucketSearchResults from "../components/page/buckets/BucketSearchResults";
import { SearchableBucket } from "../hooks/useBucketSearch";
import { t } from "../i18n";

interface BucketUpdateResult {
  success: boolean;
  message: string;
  bucket_name: string;
  bucket_path?: string;
  manifest_count?: number;
}

type UpdateState = {
  status: 'idle' | 'updating' | 'completed' | 'cancelled' | 'error';
  current: number;
  total: number;
  message: string;
};

function BucketPage() {
  const { buckets, loading, error, fetchBuckets, markForRefresh, getBucketManifests } = useBuckets();
  const packageInfo = usePackageInfo();

  const [selectedBucket, setSelectedBucket] = createSignal<BucketInfo | null>(null);
  const [selectedBucketDescription, setSelectedBucketDescription] = createSignal<string | undefined>(undefined);
  const [manifests, setManifests] = createSignal<string[]>([]);
  const [manifestsLoading, setManifestsLoading] = createSignal(false);

  // Search state
  const [isSearchActive, setIsSearchActive] = createSignal(false);
  const [searchResults, setSearchResults] = createSignal<SearchableBucket[]>([]);
  const [searchTotalCount, setSearchTotalCount] = createSignal(0);
  const [searchLoading, setSearchLoading] = createSignal(false);
  const [searchError, setSearchError] = createSignal<string | null>(null);
  const [isExpandedSearch, setIsExpandedSearch] = createStoredSignal('bucketExpandedSearch', false);

  // Update state
  const [updatingBuckets, setUpdatingBuckets] = createSignal<Set<string>>(new Set());
  const [updateResults, setUpdateResults] = createSignal<{ [key: string]: string }>({});
  const [updateState, setUpdateState] = createSignal<UpdateState>({
    status: 'idle',
    current: 0,
    total: 0,
    message: ""
  });

  let resultTimerIds: Map<string, number> = new Map();
  let stateTimerId: number | null = null;

  // Reference to current update operation for cancellation
  let currentUpdateOperation: { cancel: () => void } | null = null;

  onMount(() => {
    fetchBuckets();
  });

  onCleanup(() => {
    cleanupTimers();
  });

  const toggleSearch = () => {
    setIsSearchActive(!isSearchActive());
    if (!isSearchActive()) {
      // Reset search results when closing search
      setSearchResults([]);
      setSearchTotalCount(0);
      setSearchError(null);
      setIsExpandedSearch(false);
    }
  };

  const handleSearchResults = (results: any) => {
    setSearchResults(results.results || []);
    setSearchTotalCount(results.totalCount || 0);
    setSearchLoading(results.isSearching || false);
    setSearchError(results.error || null);
    setIsExpandedSearch(results.isExpandedSearch || false);
  };

  const handleViewBucket = async (bucket: BucketInfo) => {
    setSelectedBucket(bucket);
    setSelectedBucketDescription(undefined); // Clear description for regular buckets
    setManifestsLoading(true);
    const bucketManifests = await getBucketManifests(bucket.name);
    setManifests(bucketManifests);
    setManifestsLoading(false);
  };

  // Additional state for external bucket modal
  const [selectedSearchBucket, setSelectedSearchBucket] = createSignal<SearchableBucket | null>(null);

  const handleSearchBucketSelect = async (searchBucket: SearchableBucket) => {
    // First check if this bucket is already installed locally
    const installedBucket = buckets().find(b => b.name === searchBucket.name);

    if (installedBucket) {
      // Bucket is installed locally - use the regular handler to show manifests
      setSelectedSearchBucket(null); // Clear search bucket
      handleViewBucket(installedBucket);
    } else {
      // Bucket is not installed - show as external bucket with description
      const bucketInfo: BucketInfo = {
        name: searchBucket.name,
        path: searchBucket.url, // Use URL as path for external buckets
        is_git_repo: true,
        git_url: searchBucket.url,
        git_branch: "main", // Default branch
        last_updated: searchBucket.last_updated,
        manifest_count: searchBucket.apps,
      };

      setSelectedBucket(bucketInfo);
      setSelectedSearchBucket(searchBucket); // Store the search bucket for the modal
      setSelectedBucketDescription(searchBucket.description); // Store description for external buckets
      setManifests([]); // No manifests for external buckets
      setManifestsLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedBucket(null);
    setSelectedSearchBucket(null);
    setSelectedBucketDescription(undefined);
    setManifests([]);
    setManifestsLoading(false);
  };

  const handlePackageClick = async (packageName: string, bucketName: string) => {
    // Create a ScoopPackage object for the package info modal
    const pkg: ScoopPackage = {
      name: packageName,
      version: "", // Will be fetched by package info
      source: bucketName,
      updated: "",
      is_installed: false, // Will be determined by package info
      info: "",
      match_source: "name"
    };

    // Simply open package info modal - bucket modal stays open underneath
    await packageInfo.fetchPackageInfo(pkg);
  };

  // Handle bucket installation/removal - refresh bucket list
  const handleBucketInstalled = async () => {
    markForRefresh();
    await fetchBuckets(true);
  };

  // Handle fetching manifests for newly installed bucket
  const handleFetchManifests = async (bucketName: string) => {
    setManifestsLoading(true);
    try {
      const bucketManifests = await getBucketManifests(bucketName);
      setManifests(bucketManifests);
    } catch (error) {
      console.error('Failed to fetch manifests for bucket:', bucketName, error);
    } finally {
      setManifestsLoading(false);
    }
  };

  // Handle updating a single bucket
  const handleUpdateBucket = async (bucketName: string, shouldRefreshBuckets: boolean = true) => {
    // Add to updating set
    setUpdatingBuckets(prev => new Set([...prev, bucketName]));

    try {
      const result = await invoke<BucketUpdateResult>("update_bucket", {
        bucketName: bucketName
      });

      // Store result message
      setUpdateResults(prev => ({
        ...prev,
        [bucketName]: result.message
      }));

      if (result.success) {
        // If this bucket is currently selected, refresh its manifests
        const currentBucket = selectedBucket();
        if (currentBucket && currentBucket.name === bucketName) {
          await handleFetchManifests(bucketName);
        }

        // Conditionally refresh bucket list to avoid excessive refreshes during batch updates
        if (shouldRefreshBuckets) {
          // Refresh bucket list without showing loading screen
          markForRefresh();
          // Use quiet mode to refresh without showing loading state
          await fetchBuckets(true, true);
        }
      }

      // Clear result message after 2 seconds to avoid long display
      const timerId = window.setTimeout(() => {
        setUpdateResults(prev => {
          const newResults = { ...prev };
          delete newResults[bucketName];
          return newResults;
        });
        resultTimerIds.delete(bucketName);
      }, 2000);

      resultTimerIds.set(bucketName, timerId);

      return result; // Return the result
    } catch (error) {
      console.error('Failed to update bucket:', bucketName, error);
      setUpdateResults(prev => ({
        ...prev,
        [bucketName]: `Failed to update: ${error instanceof Error ? error.message : String(error)}`
      }));

      const timerId = window.setTimeout(() => {
        setUpdateResults(prev => {
          const newResults = { ...prev };
          delete newResults[bucketName];
          return newResults;
        });
        resultTimerIds.delete(bucketName);
      }, 2000);

      resultTimerIds.set(bucketName, timerId);

      throw error; // Re-throw the error
    } finally {
      // Remove from updating set in all cases
      setUpdatingBuckets(prev => {
        const newSet = new Set(prev);
        newSet.delete(bucketName);
        return newSet;
      });
    }
  };

  // Handle updating all buckets with limited concurrency
  const handleUpdateAllBuckets = async () => {
    // If we're cancelling or already updating, don't start a new update
    if (updateState().status === 'updating') return;

    const gitBuckets = buckets().filter(bucket => bucket.is_git_repo);

    // Set updating all flag to prevent full page reload
    setUpdateState({
      status: 'updating',
      current: 0,
      total: gitBuckets.length,
      message: "Starting updates..."
    });

    // Flag to track cancellation
    let cancelled = false;

    // Create and store a cancellable object immediately
    const cancellable = {
      cancel: () => {
        cancelled = true;
        setUpdateState(prev => ({
          ...prev,
          status: 'cancelled',
          message: "Cancelling..."
        }));

        // Refresh bucket list when cancelled
        markForRefresh();
        fetchBuckets(true, true);
      }
    };

    currentUpdateOperation = cancellable;

    try {
      // Create update promises using map directly
      const updatePromises = gitBuckets.map(async (bucket, index) => {
        // Check if cancelled before starting
        if (cancelled) return Promise.resolve();

        setUpdateState(prev => ({
          ...prev,
          message: `Updating ${bucket.name} (${index + 1}/${gitBuckets.length})`
        }));

        // Update bucket but don't refresh the bucket list yet
        try {
          const result = await handleUpdateBucket(bucket.name, false);

          // Check if cancelled after update
          if (cancelled) return Promise.resolve();

          setUpdateState(prev => ({
            ...prev,
            current: prev.current + 1
          }));

          return result;
        } catch (error) {
          console.error(`Failed to update bucket ${bucket.name}:`, error);

          setUpdateState(prev => ({
            ...prev,
            current: prev.current + 1
          }));

          return Promise.resolve();
        }
      });

      // Execute all promises
      await Promise.all(updatePromises);

      // Check if cancelled before completing
      if (cancelled) return;

      // Refresh bucket list once after all updates are complete
      markForRefresh();
      await fetchBuckets(true, true);

      // Show completion state
      setUpdateState(prev => ({
        ...prev,
        status: 'completed',
        message: "Complete"
      }));
    } catch (error) {
      // Check if this is a cancellation
      if (cancelled) {
        setUpdateState(prev => ({
          ...prev,
          status: 'cancelled',
          message: "Cancelled"
        }));
        return;
      }

      console.error("Error updating all buckets:", error);
      setUpdateState(prev => ({
        ...prev,
        status: 'error',
        message: "Error occurred during update"
      }));
    } finally {
      // Clear updating all flag and hide progress bar after delay
      if (stateTimerId) {
        window.clearTimeout(stateTimerId);
      }

      stateTimerId = window.setTimeout(() => {
        setUpdateState(prev => ({
          ...prev,
          status: 'idle'
        }));
      }, 300);

      // Hide progress bar after 3 seconds
      const progressBarTimerId = window.setTimeout(() => {
        setUpdateState(prev => ({
          ...prev,
          status: prev.status === 'completed' ? 'idle' : prev.status
        }));

        window.clearTimeout(progressBarTimerId);
      }, 3000);

      // Clear current update operation reference
      currentUpdateOperation = null;
    }

    return cancellable;
  };

  // Handle manual reload of local buckets
  const handleReloadLocalBuckets = async () => {
    markForRefresh();
    await fetchBuckets(true);
  };

  const handleCancelUpdateAll = () => {
    if (currentUpdateOperation) {
      currentUpdateOperation.cancel();
      currentUpdateOperation = null;
    }
  };

  const cleanupTimers = () => {
    resultTimerIds.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    resultTimerIds.clear();

    if (stateTimerId) {
      window.clearTimeout(stateTimerId);
      stateTimerId = null;
    }
  };

  return (
    <div class="p-6">
      <div class="max-w-6xl mx-auto">
        {/* Header Section */}
        <div class={`mb-6 relative transition-all duration-300 ${isSearchActive() ? 'mb-32' : 'mb-6'}`}>
          <div class="flex items-center justify-between">
            <div class={`transition-all duration-300 ${isSearchActive() ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <h1 class="text-3xl font-bold mb-2">{t("app.buckets")}</h1>
              <p class="text-base-content/70">
                {t("bucket.page.description")}
              </p>
            </div>

            <BucketSearch
              isActive={isSearchActive}
              onToggle={toggleSearch}
              onSearchResults={handleSearchResults}
            />
          </div>
        </div>

        {/* Error State */}
        <Show when={error() && !isSearchActive()}>
          <div class="alert alert-error mb-4">
            <span>{error()}</span>
          </div>
        </Show>

        {/* Main Content */}
        {/* Search Results */}
        <Show when={isSearchActive()}>
          <div class={`transition-all duration-300 ${isSearchActive() ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}>
            <div class="card bg-base-100">
              <div class="card-body">
                <BucketSearchResults
                  buckets={searchResults()}
                  loading={searchLoading()}
                  error={searchError()}
                  totalCount={searchTotalCount()}
                  isExpandedSearch={isExpandedSearch()}
                  installedBuckets={buckets()}
                  onBucketSelect={handleSearchBucketSelect}
                  onBucketInstalled={handleBucketInstalled}
                />
              </div>
            </div>
          </div>
        </Show>

        {/* Progress bar for updating all buckets */}
        <Show when={updateState().status !== 'idle'}>
          <div class="mt-0 p-4 bg-base-100 rounded-lg shadow transition-opacity duration-300">
            <div class="flex justify-between mb-1">
              <span class="text-base font-medium">
                Updating Buckets
              </span>
              <span class="text-sm font-medium">
                {updateState().current}/{updateState().total}
              </span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2.5">
              <div
                class={`h-2.5 rounded-full transition-all duration-300 ${updateState().status === 'completed' ? 'bg-green-500' :
                  updateState().status === 'error' ? 'bg-red-500' : 'bg-orange-500'
                  }`}
                style={{
                  width: `${(updateState().current / Math.max(updateState().total, 1)) * 100}%`
                }}
              ></div>
            </div>
            <div class="mt-2 text-sm text-gray-500">
              {updateState().message}
              <Show when={updateState().status === 'completed'}>
                <span> - This may take a few seconds to complete</span>
              </Show>
            </div>
          </div>
        </Show>

        {/* Regular Buckets View */}
        <Show when={!isSearchActive()}>
          <div class={`transition-all duration-300 ${!isSearchActive() ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}>
            <div class="card bg-base-100">
              <div class="card-body">
                <BucketGrid
                  buckets={buckets()}
                  onViewBucket={handleViewBucket}
                  onRefresh={handleReloadLocalBuckets}
                  onUpdateBucket={handleUpdateBucket}
                  onUpdateAll={handleUpdateAllBuckets}
                  onCancelUpdateAll={handleCancelUpdateAll}
                  updatingBuckets={updatingBuckets()}
                  updateResults={updateResults()}
                  loading={loading() && updateState().status !== 'updating'} // Only show loading when not updating specific buckets
                  isUpdatingAll={updateState().status === 'updating'}
                  isCancelling={updateState().status === 'cancelled'}
                />


              </div>
            </div>
          </div>
        </Show>
      </div>

      {/* Modals */}
      <Show when={selectedBucket()}>
        <BucketInfoModal
          bucket={selectedBucket()!}
          description={selectedBucketDescription()}
          manifests={manifests()}
          manifestsLoading={manifestsLoading()}
          error={null}
          searchBucket={selectedSearchBucket() || undefined}
          onClose={closeModal}
          onPackageClick={handlePackageClick}
          onBucketInstalled={handleBucketInstalled}
          onFetchManifests={(bucketName: string) => handleFetchManifests(bucketName)}
        />
      </Show>
    </div>
  );
}

export default BucketPage;