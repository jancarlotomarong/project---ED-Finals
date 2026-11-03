import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

type Result<T> = { data: T; error: string | null };

/**
 * Loads data every time the screen gains focus and exposes the
 * loading / refreshing / error states the UI needs.
 *   EVENT: screen focused or pull-to-refresh
 *   HANDLER: load()
 *   ACTION: call the fetcher
 *   RESULT: data or error state re-renders the screen
 */
export function useLoader<T>(fetcher: () => Promise<Result<T>>, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const hasLoaded = useRef(false);

  const load = useCallback(async (mode: 'focus' | 'refresh' = 'focus') => {
    if (mode === 'refresh') setRefreshing(true);
    else if (!hasLoaded.current) setLoading(true);

    try {
      const res = await fetcherRef.current();
      if (res.error) {
        setError(res.error);
      } else {
        setData(res.data);
        setError(null);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Unexpected error');
    } finally {
      hasLoaded.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load('focus');
    }, [load])
  );

  const refresh = useCallback(() => load('refresh'), [load]);
  const retry = useCallback(() => {
    hasLoaded.current = false;
    return load('focus');
  }, [load]);

  return { data, error, loading, refreshing, refresh, retry, reload: load };
}
