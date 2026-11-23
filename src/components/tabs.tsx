import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Text, type ColorValue } from 'react-native';
import { colors, fonts } from './ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const tabScreenOptions = {
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.muted,
  tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 64, paddingTop: 6, paddingBottom: 6 },
  headerStyle: { backgroundColor: colors.background },
  headerShadowVisible: false,
  headerTitleStyle: { fontFamily: fonts.display, fontSize: 26, color: colors.text },
  sceneStyle: { backgroundColor: colors.background },
};

export function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color as string} size={size} />;
}

/** Custom label so Fredoka's descenders aren't clipped by the default label box. */
export function tabLabel(title: string) {
  return ({ color }: { color: ColorValue }) => (
    <Text style={{ fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, paddingBottom: 3, color: color as string }}>{title}</Text>
  );
}
