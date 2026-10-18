import { useMutation, useQueryClient } from '@tanstack/react-query';
import i18next from 'i18next';
import { Platform } from 'react-native';
import { apiClient } from './client';

/*
 * Patient record import — records from another provider, patient-provided.
 *
 *   POST /mobile/records/import/fhir      multipart `file` (FHIR R4 Bundle .json)
 *   POST /mobile/records/import/document  multipart `file` (PDF / JPEG / PNG / WebP)
 *
 * No request carries a patient identifier: the owner is whoever the bearer
 * token belongs to, server-side. Every item comes back provenance
 * 'patient_import', verified false — the screen must say so.
 *
 * i18n: same arrangement as accountDeletionQueries.ts — pending bundle,
 * deep=true, overwrite=false, so merging into locales later is safe.
 */
import importRecordsEn from '../i18n/pending/importRecords.en.json';
import importRecordsFr from '../i18n/pending/importRecords.fr.json';

let bundlesRegistered = false;
function registerPendingBundles(): void {
  if (bundlesRegistered) return;
  bundlesRegistered = true;
  try {
    i18next.addResourceBundle('en', 'translation', importRecordsEn, true, false);
    i18next.addResourceBundle('fr', 'translation', importRecordsFr, true, false);
  } catch {
    // i18next not initialised in some tooling contexts.
  }
}
registerPendingBundles();

export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;

export const importEndpoints = {
  fhir: '/mobile/records/import/fhir',
  document: '/mobile/records/import/document',
  list: '/mobile/records/imported',
} as const;

export type ImportKind = 'fhir' | 'document';

export interface PickedImportFile {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
  /** Web only: the picker hands back a File. */
  file?: File | null;
}

export interface ImportSkipReason {
  resource_type: string;
  reason: string;
  reason_label: string;
  count: number;
}

export interface ImportSummary {
  import_batch_id: string;
  provenance: 'patient_import';
  verified: false;
  label: string;
  totals: { imported: number; skipped: number };
  by_type: Record<string, { imported: number; skipped: number }>;
  skipped: ImportSkipReason[];
}

export function useImportRecords() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, file }: { kind: ImportKind; file: PickedImportFile }) => {
      const form = new FormData();
      const type = file.mimeType || (kind === 'fhir' ? 'application/json' : 'application/pdf');
      if (Platform.OS === 'web') {
        const blob = file.file ?? (await (await fetch(file.uri)).blob());
        form.append('file', blob, file.name);
      } else {
        form.append('file', { uri: file.uri, name: file.name, type } as unknown as Blob);
      }
      const { data } = await apiClient.post<{ summary: ImportSummary }>(importEndpoints[kind], form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.summary;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['imported-records'] });
    },
  });
}
