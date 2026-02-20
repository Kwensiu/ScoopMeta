import { createSignal, onMount, For, Show, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Trash2, Archive, RefreshCw, TriangleAlert, Inbox, Folder, Database } from "lucide-solid";
import { formatBytes } from "../../../utils/format";
import ConfirmationModal from "../../ConfirmationModal";
import Card from "../../common/Card";
import { t } from "../../../i18n";

interface CacheEntry {
    name: string;
    version: string;
    length: number;
    fileName: string;
}

// A unique identifier for a cache entry
type CacheIdentifier = string;

export interface CacheManagerProps {
    onOpenDirectory?: () => void;
    onCleanupApps?: () => void;
    onCleanupCache?: () => void;
}

function getCacheIdentifier(entry: CacheEntry): CacheIdentifier {
    // Using the full filename for uniqueness
    return entry.fileName;
}

function CacheManager(props: CacheManagerProps) {
    const [cacheContents, setCacheContents] = createSignal<CacheEntry[]>([]);
    const [selectedItems, setSelectedItems] = createSignal<Set<CacheIdentifier>>(new Set());
    const [filter, setFilter] = createSignal("");
    const [isLoading, setIsLoading] = createSignal(true);
    const [error, setError] = createSignal<string | null>(null);

    // State for the confirmation modal
    const [isConfirmModalOpen, setIsConfirmModalOpen] = createSignal(false);
    const [confirmationDetails, setConfirmationDetails] = createSignal({
        onConfirm: () => { },
        title: "",
        content: null as any,
    });

    const filteredCacheContents = createMemo(() => {
        const f = filter().toLowerCase();
        if (!f) return cacheContents();
        return cacheContents().filter(s =>
            s.name.toLowerCase().includes(f) ||
            s.version.toLowerCase().includes(f)
        );
    });

    const isAllSelected = createMemo(() => {
        const contents = filteredCacheContents();
        if (contents.length === 0) return false;
        return contents.every(item => selectedItems().has(getCacheIdentifier(item)));
    });

    const fetchCacheContents = async () => {
        setIsLoading(true);
        setError(null);
        setSelectedItems(new Set<CacheIdentifier>());
        try {
            const result = await invoke<CacheEntry[]>("list_cache_contents");
            setCacheContents(result);
        } catch (err) {
            console.error("Failed to fetch cache contents:", err);
            setError(typeof err === 'string' ? err : "An unknown error occurred while fetching cache contents.");
        } finally {
            setIsLoading(false);
        }
    };

    onMount(fetchCacheContents);

    const toggleSelection = (identifier: CacheIdentifier) => {
        setSelectedItems(prev => {
            const next = new Set(prev);
            if (next.has(identifier)) {
                next.delete(identifier);
            } else {
                next.add(identifier);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        const currentItems = filteredCacheContents();
        const currentIdentifiers = new Set(currentItems.map(getCacheIdentifier));

        // If all currently visible items are selected, unselect them.
        // Otherwise, select all currently visible items.
        const allVisibleSelected = currentItems.every(item => selectedItems().has(getCacheIdentifier(item)));

        if (allVisibleSelected && currentItems.length > 0) {
            // Unselect only the visible items
            setSelectedItems(prev => {
                const next = new Set(prev);
                currentIdentifiers.forEach(id => next.delete(id));
                return next;
            });
        } else {
            // Select all visible items, adding to any existing selection
            setSelectedItems(prev => new Set([...prev, ...currentIdentifiers]));
        }
    };

    const handleClearSelected = () => {
        const selectedFiles = [...selectedItems()];
        if (selectedFiles.length === 0) return;

        const packageNames = Array.from(new Set(
            selectedFiles.map(id => id.split('@')[0])
        )).sort();

        setConfirmationDetails({
            title: t('doctor.cacheManager.confirmDeletion'),
            content: (
                <>
                    <p>{t('doctor.cacheManager.deleteFiles', { count: selectedFiles.length, packageCount: packageNames.length })}</p>
                    <ul class="list-disc list-inside bg-base-100 p-2 rounded-md max-h-40 overflow-y-auto">
                        <For each={packageNames}>{(name) => <li>{name}</li>}</For>
                    </ul>
                    <p>{t('doctor.cacheManager.actionCannotBeUndone')}</p>
                </>
            ),
            onConfirm: async () => {
                setIsLoading(true);
                try {
                    await invoke("clear_cache", { files: selectedFiles });
                } catch (err) {
                    console.error("Failed to clear selected cache items:", err);
                    setError(typeof err === 'string' ? err : "An unknown error occurred while clearing cache.");
                } finally {
                    await fetchCacheContents();
                }
            }
        });

        setIsConfirmModalOpen(true);
    };

    const handleClearAll = () => {
        setConfirmationDetails({
            title: t('doctor.cacheManager.confirmDeletion'),
            content: <p>{t('doctor.cacheManager.deleteAll', { count: cacheContents().length })}</p>,
            onConfirm: async () => {
                setIsLoading(true);
                try {
                    await invoke("clear_cache", { files: null });
                } catch (err) {
                    console.error("Failed to clear all cache items:", err);
                    setError(typeof err === 'string' ? err : "An unknown error occurred while clearing cache.");
                } finally {
                    await fetchCacheContents();
                }
                setIsConfirmModalOpen(false);
            }
        });

        setIsConfirmModalOpen(true);
    };

    return (
        <>
            <Card
                title={t('doctor.cacheManager.title')}
                icon={Database}
                headerAction={
                    <div class="flex items-center gap-2">
                        <Show when={cacheContents().length > 0}>
                            <button
                                class="btn btn-warning btn-sm"
                                onClick={handleClearSelected}
                                disabled={selectedItems().size === 0 || isLoading()}
                            >
                                <Trash2 class="w-4 h-4" />
                                {t('buttons.removeSelected')} ({selectedItems().size})
                            </button>
                            <button
                                class="btn btn-error btn-sm"
                                onClick={handleClearAll}
                                disabled={isLoading()}
                            >
                                <Archive class="w-4 h-4" />
                                {t('buttons.removeAll')}
                            </button>
                            <div class="divider divider-horizontal m-1" />
                        </Show>
                        <Show when={props.onOpenDirectory}>
                            <button
                                class="btn btn-ghost btn-sm"
                                onClick={props.onOpenDirectory}
                                title={t('doctor.cacheManager.openCacheDirectory')}
                            >
                                <Folder class="w-5 h-5" />
                            </button>
                        </Show>
                        <button
                            class="btn btn-ghost btn-sm"
                            onClick={fetchCacheContents}
                            disabled={isLoading()}
                        >
                            <RefreshCw class="w-5 h-5" classList={{ "animate-spin": isLoading() }} />
                        </button>
                    </div>
                }
            >
                <input
                    type="text"
                    placeholder={t('doctor.cacheManager.filterPlaceholder')}
                    class="input input-bordered w-full mt-2 mb-4"
                    value={filter()}
                    onInput={(e) => setFilter(e.currentTarget.value)}
                    disabled={isLoading() || !!error() || cacheContents().length === 0}
                />

                <div class="max-h-[60vh] overflow-y-auto">
                    <Show when={error()}>
                        <div role="alert" class="alert alert-error">
                            <TriangleAlert />
                            <span>{error()}</span>
                        </div>
                    </Show>

                    <Show when={!isLoading() && cacheContents().length === 0 && !error()}>
                        <div class="text-center p-8">
                            <Inbox class="w-16 h-16 mx-auto text-base-content/30" />
                            <p class="mt-4 text-lg font-semibold">{t('doctor.cacheManager.cacheIsEmpty')}</p>
                            <p class="text-base-content/60">{t('doctor.cacheManager.noCachedFiles')}</p>
                        </div>
                    </Show>

                    <Show when={cacheContents().length > 0}>
                        <div class="overflow-x-auto">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>
                                            <label>
                                                <input
                                                    type="checkbox"
                                                    class="checkbox checkbox-primary"
                                                    checked={isAllSelected()}
                                                    onChange={toggleSelectAll}
                                                />
                                            </label>
                                        </th>
                                        <th>{t('doctor.cacheManager.name')}</th>
                                        <th>{t('doctor.cacheManager.version')}</th>
                                        <th>{t('doctor.cacheManager.size')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <For each={filteredCacheContents()}>
                                        {(item) => {
                                            const id = getCacheIdentifier(item);
                                            return (
                                                <tr class="hover">
                                                    <td>
                                                        <label>
                                                            <input
                                                                type="checkbox"
                                                                class="checkbox checkbox-primary"
                                                                checked={selectedItems().has(id)}
                                                                onChange={() => toggleSelection(id)}
                                                            />
                                                        </label>
                                                    </td>
                                                    <td>{item.name}</td>
                                                    <td>{item.version}</td>
                                                    <td>{formatBytes(item.length)}</td>
                                                </tr>
                                            );
                                        }}
                                    </For>
                                </tbody>
                            </table>
                        </div>
                    </Show>
                </div>
            </Card>

            <ConfirmationModal
                isOpen={isConfirmModalOpen()}
                title={confirmationDetails().title}
                confirmText={t('doctor.cacheManager.delete')}
                onConfirm={() => {
                    confirmationDetails().onConfirm();
                    setIsConfirmModalOpen(false);
                }}
                onCancel={() => setIsConfirmModalOpen(false)}
            >
                {confirmationDetails().content}
            </ConfirmationModal>
        </>
    );
}

export default CacheManager;