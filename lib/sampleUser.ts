'use client';

import { useEffect, useState } from 'react';

/**
 * Global "Viewing as user" — the sample user id every live view (feed, location pages, previews) resolves
 * against. Persisted in localStorage so the whole dashboard stays consistent.
 */
const KEY = 'explore-admin:sample-user';

export function useSampleUser(): [string, (v: string) => void] {
  const [userId, setUserId] = useState('');
  useEffect(() => {
    setUserId(localStorage.getItem(KEY) ?? '');
  }, []);
  const update = (v: string) => {
    setUserId(v);
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  };
  return [userId, update];
}
