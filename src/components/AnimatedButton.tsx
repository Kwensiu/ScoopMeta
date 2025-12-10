import { createSignal, Show, createEffect, createMemo } from "solid-js";
import { t, locale } from "../i18n";

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
  const [shouldHideText, setShouldHideText] = createSignal(false);

  // Use createMemo to memoize the localized strings
  const defaultText = createMemo(() => props.defaultText || t('buttons.update_all'));
  const loadingText = createMemo(() => props.loadingText || t('update.loading'));
  const successText = createMemo(() => props.successText || t('update.success'));
  const tooltip = createMemo(() => props.tooltip || t('update.all_tooltip'));

  // Calculate button width based on text content using memoization
  const buttonWidth = createMemo(() => {
    if (isLoading()) return getTextWidth(loadingText());
    if (isSuccess()) return getTextWidth(successText());
    if (isHovered() && !isLoading() && !isSuccess() && !shouldHideText()) return getTextWidth(defaultText());

    // Circle width
    return props.initialState === "expanded" ? getTextWidth(defaultText()) : 48;
  });

  const getTextWidth = (text: string) => {
    // Different character width calculations for different languages
    const isChinese = locale() === 'zh';

    if (isChinese) {
      // Chinese characters are roughly twice as wide as Latin characters
      const baseWidth = text.length * 12;
      return Math.max(48, baseWidth + 40);
    } else {
      // English/Latin characters
      const baseWidth = text.length * 6;
      return Math.max(48, baseWidth + 50);
    }
  };

  // Update button width when state changes
  createEffect(() => {
    const newWidth = buttonWidth();
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
      setShouldHideText(true);
      setTimeout(() => {
        setShouldHideText(false);
      }, 100);
    }, 3000);
  };

  // Determine button classes based on state
  const getButtonClasses = () => {
    // All update bottom layer
    const baseClasses = "fixed bottom-14 right-6 shadow-lg tooltip tooltip-left transform transition-all duration-300 ease-in-out overflow-hidden rounded-full z-1";

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
      data-tip={tooltip()}
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
            <Show when={isSuccess()} fallback={defaultText()}>
              {successText()}
            </Show>
          }>
            {loadingText()}
          </Show>
        </span>
      </div>
    </button>
  );
};

export default AnimatedButton;