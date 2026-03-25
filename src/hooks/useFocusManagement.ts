import { useEffect, useRef } from "react";

export function useFocusManagement() {
  const activeElementRef = useRef<HTMLElement | null>(null);

  const captureActiveElement = () => {
    activeElementRef.current = document.activeElement as HTMLElement;
  };

  const restoreFocus = () => {
    if (activeElementRef.current) {
      activeElementRef.current.focus();
      activeElementRef.current = null;
    }
  };

  return { captureActiveElement, restoreFocus };
}