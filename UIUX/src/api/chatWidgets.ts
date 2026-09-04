/**
 * In-chat workflow widgets (WGT-001) — the composer's attachment button.
 *
 * The client knows nothing about any particular workflow. It lists what the
 * server offers, renders the form the server describes, and posts the values
 * back; the server writes the real module record and returns the message
 * carrying its card. Adding a workflow server-side therefore needs no change
 * here at all.
 */
import { getOne, post } from './portal';
import type { MessageCardType, PortalMessage } from './messaging';

export type WidgetFieldType = 'select' | 'text' | 'textarea' | 'date' | 'number';

export type WidgetOption = {
  value: string;
  label: string;
  meta: string | null;
};

export type WidgetField = {
  key: string;
  type: WidgetFieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  /** Choices for a select. Empty means "nothing to pick yet". */
  options?: WidgetOption[];
  /** Re-request the form when this field changes — it narrows later fields. */
  refreshes?: boolean;
  /** This field stays empty until `depends_on` has a value. */
  depends_on?: string;
  /** Shown in place of an empty option list. */
  empty_note?: string;
  /** The select also accepts a value the user types. */
  allow_custom?: boolean;
  searchable?: boolean;
};

export type ChatWidgetSummary = {
  id: string;
  label: string;
  icon: string;
  tint: string;
  description: string;
  /** The module the record lands in — "Scheduling", "Laboratory", … */
  module: string;
  card_type: MessageCardType;
  audiences: ('patient' | 'staff')[];
};

export type ChatWidgetForm = ChatWidgetSummary & {
  submit_label: string;
  fields: WidgetField[];
};

export type WidgetValues = Record<string, string | number | null>;

/** The workflows this patient may attach in a conversation. */
export const fetchChatWidgets = () => getOne<ChatWidgetSummary[]>('/patient/messages/widgets');

/**
 * The form as it stands given what has been filled in so far — this is what
 * narrows doctors to a department and slots to a doctor.
 */
export const fetchChatWidgetForm = (threadId: string, widgetId: string, values: WidgetValues = {}) =>
  getOne<ChatWidgetForm>(
    `/patient/messages/threads/${threadId}/widgets/${widgetId}/form`,
    Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null && v !== ''))
  );

/** Run the workflow. Resolves to the persisted message carrying the card. */
export const runChatWidget = (threadId: string, widgetId: string, values: WidgetValues) =>
  post<PortalMessage>(`/patient/messages/threads/${threadId}/widgets/${widgetId}`, { values });
