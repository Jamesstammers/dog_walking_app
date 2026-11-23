import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Text, View, type ColorValue } from 'react-native';
import { BrandHeader } from './BrandHeader';
import { colors, fonts } from './ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const tabScreenOptions = {
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: '#8E8791',
  tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 72, paddingTop: 8, paddingBottom: 6 },
  header: ({ options, route }: { options: { title?: string }; route: { name: string } }) => (
    <BrandHeader title={options.title ?? route.name} />
  ),
  sceneStyle: { backgroundColor: colors.background },
};

/** Outline icon when idle; on the current tab, a filled white icon on a purple pill. */
export function tabIcon(name: IconName) {
  const filled = name.replace(/-outline$/, '') as IconName;
  return ({ color, focused }: { color: ColorValue; focused: boolean; size: number }) => (
    <View
      style={{
        width: 56,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? colors.primary : 'transparent',
      }}
    >
      <Ionicons name={focused ? filled : name} color={focused ? '#fff' : (color as string)} size={22} />
    </View>
  );
}

/** Custom label so Fredoka's descenders aren't clipped by the default label box. */
export function tabLabel(title: string) {
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Text
      style={{
        fontFamily: focused ? fonts.bold : fonts.regular,
        fontSize: 12,
        lineHeight: 16,
        paddingBottom: 3,
        marginTop: 2,
        color: color as string,
      }}
    >
      {title}
    </Text>
  );
}
