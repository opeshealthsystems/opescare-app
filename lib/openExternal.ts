import { Linking } from 'react-native';

/**
 * The one door out of the app for a URL the server supplied (document links,
 * verification pages, facility websites). Only https, tel and mailto are ever
 * opened — never http, and never an arbitrary scheme that would deep-link into
 * another installed app.
 */
const ALLOWED = /^(https:\/\/|tel:|mailto:)/i;

export function isOpenableUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && ALLOWED.test(url.trim());
}

export async function openExternal(url: string | null | undefined): Promise<void> {
  if (!isOpenableUrl(url)) throw new Error('Refused to open a non-https link.');
  await Linking.openURL(url.trim());
}
