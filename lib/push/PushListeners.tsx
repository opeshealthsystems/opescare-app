/**
 * Mounts the push listeners for the lifetime of an authenticated session.
 *
 * Rendered by `app/_layout.tsx` inside the `QueryClientProvider` and only
 * while `status === 'authenticated'`, so a push that arrives on the sign-in
 * screen refreshes nothing and routes nowhere — there is no session for it
 * to belong to. Renders nothing itself.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { startPushListeners } from './handler';

export function PushListeners() {
  const queryClient = useQueryClient();

  useEffect(() => startPushListeners(queryClient), [queryClient]);

  return null;
}
