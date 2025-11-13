import { createSignal, onCleanup } from "solid-js";
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

// 全局缓存变量
let cachedBuckets: BucketInfo[] | null = null;
let isFetching = false;
const listeners: ((buckets: BucketInfo[]) => void)[] = [];

export function useBuckets() {
  const [buckets, setBuckets] = createSignal<BucketInfo[]>(cachedBuckets || []);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // 通知所有监听者
  const notifyListeners = (newBuckets: BucketInfo[]) => {
    listeners.forEach(listener => listener(newBuckets));
  };

  // 添加监听者
  const subscribe = (listener: (buckets: BucketInfo[]) => void) => {
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  };

  // 刷新缓存标志
  let shouldRefreshCache = false;

  const fetchBuckets = async (forceRefresh = false) => {
    // 如果正在获取，则直接返回
    if (isFetching && !forceRefresh) {
      return;
    }

    // 如果缓存存在且不需要强制刷新，则使用缓存
    if (cachedBuckets && !forceRefresh && !shouldRefreshCache) {
      setBuckets(cachedBuckets);
      return;
    }

    setLoading(true);
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
      setLoading(false);
    }
  };

  // 标记下次获取buckets时应该刷新缓存
  const markForRefresh = () => {
    shouldRefreshCache = true;
  };

  // 监听其他组件的刷新请求
  const unsubscribe = subscribe((newBuckets) => {
    setBuckets(newBuckets);
  });

  // 组件卸载时取消订阅
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