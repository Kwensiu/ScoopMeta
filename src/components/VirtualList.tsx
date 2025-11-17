import { 
  createSignal,
  onMount,
  onCleanup,
  JSX,
  For,
  createMemo
} from "solid-js";

interface VirtualListProps<T> {
  items: T[];
  rowHeight: number;
  renderItem: (item: T, index: number) => JSX.Element;
  overscanCount?: number;
  class?: string;
  style?: JSX.CSSProperties;
}

function VirtualList<T>(props: VirtualListProps<T>) {
  const overscanCount = props.overscanCount ?? 5;
  
  let scrollElement: HTMLDivElement | undefined;
  
  const [scrollTop, setScrollTop] = createSignal(0);
  const [containerHeight, setContainerHeight] = createSignal(0);
  
  // Calculate the start index of the visible area
  const startindex = createMemo(() => {
    const startNode = Math.floor(scrollTop() / props.rowHeight);
    const start = Math.max(0, startNode - overscanCount);
    return start;
  });
  
  // Calculate the end index of the visible area
  const endindex = createMemo(() => {
    const visibleCount = Math.ceil(containerHeight() / props.rowHeight);
    const endNode = startindex() + visibleCount;
    const end = Math.min(props.items.length - 1, endNode + overscanCount);
    return end;
  });
  
  // Calculate items in the visible area
  const visibleItems = createMemo(() => {
    return props.items.slice(startindex(), endindex() + 1);
  });
  
  // Calculate total height
  const totalHeight = createMemo(() => {
    return props.items.length * props.rowHeight;
  });
  
  // Calculate offset
  const offsetY = createMemo(() => {
    return startindex() * props.rowHeight;
  });
  
  // Handle scroll events
  const handleScroll = (event: Event) => {
    const target = event.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
  };
  
  // Update container height
  const updateContainerHeight = () => {
    if (scrollElement) {
      setContainerHeight(scrollElement.clientHeight);
    }
  };
  
  // Listen to window resize events
  const handleResize = () => {
    updateContainerHeight();
  };
  
  onMount(() => {
    updateContainerHeight();
    window.addEventListener('resize', handleResize);
  });
  
  onCleanup(() => {
    window.removeEventListener('resize', handleResize);
  });
  
  return (
    <div 
      ref={scrollElement}
      class={props.class}
      style={{
        overflow: 'auto',
        ...props.style
      }}
      onScroll={handleScroll}
    >
      <div
        style={{
          height: `${totalHeight()}px`,
          position: 'relative'
        }}
      >
        <div
          style={{
            transform: `translateY(${offsetY()}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0
          }}
        >
          <For each={visibleItems()}>
            {(item, index) => {
              const actualIndex = startindex() + index();
              return props.renderItem(item, actualIndex);
            }}
          </For>
        </div>
      </div>
    </div>
  );
}

export default VirtualList;