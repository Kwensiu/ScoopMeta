import { createSignal, createResource, createEffect, on } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Resource } from "solid-js";

export interface SearchableBucket {
  name: string;
  full_name: string;
  description: string;
  url: string;
  stars: number;
  forks: number;
  apps: number;
  last_updated: string;
  is_verified: boolean;
}

export interface BucketSearchRequest {
  query?: string;
  include_expanded: boolean;
  max_results?: number;
  sort_by?: string;
  disable_chinese_buckets?: boolean;
  minimum_stars?: number;
}

export interface BucketSearchResponse {
  buckets: SearchableBucket[];
  total_count: number;
  is_expanded_search: boolean;
  expanded_list_size_mb?: number;
}

export interface ExpandedSearchInfo {
  estimated_size_mb: number;
  total_buckets: number;
  description: string;
}

interface UseBucketSearchReturn {
  // State
  searchQuery: () => string;
  setSearchQuery: (query: string) => void;
  includeExpanded: () => boolean;
  setIncludeExpanded: (include: boolean) => void;
  sortBy: () => string;
  setSortBy: (sort: string) => void;
  maxResults: () => number;
  setMaxResults: (max: number) => void;
  disableChineseBuckets: () => boolean;
  setDisableChineseBuckets: (disable: boolean) => void;
  minimumStars: () => number;
  setMinimumStars: (stars: number) => void;
  
  // Results
  searchResults: () => SearchableBucket[];
  totalCount: () => number;
  isExpandedSearch: () => boolean;
  expandedListSizeMb: () => number | undefined;
  isSearching: () => boolean;
  error: () => string | null;
  cacheExists: () => boolean;
  
  // Default buckets
  defaultBuckets: Resource<SearchableBucket[]>;
  
  // Actions
  searchBuckets: (
    query?: string, 
    includeExpanded?: boolean, 
    maxResults?: number, 
    sortBy?: string, 
    disableChineseBuckets?: boolean, 
    minimumStars?: number
  ) => Promise<BucketSearchResponse | undefined>;
  clearSearch: () => Promise<void>;
  loadDefaults: () => Promise<void>;
  disableExpandedSearch: () => Promise<void>;
  checkCacheStatus: () => Promise<boolean>;
  getExpandedSearchInfo: () => Promise<ExpandedSearchInfo | null>;
}

