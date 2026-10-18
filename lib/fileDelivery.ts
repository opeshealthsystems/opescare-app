/**
 * Handing a generated file to the patient — on every platform the app runs on.
 *
 * The app ships as a native build AND as a web build (finder.opescare.cloud/finder).
 * The two have nothing in common at this step:
 *
 *  - **native** writes the bytes into the app's document directory and offers
 *    the OS share sheet. Once the file is on disk the patient HAS their copy,
 *    so a share sheet that is unavailable or dismissed is not a failure.
 *  - **web** has no `documentDirectory` (`expo-file-system` resolves it to
 *    `null`) and no share sheet. The browser's own download machinery is the
 *    only way to hand a file over: wrap the bytes in a `Blob`, point an
 *    anchor with a `download` attribute at an object URL, click it, then
 *    release the URL.
 *
 * Before this existed both export screens ran the native path unconditionally,
 * so on the web build every export failed at the save step — after the API had
 * already produced (and, for the moderated export, *spent*) the file. The
 * screen then reported a failure for a request that had succeeded.
 *
 * The outcome is returned rather than swallowed so a screen can tell the
 * patient what actually happened, and every genuine failure throws
 * `FileDeliveryError` so it can be reported as a delivery failure rather than
 * mislabelled as an API error.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/** What actually happened to the file, in the patient's terms. */
export type FileDeliveryOutcome =
  /** Native: written to the device AND passed to the OS share sheet. */
  | 'shared'
  /** Native: written to the device; no share sheet was available. */
  | 'saved'
  /** Web: handed to the browser's downloads. */
  | 'downloaded';

export interface DeliverableFile {
  filename: string;
  mimeType: string;
  /** The file body: base64 for binary formats, plain text for `utf8`. */
  data: string;
  encoding: 'base64' | 'utf8';
  /** iOS Uniform Type Identifier for the share sheet. Native only. */
  uti?: string;
  /** Share-sheet title. Native only; must already be translated. */
  shareTitle?: string;
}

/**
 * The file could not be handed over. Distinct from an API error: the bytes
 * exist, the hand-off is what failed — which is a different sentence to the
 * patient and, for a one-shot moderated export, a different remedy.
 */
export class FileDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileDeliveryError';
  }
}

/**
 * The browser reads the blob asynchronously after the click, so revoking the
 * object URL in the same tick can cancel the download it just started. One
 * second is long enough for every engine to have taken its reference and short
 * enough that the blob is not left alive.
 */
const OBJECT_URL_RELEASE_MS = 1000;

/** base64 → bytes, tolerating a `data:…;base64,` prefix. */
function decodeBase64(value: string): Uint8Array {
  const comma = value.startsWith('data:') ? value.indexOf(',') : -1;
  const payload = comma >= 0 ? value.slice(comma + 1) : value;
  const binary = globalThis.atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deliverOnWeb(file: DeliverableFile): Promise<FileDeliveryOutcome> {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    throw new FileDeliveryError('This browser cannot receive downloaded files.');
  }

  let objectUrl: string;
  try {
    const body: BlobPart =
      file.encoding === 'base64' ? (decodeBase64(file.data) as BlobPart) : file.data;
    objectUrl = URL.createObjectURL(new Blob([body], { type: file.mimeType }));
  } catch {
    throw new FileDeliveryError('The exported file could not be assembled in this browser.');
  }

  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = file.filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch {
    URL.revokeObjectURL(objectUrl);
    throw new FileDeliveryError('This browser refused the download.');
  }

  setTimeout(() => URL.revokeObjectURL(objectUrl), OBJECT_URL_RELEASE_MS);
  return 'downloaded';
}

/**
 * Unchanged from what the two export screens did before: write, then offer the
 * share sheet. A missing or dismissed share sheet still means the patient has
 * the file, so it reports `saved`, never a failure.
 */
async function deliverOnNative(file: DeliverableFile): Promise<FileDeliveryOutcome> {
  // Exports go to an `exports/` folder in the CACHE, not documents: a health
  // record must not sit on the phone indefinitely after it has been shared,
  // and signing out sweeps this folder (clearExportedFiles).
  const directory = exportDirectory();
  if (!directory) {
    throw new FileDeliveryError('This device has no writable location for the export.');
  }
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => undefined);

  const uri = `${directory}${file.filename}`;
  await FileSystem.writeAsStringAsync(uri, file.data, {
    encoding:
      file.encoding === 'base64' ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
  });

  try {
    if (!(await Sharing.isAvailableAsync())) return 'saved';
    await Sharing.shareAsync(uri, {
      mimeType: file.mimeType,
      dialogTitle: file.shareTitle,
      UTI: file.uti,
    });
    return 'shared';
  } catch {
    return 'saved';
  }
}

function exportDirectory(): string | null {
  return FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}exports/` : null;
}

/** Delete every exported file. Called when the session ends. */
export async function clearExportedFiles(): Promise<void> {
  if (Platform.OS === 'web') return;
  const directory = exportDirectory();
  if (directory) await FileSystem.deleteAsync(directory, { idempotent: true });
}

/**
 * Deliver `file` to the patient. Resolves with what happened; throws
 * `FileDeliveryError` (or the underlying filesystem error on native) when the
 * file genuinely did not reach them.
 */
export async function deliverFile(file: DeliverableFile): Promise<FileDeliveryOutcome> {
  return Platform.OS === 'web' ? deliverOnWeb(file) : deliverOnNative(file);
}
