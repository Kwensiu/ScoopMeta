import { For, Show } from "solid-js";
import { ScoopPackage } from "../../../types/scoop";
import { Download } from "lucide-solid";
import { t } from "../../../i18n";

interface SearchResultsListProps {
    loading: boolean;
    results: ScoopPackage[];
    searchTerm: string;
    activeTab: "packages" | "includes";
    onViewInfo: (pkg: ScoopPackage) => void;
    onInstall: (pkg: ScoopPackage) => void;
    onPackageStateChanged?: () => void; // Callback for when package state changes
    currentPage: number;
    onPageChange: (page: number) => void;
}

function SearchResultsList(props: SearchResultsListProps) {

    const ITEMS_PER_PAGE = 8;

    const totalPages = () => Math.ceil(props.results.length / ITEMS_PER_PAGE);

    const paginatedResults = () => {
        const startIndex = (props.currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        return props.results.slice(startIndex, endIndex);
    };

    return (
        <div class="relative">
            <Show
                when={!props.loading && props.results.length === 0 && props.searchTerm.length > 1}
            >
                <div class="text-center py-16">
                    <p class="text-xl">
                        {t("search.results.noPackagesFound", {
                            type: t(`search.tabs.${props.activeTab === "packages" ? "packages" : "includes"}`),
                            query: props.searchTerm
                        })}
                    </p>
                </div>
            </Show>

            <div class="space-y-4 min-h-0">
                <For each={paginatedResults()}>
                    {(pkg) => (
                        <div
                            class="card bg-base-200 shadow-xl cursor-pointer transition-all duration-200 transform hover:scale-101"
                            onClick={() => props.onViewInfo(pkg)}
                        >
                            <div class="card-body">
                                <div class="flex justify-between items-start">
                                    <div class="flex-grow min-w-0">
                                        <h3 class="card-title truncate">{pkg.name}</h3>
                                        <p class="truncate">
                                            {t("search.results.fromBucket", { bucket: pkg.source })}
                                        </p>
                                    </div>
                                    <div class="flex-shrink-0 ml-4 text-right flex items-center gap-2">
                                        <span class="badge badge-primary badge-soft whitespace-nowrap">
                                            {pkg.version}
                                        </span>
                                        {pkg.is_installed ? (
                                            <span class="badge badge-success whitespace-nowrap">Installed</span>
                                        ) : (
                                            <button
                                                class="btn btn-sm btn-ghost"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    props.onInstall(pkg);
                                                }}
                                            >
                                                <Download class="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <Show when={pkg.info}>
                                    <p class="text-base-content/70 mt-2 line-clamp-2 overflow-hidden">
                                        {pkg.info}
                                    </p>
                                </Show>
                            </div>
                        </div>
                    )}
                </For>
            </div>

            {/* 分页控件 */}
            <Show when={props.results.length > ITEMS_PER_PAGE}>
                <div class="flex justify-center items-center mt-6 space-x-2">
                    <button
                        class="btn btn-sm"
                        disabled={props.currentPage <= 1}
                        onClick={() => props.onPageChange(props.currentPage - 1)}
                    >
                        &lt;
                    </button>

                    <span class="text-sm">
                        {t("search.results.pageInfo", {
                            current: props.currentPage,
                            total: totalPages()
                        })}
                    </span>

                    <button
                        class="btn btn-sm"
                        disabled={props.currentPage >= totalPages()}
                        onClick={() => props.onPageChange(props.currentPage + 1)}
                    >
                        &gt;
                    </button>
                </div>
            </Show>
        </div>
    );
}

export default SearchResultsList;