import { Show } from "solid-js";
import { RefreshCw, Eye } from "lucide-solid";
import { BucketInfo } from "../../../hooks/useBuckets";
import { openPath } from '@tauri-apps/plugin-opener';
import Card from "../../common/Card";

interface BucketCardProps {
  bucket: BucketInfo;
  onViewBucket: (bucket: BucketInfo) => void;
  onUpdateBucket?: (bucketName: string) => void;
  isUpdating?: boolean;
  updateResult?: string;
}

function BucketCard(props: BucketCardProps) {
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "Unknown";
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div class="relative">
      <Show when={props.bucket.git_branch}>
        <div class="badge badge-outline badge-sm absolute top-[21px] right-[16px] z-10">
          {props.bucket.git_branch}
        </div>
      </Show>
      
      <Card
        title={
          <h3 class="whitespace-nowrap overflow-hidden text-ellipsis max-w-full" title={props.bucket.name}>
            {props.bucket.name}
          </h3>
        }
        description={
          <div class="text-sm text-base-content/70">
            <div class="flex items-center gap-1 mb-1">
              <span class="font-bold text-primary text-xl">
                {props.bucket.manifest_count}
              </span>
              <span class="text-sm">packages</span>
            </div>
            <Show when={props.bucket.last_updated}>
              <div class="text-xs text-base-content/50">
                Updated {formatDate(props.bucket.last_updated)}
              </div>
            </Show>
          </div>
        }
        class="bg-base-200 shadow-sm hover:shadow-md transition-all duration-200 border border-base-300"
      >
        <Show when={props.bucket.git_url}>
          <div 
            class="text-xs text-base-content/40 mt-2 truncate font-mono bg-base-100 px-2 py-1 rounded cursor-pointer hover:underline"
            onClick={() => openPath(props.bucket.git_url!)}
            title={props.bucket.git_url}
          >
            {props.bucket.git_url}
          </div>
        </Show>
        
        {/* Update result message */}
        <Show when={props.updateResult}>
          <div class="mt-2 text-xs p-2 rounded bg-base-100 border">
            {props.updateResult}
          </div>
        </Show>
        
        {/* Action buttons */}
        <div class="flex gap-2 mt-3">
          <button 
            class="btn btn-primary btn-sm flex-1 gap-2"
            onClick={() => props.onViewBucket(props.bucket)}
          >
            <Eye class="w-4 h-4" />
            View
          </button>
          
          <Show when={props.bucket.is_git_repo && props.onUpdateBucket}>
            <button 
              class="btn btn-secondary btn-sm gap-2"
              onClick={(e) => {
                e.stopPropagation();
                props.onUpdateBucket!(props.bucket.name);
              }}
              disabled={props.isUpdating}
            >
              <Show when={props.isUpdating}
                fallback={<RefreshCw class="w-4 h-4" />}
              >
                <span class="loading loading-spinner loading-xs"></span>
              </Show>
              {props.isUpdating ? "Updating..." : "Update"}
            </button>
          </Show>
        </div>
      </Card>
    </div>
  );
}

export default BucketCard;