import { useCallback, useEffect, useState } from "react";
import { storageSet, getDecryptedApiConfig } from "@/shared/lib/storage";
import { encrypt } from "@/shared/lib/crypto";
import type { ApiConfig } from "@/shared/types";

const EMPTY_CONFIG: ApiConfig = { baseUrl: "", apiKey: "", model: "" };

export function useApiConfig() {
  const [config, setConfigState] = useState<ApiConfig>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const decrypted = await getDecryptedApiConfig();
      if (cancelled) return;
      if (decrypted) {
        setConfigState(decrypted);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const saveConfig = useCallback(async (newConfig: ApiConfig) => {
    const encryptedKey = newConfig.apiKey
      ? await encrypt(newConfig.apiKey)
      : "";
    const toStore: ApiConfig = { ...newConfig, apiKey: encryptedKey };
    await storageSet("api_config", toStore);
    setConfigState(newConfig);
  }, []);

  return { config, saveConfig, loading };
}
