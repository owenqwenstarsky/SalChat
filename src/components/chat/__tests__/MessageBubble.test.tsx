import { StyleSheet } from 'react-native';
import { messageBubbleLayout } from '@/components/chat/messageBubbleLayout';

describe('MessageBubble layout', () => {
  it('gives assistant content a stable width for DOM-backed rich text', () => {
    expect(StyleSheet.flatten([messageBubbleLayout.base, messageBubbleLayout.assistant])).toMatchObject({
      alignSelf: 'flex-start',
      minWidth: 0,
      width: '94%',
    });
  });

  it('keeps user bubbles content-sized', () => {
    const userStyle = StyleSheet.flatten([messageBubbleLayout.base, messageBubbleLayout.user]);

    expect(userStyle).toMatchObject({
      alignSelf: 'flex-end',
      maxWidth: '82%',
      minWidth: 0,
    });
    expect(userStyle).not.toHaveProperty('width');
  });
});
