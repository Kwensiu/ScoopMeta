import { Show, For } from "solid-js";
import { RefreshCw, X } from "lucide-solid";
import { BucketInfo } from "../../../hooks/useBuckets";
import BucketCard from "./BucketCard";
import { t } from "../../../i18n";

interface BucketGridProps {
  buckets: BucketInfo[];
  onViewBucket: (bucket: BucketInfo) => void;
  onRefresh?: () => void;
  onUpdateBucket?: (bucketName: string) => void;
  onUpdateAll?: () => void;
  onCancelUpdateAll?: () => void;
  updatingBuckets?: Set<string>;
  updateResults?: { [key: string]: string };
  loading?: boolean;
  isUpdatingAll?: boolean;
  isCancelling?: boolean;
}

function BucketGrid(props: BucketGridProps) {
  return (
    <>
      <div class="flex justify-between items-center mb-4">
        <h2 class="card-title">{t("bucket.grid.title")}</h2>
        <Show when={props.onUpdateAll && props.buckets.some(b => b.is_git_repo)}>
          <div class="flex gap-2">
            <Show
              when={!props.isUpdatingAll}
              fallback={
                <button
                  class="btn btn-warning btn-sm gap-2"
                  onClick={props.onCancelUpdateAll}
                  disabled={props.isCancelling}
                >
                  <X class="w-4 h-4" />
                  {props.isCancelling ? t("bucket.grid.cancelling") : t("bucket.grid.cancel")}
                </button>
              }
            >
              <button
                class="btn btn-secondary btn-sm gap-2"
                onClick={props.onUpdateAll}
                disabled={props.updatingBuckets && props.updatingBuckets.size > 0}
              >
                <RefreshCw class="w-4 h-4" />
                {t("bucket.grid.updateAllGit")}
              </button>
            </Show>
            <Show when={props.onRefresh}>
              <button
                class="btn btn-outline btn-sm gap-2"
                onClick={props.onRefresh}
              >
                <RefreshCw class="w-4 h-4" />
                {t("bucket.grid.reloadLocal")}
              </button>
            </Show>
          </div>
        </Show>
      </div>

      <Show when={props.loading}>
        <div class="flex justify-center items-center py-8">
          <span class="loading loading-spinner loading-md"></span>
          <span class="ml-2">{t("bucket.grid.loading")}</span>
        </div>
      </Show>

      <Show when={!props.loading}>
        <Show when={props.buckets.length > 0} fallback={
          <div class="text-center py-8">
            <p class="text-base-content/70">{t("bucket.grid.noBucketsFound")}</p>
            <p class="text-sm text-base-content/50 mt-2">
              {t("bucket.grid.noBucketsDescription")}
            </p>
            <Show when={props.onRefresh}>
              <div class="mt-4">
                <button class="btn btn-primary" onClick={props.onRefresh}>
                  {t("bucket.grid.refresh")}
                </button>
              </div>
            </Show>
          </div>
        }>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <For each={props.buckets}>
              {(bucket) => (
                <BucketCard
                  bucket={bucket}
                  onViewBucket={props.onViewBucket}
                  onUpdateBucket={props.onUpdateBucket}
                  isUpdating={props.updatingBuckets?.has(bucket.name) || false}
                  updateResult={props.updateResults?.[bucket.name]}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>
    </>
  );
}

export default BucketGrid;