import React from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { PaperWave } from '@/components/ui/PaperWave';
import { ProfileMasthead } from './ProfileMasthead';
import { useProfileStyles } from './styles';

type MastheadProps = React.ComponentProps<typeof ProfileMasthead>;

/**
 * The frame every profile screen shares: the OpesCare Secure paper wave
 * behind everything, the brand masthead, then a scrolling column of cards.
 * `after` renders outside the scroll view (dialogs, modals, sheets).
 */
export const ProfileScreen = React.forwardRef<
  ScrollView,
  {
    masthead: MastheadProps;
    edges?: Edge[];
    children: React.ReactNode;
    after?: React.ReactNode;
  } & Pick<ScrollViewProps, 'refreshControl' | 'keyboardShouldPersistTaps'>
>(function ProfileScreen({ masthead, edges = ['top'], children, after, ...scroll }, ref) {
  const styles = useProfileStyles();
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {/* The render's paper: a wave field under the masthead, at watermark
          strength. Behind everything, untappable, invisible to a reader. */}
      <PaperWave />
      <ProfileMasthead {...masthead} />
      <ScrollView
        ref={ref}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        {...scroll}
      >
        {children}
      </ScrollView>
      {after}
    </SafeAreaView>
  );
});
