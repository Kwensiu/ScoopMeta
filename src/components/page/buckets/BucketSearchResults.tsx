import { For, Show } from "solid-js";
import { SearchableBucket } from "../../../hooks/useBucketSearch";
import { BucketInfo } from "../../../hooks/useBuckets";
import { useBucketInstall } from "../../../hooks/useBucketInstall";
import { ExternalLink, Star, Package, GitFork, Shield, Clock, Download, Trash2, LoaderCircle } from "lucide-solid";
import { openUrl } from '@tauri-apps/plugin-opener';
import Card from "../../common/Card";
import { t } from "../../../i18n";
import { formatBucketDate } from "../../../utils/date";

interface BucketSearchResultsProps {
  buckets: SearchableBucket[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  isExpandedSearch: boolean;
  installedBuckets: BucketInfo[];
  onBucketSelect?: (bucket: SearchableBucket) => void;
  onBucketInstalled?: () => void; // Callback when a bucket is installed/removed
}

function BucketSearchResults(props: BucketSearchResultsProps) {
  const bucketInstall = useBucketInstall();
  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  };

  // Check if a bucket is installed locally
  const isBucketInstalled = (bucketName: string) => {
    return props.installedBuckets.some(installed => installed.name === bucketName);
  };

  // Handle bucket installation
  const handleInstallBucket = async (bucket: SearchableBucket, event: Event) => {
    event.stopPropagation();

    try {
      const result = await bucketInstall.installBucket({
        name: bucket.name,
        url: bucket.url,
        force: false,
      });

      if (result.success) {
        // Call parent callback to refresh bucket list immediately
        console.log('Bucket installed successfully, refreshing bucket list');
        props.onBucketInstalled?.();
      } else {
        console.error('Bucket installation failed:', result.message);
      }
    } catch (error) {
      console.error('Failed to install bucket:', error);
    }
  };

  // Handle bucket removal
  const handleRemoveBucket = async (bucketName: string, event: Event) => {
    event.stopPropagation();

    try {
      const result = await bucketInstall.removeBucket(bucketName);

      if (result.success) {
        // Call parent callback to refresh bucket list immediately
        console.log('Bucket removed successfully, refreshing bucket list');
        props.onBucketInstalled?.();
      } else {
        console.error('Bucket removal failed:', result.message);
      }
    } catch (error) {
      console.error('Failed to remove bucket:', error);
    }
  };

