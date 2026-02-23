import { useCallback, useEffect, useRef, useState } from "react";
import { storageGet, storageSet, onStorageChanged } from "@/shared/lib/storage";
import type { StorageSchema } from "@/shared/types";

export function useStorage<K extends keyof StorageSchema>(
  key: K,
  defaultValue: StorageSchema[K],
): [StorageSchema[K], (v: StorageSchema[K]) => Promise<void>, boolean] {
  const [value, setValueState] = useState<StorageSchema[K]>(defaultValue);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    storageGet(key).then((stored) => {
      if (!mountedRef.current) return;
      if (stored !== undefined) setValueState(stored);
      setLoading(false);
    });

    const unsub = onStorageChanged(key, (newValue) => {
      if (!mountedRef.current) return;
      setValueState(newValue ?? defaultValue);
    });

    return () => {
      mountedRef.current = false;
      unsub();
    };
  }, [key, defaultValue]);

  const setValue = useCallback(
    async (newValue: StorageSchema[K]) => {
      setValueState(newValue);
      await storageSet(key, newValue);
    },
    [key],
  );

  return [value, setValue, loading];
}
