/**
 * Tab bar icons. Thin wrappers over the shared `<Icon />` set so the tab bar
 * and the rest of the app stay visually identical.
 *
 * Legacy named exports (HomeIcon, CalendarIcon, ...) are retained so any
 * screen still importing them keeps compiling.
 */
import React from 'react';
import { Icon, IconName } from '../components/Icon';
import { iconStroke } from '../theme/theme';

export type TabIconProps = { color: string; size?: number; focused?: boolean };

function make(name: IconName) {
  return function TabIcon({ color, size = 24 }: TabIconProps) {
    return <Icon name={name} size={size} color={color} strokeWidth={iconStroke.bold} />;
  };
}

// Current tab bar
export const HomeIcon = make('home');
export const HealthIcon = make('heart-pulse');
export const MessagesIcon = make('chat');
export const ProfileIcon = make('person');

// Legacy exports (previous tab bar)
export const CalendarIcon = make('calendar');
export const FolderIcon = make('folder');
export const BillingIcon = make('credit-card');
