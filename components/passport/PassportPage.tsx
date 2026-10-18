/**
 * One page of the Health Passport: the covers, and the data-driven pages.
 *
 * A record page renders exactly the sections the server built from the
 * patient's own records. When there are none, the caller shows the empty state
 * instead of this — an empty page says "nothing has been recorded here yet",
 * which is a fact about the record, not a gap in the app.
 */
import React from 'react';
import { View } from 'react-native';
import { SectionBlock } from './blocks';
import { PassportCover } from './PassportCover';
import { VerificationCentre } from './VerificationCentre';
import type { PassportPage } from '@/lib/api/passportQueries';

export function PassportPageBody({
  page,
  status = 'PROVISIONAL',
  holderName,
  healthId,
}: {
  page: PassportPage;
  /** The credential status the summary reported, for the Verification Centre. */
  status?: 'ACTIVE' | 'PROVISIONAL' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
  /** Whose passport it is — printed on the cover, as on the card. */
  holderName?: string | null;
  healthId?: string | null;
}) {
  if (page.kind === 'cover') {
    return <PassportCover holderName={holderName} healthId={healthId} subtitle={page.subtitle} />;
  }
  if (page.kind === 'back-cover') return <PassportCover back />;

  return (
    <View>
      {page.sections.map((section, i) => (
        <SectionBlock key={`${page.id}-${i}`} section={section} />
      ))}

      {/* Page 24 is where the passport stops being a reading surface: the
          short-lived, opaque code a clinician actually scans. */}
      {page.id === 'verification' ? <VerificationCentre status={status} /> : null}
    </View>
  );
}
