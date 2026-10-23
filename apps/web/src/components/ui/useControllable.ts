import { useCallback, useRef, useState } from "react";

/**
 * Supports both controlled (`value` provided) and uncontrolled (`defaultValue`) use.
 * `onChange` fires in both modes; only the uncontrolled mode keeps its own state.
 */
export function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void,
): [T, (next: T) => void] {
  const [inner, setInner] = useState<T>(defaultValue);
  const isControlled = value !== undefined;
  const current = isControlled ? value : inner;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const set = useCallback(
    (next: T) => {
      if (!isControlled) setInner(next);
      onChangeRef.current?.(next);
    },
    [isControlled],
  );

  return [current, set];
}
