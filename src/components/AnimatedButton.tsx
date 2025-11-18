import { createSignal, Show, createEffect } from "solid-js";

interface AnimatedButtonProps {
  onClick?: () => void | Promise<void>;
  defaultText?: string;
  loadingText?: string;
  successText?: string;
  tooltip?: string;
  initialState?: "circle" | "expanded";
  onWidthChange?: (width: number) => void;
}

const AnimatedButton = (props: AnimatedButtonProps) => {
  const [isHovered, setIsHovered] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [isSuccess, setIsSuccess] = createSignal(false);
  const [buttonWidth, setButtonWidth] = createSignal(props.initialState === "expanded" ? 128 : 48);
  const [shouldHideText, setShouldHideText] = createSignal(false);

  const defaultText = props.defaultText || "Update ALL";
  const loadingText = props.loadingText || "Updating...";
  const successText = props.successText || "Finish!";
  const tooltip = props.tooltip || "Update All Packages";

  // Calculate button width based on text content
  const calculateWidth = () => {
    if (isLoading()) return getTextWidth(loadingText);
    if (isSuccess()) return getTextWidth(successText);
    if (isHovered() && !isLoading() && !isSuccess() && !shouldHideText()) return getTextWidth(defaultText);
    
    // Circle width
    return props.initialState === "expanded" ? getTextWidth(defaultText) : 48; // 默认为圆形
  };

  // Estimate text width in pixels (approximate)
  const getTextWidth = (text: string) => {
    // Rough estimation: average character width is about 8px + padding
    const baseWidth = text.length * 8;
    return Math.max(48, baseWidth + 32); // Minimum 48px, add padding
  };

  // Update button width when state changes
  createEffect(() => {
    const newWidth = calculateWidth();
    setButtonWidth(newWidth);
    if (props.onWidthChange) {
      props.onWidthChange(newWidth);
    }
  });

  const handleClick = () => {
    if (props.onClick) {
      setIsLoading(true);
      setShouldHideText(false);
      
      const result = props.onClick();
      
      // Check if result is a Promise
      if (result && typeof result.then === 'function') {
        result.then(() => {
          finishProcess();
        }).catch(() => {
          finishProcess();
        });
      } else {
        // If not a Promise, handle completion state directly
        finishProcess();
      }
    }
  };

  const finishProcess = () => {
    setIsLoading(false);
    setIsSuccess(true);
    
    // Reset button state after 3 seconds
    setTimeout(() => {
      setIsSuccess(false);
      // When finishing, briefly hide text to transition directly to circle state
      setShouldHideText(true);
      // Reset shouldHideText after a short delay
      setTimeout(() => {
        setShouldHideText(false);
      }, 100);
    }, 3000);
  };

  // Determine button classes based on state
  const getButtonClasses = () => {
    const baseClasses = "fixed bottom-14 right-6 shadow-lg z-50 tooltip tooltip-left transform transition-all duration-300 ease-in-out overflow-hidden rounded-full";
    
    if (isLoading() || isSuccess()) {
      return `${baseClasses} px-4 h-12 bg-success`;
    }
    
    if (isHovered() && !isLoading() && !isSuccess() && !shouldHideText()) {
      return `${baseClasses} px-4 h-12 bg-primary hover:bg-primary-focus text-primary-content`;
    }
    
    return `${baseClasses} h-12 bg-primary hover:bg-primary-focus`;
  };

  // Determine icon classes based on state
  const getIconClasses = () => {
    const baseClasses = "absolute inset-0 m-auto transition-all duration-300 ease-in-out w-6 h-6";
    
    if (isLoading() || isSuccess()) {
      return `${baseClasses} opacity-0 scale-90`;
    }
    
    if (isHovered() && !isLoading() && !isSuccess() && !shouldHideText()) {
      return `${baseClasses} opacity-0 scale-90`;
    }
    
    return `${baseClasses} opacity-100 scale-100`;
  };

  // Determine text classes based on state
  const getTextClasses = () => {
    const baseClasses = "transition-all duration-300 ease-in-out whitespace-nowrap text-center";
    
    // If should hide text, always hide
    if (shouldHideText()) {
      return `${baseClasses} opacity-0`;
    }
    
    if (isLoading() || isSuccess()) {
      return `${baseClasses} opacity-100 delay-150`;
    }
    
    if (isHovered() && !isLoading() && !isSuccess() && !shouldHideText()) {
      return `${baseClasses} opacity-100 delay-150`;
    }
    
    return `${baseClasses} opacity-0`;
  };

  return (
    <button 
      class={getButtonClasses()}
      style={{ width: `${buttonWidth()}px` }}
      data-tip={tooltip}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      disabled={isLoading()}
    >
      <div class="flex items-center justify-center relative w-full h-full">
        {/* Refresh icon that fades out on hover and fades in when not hovering */}
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          class={getIconClasses()}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        
        {/* Text that appears on hover and during operations */}
        <span class={getTextClasses()}>
          <Show when={isLoading()} fallback={
            <Show when={isSuccess()} fallback={defaultText}>
              {successText}
            </Show>
          }>
            {loadingText}
          </Show>
        </span>
      </div>
    </button>
  );
};

export default AnimatedButton;