  return (
    <div class="space-y-4">
      {/* Header */}
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold">
          {t("bucket.searchResults.title")}
          <Show when={!props.loading}>
            <span class="text-base-content/60 ml-2 text-lg font-normal">
              ({props.buckets.length}{props.totalCount > props.buckets.length ? ` of ${props.totalCount}` : ''})
            </span>
          </Show>
        </h2>

        <Show when={props.isExpandedSearch}>
          <div class="badge badge-info badge-outline badge-lg">
            <Shield class="w-3 h-3 mr-1" />
            {t("bucket.searchResults.expandedSearch")}
          </div>
        </Show>
      </div>

      {/* Loading State */}
      <Show when={props.loading}>
        <div class="flex justify-center items-center py-12">
          <span class="loading loading-spinner loading-lg mr-3"></span>
          <span class="text-lg">{t("bucket.searchResults.searchingBuckets")}</span>
        </div>
      </Show>

      {/* Error State */}
      <Show when={props.error}>
        <div class="alert alert-error">
          <span>{props.error}</span>
        </div>
      </Show>

      {/* No Results */}
      <Show when={!props.loading && !props.error && props.buckets.length === 0}>
        <div class="text-center py-12">
          <Package class="w-16 h-16 mx-auto text-base-content/40 mb-4" />
          <h3 class="text-xl font-semibold mb-2">{t("bucket.searchResults.noBucketsFound")}</h3>
          <p class="text-base-content/70">
            {t("bucket.searchResults.tryAdjustTerms")}
          </p>
        </div>
      </Show>

      {/* Results Grid */}
      <Show when={!props.loading && !props.error && props.buckets.length > 0}>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <For each={props.buckets}>
            {(bucket) => (
              <Card
                title={
                  <div class="flex items-center justify-between w-full gap-2">
                    <span class="truncate font-semibold">{bucket.name}</span>
                    <div class="flex items-center gap-1 shrink-0">
                      <Show when={bucket.is_verified}>
                        <div class="badge badge-info badge-outline absolute top-[21px] right-[16px] z-10">
                          <Shield class="w-3 h-3 mr-1" />
                          {t("bucket.searchResults.verified")}
                        </div>
                      </Show>
                      <button
                        type="button"
                        class="btn btn-circle btn-sm btn-ghost hover:btn-primary"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await openUrl(bucket.url);
                          } catch (error) {
                            console.error('Failed to open GitHub URL:', error);
                          }
                        }}
                        title={t("bucket.searchResults.openInGithub")}
                      >
                        <ExternalLink class="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                }
                description={
                  <>
                    <p class="text-sm line-clamp-2 mb-4 min-h-10">
                      {bucket.description || t("bucket.searchResults.noDescription")}
                    </p>

                    {/* Full Name */}
                    <p class="text-xs text-base-content/70 font-mono truncate mb-4">
                      {bucket.full_name}
                    </p>

                    {/* Stats */}
                    <div class="grid grid-cols-3 gap-2 text-xs mb-4">
                      <div class="stat-item flex items-center gap-1">
                        <Star class="w-3 h-3 text-yellow-500" />
                        <span class="font-medium">{formatNumber(bucket.stars)}</span>
                      </div>

                      <div class="stat-item flex items-center gap-1">
                        <Package class="w-3 h-3 text-blue-500" />
                        <span class="font-medium">{formatNumber(bucket.apps)}</span>
                      </div>

                      <div class="stat-item flex items-center gap-1">
                        <GitFork class="w-3 h-3 text-green-500" />
                        <span class="font-medium">{formatNumber(bucket.forks)}</span>
                      </div>
                    </div>

                    {/* Last Updated */}
                    <Show when={bucket.last_updated !== "Unknown"}>
                      <div class="flex items-center gap-1 text-xs text-base-content/60 border-b pb-3 mb-3">
                        <Clock class="w-3 h-3" />
                        <span>{t("bucket.searchResults.updated", { date: formatBucketDate(bucket.last_updated) })}</span>
                      </div>
                    </Show>
                  </>
                }
                class="bg-base-200 shadow-sm hover:shadow-md transition-all duration-200 border border-base-300"
              >
                {/* Action Buttons */}
                <div class="flex items-center gap-2">
                  <Show
                    when={isBucketInstalled(bucket.name)}
                    fallback={
                      <button
                        class="btn btn-primary btn-sm flex-1"
                        onClick={(e) => handleInstallBucket(bucket, e)}
                        disabled={bucketInstall.isBucketBusy(bucket.name)}
                        title={t("bucket.searchResults.installTitle")}
                      >
                        <Show
                          when={bucketInstall.isBucketInstalling(bucket.name)}
                          fallback={
                            <>
                              <Download class="w-4 h-4 mr-1" />
                              {t("bucket.searchResults.install")}
                            </>
                          }
                        >
                          <LoaderCircle class="w-4 h-4 mr-1 animate-spin" />
                          {t("bucket.searchResults.installing")}
                        </Show>
                      </button>
                    }
                  >
                    <button
                      class="btn btn-error btn-sm flex-1"
                      onClick={(e) => handleRemoveBucket(bucket.name, e)}
                      disabled={bucketInstall.isBucketBusy(bucket.name)}
                      title={t("bucket.searchResults.removingTitle")}
                    >
                      <Show
                        when={bucketInstall.isBucketRemoving(bucket.name)}
                        fallback={
                          <>
                            <Trash2 class="w-4 h-4 mr-1" />
                            {t("bucket.searchResults.remove")}
                          </>
                        }
                      >
                        <LoaderCircle class="w-4 h-4 mr-1 animate-spin" />
                        {t("bucket.searchResults.removing")}
                      </Show>
                    </button>
                  </Show>

                  <button
                    class="btn-outline btn btn-sm"
                    onClick={() => props.onBucketSelect?.(bucket)}
                    title={t("bucket.searchResults.viewDetails")}
                  >
                    {t("bucket.searchResults.details")}
                  </button>
                </div>
              </Card>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export default BucketSearchResults;