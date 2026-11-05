import { useEffect, useRef } from 'react';

/**
 * Moves focus to an element when its screen opens: give the returned ref to the screen's
 * heading, with `tabIndex={-1}`. A screen reader then announces the new screen instead of
 * staying on the button that opened it.
 */
export function useFocusOnMount<T extends HTMLElement>() {
  const target = useRef<T>(null);
  useEffect(() => {
    target.current?.focus();
  }, []);
  return target;
}