export function useBucketSearch(): UseBucketSearchReturn {
  const [searchQuery, setSearchQuery] = createSignal<string>("");
  const [includeExpanded, setIncludeExpanded] = createSignal(false);
  const [sortBy, setSortBy] = createSignal<string>("stars"); // Default to stars instead of relevance
  const [maxResults, setMaxResults] = createSignal<number>(50);
  const [disableChineseBuckets, setDisableChineseBuckets] = createSignal(false);
  const [minimumStars, setMinimumStars] = createSignal(2);
  const [isSearching, setIsSearching] = createSignal(false);
  const [searchResults, setSearchResults] = createSignal<SearchableBucket[]>([]);
  const [totalCount, setTotalCount] = createSignal(0);
  const [isExpandedSearch, setIsExpandedSearch] = createSignal(false);
  const [expandedListSizeMb, setExpandedListSizeMb] = createSignal<number | undefined>(undefined);
  const [error, setError] = createSignal<string | null>(null);
  const [cacheExists, setCacheExists] = createSignal(false);

  // Check if cache exists on mount
  const checkCacheStatus = async () => {
    try {
      const exists = await invoke<boolean>("check_bucket_cache_exists");
      setCacheExists(exists);
      setIsExpandedSearch(exists);
      
      // IMPORTANT: If cache exists, we should be using expanded search
      if (exists) {
        setIncludeExpanded(true);
        console.log("Cache exists - automatically enabling expanded search");
      }
      
      return exists;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      return false;
    }
  };

  // Load default buckets on initialization
  const [defaultBuckets] = createResource(async () => {
    try {
      // First check if cache exists
      const cacheExistsStatus = await checkCacheStatus();
      
      if (cacheExistsStatus) {
        // If cache exists, load expanded results immediately with stars sorting
        console.log("Cache exists, loading expanded search results...");
        setIncludeExpanded(true); // Ensure expanded search is enabled
        const expandedResults = await searchBuckets(undefined, true, undefined, "stars");
        return expandedResults?.buckets || [];
      } else {
        // No cache, load default verified buckets (they should already be sorted by stars on backend)
        console.log("No cache, loading default buckets...");
        setIncludeExpanded(false); // Ensure we're in default mode
        const buckets = await invoke<SearchableBucket[]>("get_default_buckets");
        setSearchResults(buckets);
        setTotalCount(buckets.length);
        return buckets;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      return [];
    }
  });

  // Get expanded search info
  const getExpandedSearchInfo = async (): Promise<ExpandedSearchInfo | null> => {
    try {
      return await invoke<ExpandedSearchInfo>("get_expanded_search_info");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      return null;
    }
  };

  // Perform search
  const searchBuckets = async (
    query?: string,
    includeExpandedParam?: boolean,
    maxResultsParam?: number,
    sortByParam?: string,
    disableChineseBucketsParam?: boolean,
    minimumStarsParam?: number
  ): Promise<BucketSearchResponse | undefined> => {
    setIsSearching(true);
    setError(null);
    
    const actualIncludeExpanded = includeExpandedParam !== undefined ? includeExpandedParam : includeExpanded();
    const actualMaxResults = maxResultsParam !== undefined ? maxResultsParam : maxResults();
    const actualSortBy = sortByParam !== undefined ? sortByParam : sortBy();
    const actualDisableChineseBuckets = disableChineseBucketsParam !== undefined ? disableChineseBucketsParam : disableChineseBuckets();
    const actualMinimumStars = minimumStarsParam !== undefined ? minimumStarsParam : minimumStars();
    
    try {
      const request: BucketSearchRequest = {
        query,
        include_expanded: actualIncludeExpanded,
        max_results: actualMaxResults,
        sort_by: actualSortBy,
        disable_chinese_buckets: actualDisableChineseBuckets,
        minimum_stars: actualMinimumStars,
      };
      
      const response = await invoke<BucketSearchResponse>("search_buckets", {
        request,
      });
      
      setSearchResults(response.buckets);
      setTotalCount(response.total_count);
      setIsExpandedSearch(response.is_expanded_search);
      setExpandedListSizeMb(response.expanded_list_size_mb);
      
      // Update cache status if expanded search was performed
      if (response.is_expanded_search) {
        setCacheExists(true);
      }
      
      return response;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      console.error("Bucket search failed:", errorMsg);
      return undefined;
    } finally {
      setIsSearching(false);
    }
  };

  // Clear search and return to defaults
  const clearSearch = async () => {
    setSearchQuery("");
    setSearchResults([]);
    setTotalCount(0);
    setError(null);
    setIsExpandedSearch(false);
    setExpandedListSizeMb(undefined);
    
    // Reload default buckets
    await loadDefaults();
  };

  // Disable expanded search and clear cache
  const disableExpandedSearch = async () => {
    console.log("Disabling expanded search and clearing cache...");
    try {
      await invoke("clear_bucket_cache");
      setCacheExists(false);
      setIncludeExpanded(false);
      setIsExpandedSearch(false);
      setExpandedListSizeMb(undefined);
      setSearchQuery("");
      setSearchResults([]);
      setTotalCount(0);
      
      // Reload default buckets
      await loadDefaults();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      console.error("Failed to disable expanded search:", errorMsg);
    }
  };

  // Load defaults explicitly (for when search is reopened)
  const loadDefaults = async () => {
    try {
      console.log("Loading default buckets...");
      
      // Check cache status first
      const cacheExistsStatus = await checkCacheStatus();
      
      if (cacheExistsStatus) {
        // If cache exists, load expanded results immediately with stars sorting
        console.log("Cache exists, loading expanded search results...");
        setIncludeExpanded(true); // Ensure expanded search is enabled
        await searchBuckets(undefined, true, undefined, "stars"); // Explicit stars sorting
      } else {
        // No cache, load default verified buckets
        console.log("Loading default verified buckets...");
        setIncludeExpanded(false); // Ensure we're in default mode
        const buckets = await invoke<SearchableBucket[]>("get_default_buckets");
        setSearchResults(buckets);
        setTotalCount(buckets.length);
        setIsExpandedSearch(false);
        setExpandedListSizeMb(undefined);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
    }
  };

  // Debounced search effect like in useSearch.ts
  let debounceTimer: ReturnType<typeof setTimeout>;
  const handleSearch = async () => {
    if (searchQuery().trim() === "") {
      await clearSearch();
      return;
    }
    await searchBuckets(searchQuery());
  };

  createEffect(on(searchQuery, () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => handleSearch(), 300);
  }));

  return {
    // State
    searchQuery,
    setSearchQuery,
    includeExpanded,
    setIncludeExpanded,
    sortBy,
    setSortBy,
    maxResults,
    setMaxResults,
    disableChineseBuckets,
    setDisableChineseBuckets,
    minimumStars,
    setMinimumStars,
    
    // Results
    searchResults,
    totalCount,
    isExpandedSearch,
    expandedListSizeMb,
    isSearching,
    error,
    cacheExists,
    
    // Default buckets
    defaultBuckets,
    
    // Actions
    searchBuckets,
    clearSearch,
    loadDefaults,
    disableExpandedSearch,
    checkCacheStatus,
    getExpandedSearchInfo,
  };
}