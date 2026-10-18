import '@/lib/i18n/profileStrings';
/**
 * The My Profile design language (app/(tabs)/profile.tsx is the reference),
 * shared by every profile-type screen: the patient's own profile, the
 * clinician's own profile, the public provider profile and a dependent's.
 */
export { CoverPhoto } from './CoverPhoto';
export { ProfileMasthead, ProfileHeading, type MastheadAction } from './ProfileMasthead';
export {
  IdentityCard,
  IdentityLine,
  HealthIdPanelContent,
  CredentialPanelContent,
} from './IdentityCard';
export { TrustChips, type TrustChip } from './TrustChips';
export {
  OverviewTiles,
  OverviewCard,
  ProfileRingCard,
  type OverviewTile,
  type OverviewRing,
} from './OverviewTiles';
export {
  ProfilePanel,
  ProfileSection,
  PanelHeader,
  PanelSeal,
  FactGrid,
  FactCell,
  TileGrid,
  LinkTileView,
  PrivacyFooter,
  SignOutButton,
  type Fact,
  type LinkTile,
} from './ProfilePanel';
export { makeProfileStyles, useProfileStyles, type ProfileStyles } from './styles';
export { ProfileScreen } from './ProfileScreen';
