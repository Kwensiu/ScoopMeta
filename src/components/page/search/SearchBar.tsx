import { Accessor, Setter, Show } from "solid-js";
import { CircleQuestionMark, Search, X, LoaderCircle } from "lucide-solid";

interface SearchBarProps {
    searchTerm: Accessor<string>;
    setSearchTerm: Setter<string>;
    loading?: Accessor<boolean>;
}

function SearchBar(props: SearchBarProps) {
    return (
        <div class="relative w-full">
            <span class="absolute inset-y-0 left-0 flex items-center pl-3 z-10">
                <Show when={props.loading?.()} fallback={<Search class="h-5 w-5 text-gray-400" />}>
                    <LoaderCircle class="h-5 w-5 text-gray-400 animate-spin" />
                </Show>
            </span>

            <input
                type="text"
                placeholder="Search for apps from local Buckets"
                class="input bg-base-400 input-bordered w-full pl-10 pr-10 relative"
                value={props.searchTerm()}
                onInput={(e) => props.setSearchTerm(e.currentTarget.value)}
            />

            <div class="absolute inset-y-0 right-0 flex items-center pr-3">
                <span
                    class="tooltip tooltip-left"
                    data-tip={'Wrap with "quotes" for exact match'}
                >
                    <CircleQuestionMark size={16} class="text-gray-400" />
                </span>
            </div>
        </div>
    );
}

export default SearchBar;