import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * expo-secure-store has no web implementation. Native (iOS/Android, the
 * actual target platforms) uses the OS keychain/keystore as intended; web
 * falls back to localStorage so `expo start --web` stays usable for quick
 * iteration without needing a simulator.
 */
export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

export async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
