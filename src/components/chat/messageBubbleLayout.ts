import { StyleSheet } from 'react-native';

export const messageBubbleLayout = StyleSheet.create({
  base: { minWidth: 0 },
  // DOM-backed math measures its own intrinsic width in Expo SDK 54. Give
  // assistant content a stable parent width so prose cannot collapse with it.
  assistant: { width: '94%', alignSelf: 'flex-start' },
  user: { alignSelf: 'flex-end', maxWidth: '82%' },
});
