import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type UnreadValue = {
  /** Unread message threads — drives the Messages tab badge. */
  messages: number;
  /** Unread notifications — drives the header bell badge. */
  notifications: number;
  setMessages: (n: number) => void;
  setNotifications: (n: number) => void;
};

const UnreadContext = createContext<UnreadValue>({
  messages: 0,
  notifications: 0,
  setMessages: () => {},
  setNotifications: () => {},
});

/**
 * Lightweight unread-count store.
 *
 * Screen agents: call `setMessages(...)` / `setNotifications(...)` once your
 * data loads and the tab badge and header bell update automatically.
 */
export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessagesState] = useState(0);
  const [notifications, setNotificationsState] = useState(0);

  const setMessages = useCallback((n: number) => setMessagesState(Math.max(0, n)), []);
  const setNotifications = useCallback((n: number) => setNotificationsState(Math.max(0, n)), []);

  const value = useMemo(
    () => ({ messages, notifications, setMessages, setNotifications }),
    [messages, notifications, setMessages, setNotifications],
  );

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useUnread(): UnreadValue {
  return useContext(UnreadContext);
}
