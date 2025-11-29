import { createSignal, onCleanup} from "solid-js";
import { invoke } from "@tauri-apps/api/core";

export interface BucketInfo {
  name: string;
  path: string;
  manifest_count: number;
  is_git_repo: boolean;
  git_url?: string;
  git_branch?: string;
  last_updated?: string;
}

interface UseBucketsReturn {
  buckets: () => BucketInfo[];
  loading: () => boolean;
  error: () => string | null;
  fetchBuckets: (forceRefresh?: boolean, quiet?: boolean) => Promise<void>;
  markForRefresh: () => void;
  getBucketInfo: (bucketName: string) => Promise<BucketInfo | null>;
  getBucketManifests: (bucketName: string) => Promise<string[]>;
}

let cachedBuckets: BucketInfo[] | null = null;
let isFetching = false;
const listeners: ((buckets: BucketInfo[]) => void)[] = [];

// Add a function to update the cache from outside the hook
export function updateBucketsCache(buckets: BucketInfo[] | null) {
  cachedBuckets = buckets;
  
  // Notify all listeners of the cache update
  listeners.forEach(listener => listener(buckets || []));
}

export function useBuckets(): UseBucketsReturn {
  // Initialize with cached data if available to avoid unnecessary loading state on page switches
  const [buckets, setBuckets] = createSignal<BucketInfo[]>(cachedBuckets || []);
  const [loading, setLoading] = createSignal(!cachedBuckets);
  const [error, setError] = createSignal<string | null>(null);

  const notifyListeners = (newBuckets: BucketInfo[]) => {
    listeners.forEach(listener => listener(newBuckets));
  };

  const subscribe = (listener: (buckets: BucketInfo[]) => void) => {
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  };

  let shouldRefreshCache = false;

  const fetchBuckets = async (forceRefresh = false, quiet = false) => {
    if (isFetching && !forceRefresh) {
      return;
    }

    if (cachedBuckets && !forceRefresh && !shouldRefreshCache) {
      setBuckets(cachedBuckets);
      if (!quiet) {
        setLoading(false);
      }
      return;
    }

    if (!quiet) {
      setLoading(true);
    }
    isFetching = true;
    setError(null);
    
    try {
      const result = await invoke<BucketInfo[]>("get_buckets");
      cachedBuckets = result;
      shouldRefreshCache = false;
      setBuckets(result);
      notifyListeners(result);
    } catch (err) {
      console.error("Failed to fetch buckets:", err);
      setError(err as string);
    } finally {
      isFetching = false;
      if (!quiet) {
        setLoading(false);
      }
    }
  };

  const markForRefresh = () => {
    shouldRefreshCache = true;
  };

  const unsubscribe = subscribe((newBuckets) => {
    setBuckets(newBuckets);
    // Only disable loading state when actually fetching data
    if (!isFetching) {
      setLoading(false);
    }
  });

  onCleanup(() => {
    unsubscribe();
  });

  const getBucketInfo = async (bucketName: string): Promise<BucketInfo | null> => {
    try {
      return await invoke<BucketInfo>("get_bucket_info", { bucketName });
    } catch (err) {
      console.error(`Failed to get info for bucket ${bucketName}:`, err);
      return null;
    }
  };

  const getBucketManifests = async (bucketName: string): Promise<string[]> => {
    try {
      return await invoke<string[]>("get_bucket_manifests", { bucketName });
    } catch (err) {
      console.error(`Failed to get manifests for bucket ${bucketName}:`, err);
      return [];
    }
  };

  return {
    buckets,
    loading,
    error,
    fetchBuckets,
    markForRefresh,
    getBucketInfo,
    getBucketManifests,
  };
}