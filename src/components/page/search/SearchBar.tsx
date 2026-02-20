import { Accessor, Setter, Show } from "solid-js";
import { CircleQuestionMark, Search, X } from "lucide-solid";
import { t } from "../../../i18n";

interface SearchBarProps {
    searchTerm: Accessor<string>;
    setSearchTerm: Setter<string>;
}

function SearchBar(props: SearchBarProps) {
    return (
        <div class="relative w-full">
            <span class="absolute inset-y-0 left-0 flex items-center pl-3 z-10">
                <Search class="h-5 w-5 text-gray-400" />
            </span>

            <input
                type="text"
                placeholder={t("search.bar.placeholder")}
                class="input bg-base-400 input-bordered w-full pl-10 pr-16 relative"
                value={props.searchTerm()}
                onInput={(e) => props.setSearchTerm(e.currentTarget.value)}
            />
            <div class="absolute inset-y-0 right-0 flex items-center pr-3 space-x-2">
                <Show when={props.searchTerm().length > 0}>
                    <button
                        onClick={() => props.setSearchTerm("")}
                        class="p-1 mr-1 rounded-full text-gray-500 hover:text-base-700 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none"
                        aria-label={t("search.bar.clearSearch")}
                    >
                        <X class="h-5 w-5" />
                    </button>
                </Show>
                <span
                    class="tooltip tooltip-left"
                    data-tip={t("search.bar.exactMatchTooltip")}
                >
                    <CircleQuestionMark size={16} class="text-gray-400" />
                </span>
            </div>

        </div>
    );
}

export default SearchBar;