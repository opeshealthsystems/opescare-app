import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'opescare_patient_token';

/**
 * expo-secure-store has no native implementation on web. Native builds (the
 * only ones that ship) use real SecureStore; web falls back to localStorage
 * purely so the app is previewable in a browser during development.
 */
export const tokenStorage =
  Platform.OS === 'web'
    ? {
        get: async () => (typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null),
        set: async (token: string) => localStorage.setItem(TOKEN_KEY, token),
        clear: async () => localStorage.removeItem(TOKEN_KEY),
      }
    : {
        get: () => SecureStore.getItemAsync(TOKEN_KEY),
        set: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
        clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
      };
