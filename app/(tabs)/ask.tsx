/**
 * Ask Sholdi. DESIGN.md §6.6.
 *
 * The load-bearing decision here: user messages get bubbles, Sholdi's replies do
 * not. Sholdi speaks as plain text on the page behind the caron. Putting its replies
 * in bubbles was explicitly rejected (§9) — it makes Sholdi the voice of the app
 * rather than a chatbot pasted into it.
 *
 * Conversation is anchored to the bottom. Mock exchange until `ask-sholdi` exists.
 */
import { Mic } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Caron } from '@/components/Caron';
import { MOCK_CONVERSATION } from '@/features/chat/mockData';
import { colors, fonts, radii, spacing, type as typeScale } from '@/theme/tokens';

const MIC_BUTTON = 34;
const CARON_WIDTH = 12;

export default function AskScreen() {
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Ask Sholdi</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.conversation}
        showsVerticalScrollIndicator={false}>
        {MOCK_CONVERSATION.map((message) =>
          message.from === 'user' ? (
            <View key={message.id} style={styles.userBubble}>
              <Text style={styles.userText}>{message.text}</Text>
            </View>
          ) : (
            <View key={message.id} style={styles.reply}>
              <View style={styles.replyRow}>
                <View style={styles.caron}>
                  <Caron width={CARON_WIDTH} color={colors.ink3} />
                </View>
                <Text style={styles.replyText}>{message.text}</Text>
              </View>
              {message.actions && (
                <View style={styles.actions}>
                  {message.actions.map((label) => (
                    <Button key={label} label={label} variant="pill" />
                  ))}
                </View>
              )}
            </View>
          )
        )}
      </ScrollView>

      <View style={styles.inputRow}>
        <View style={styles.input}>
          <TextInput
            placeholder="Ask anything"
            placeholderTextColor={colors.muted}
            style={styles.textInput}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Speak"
          style={styles.micButton}>
          <Mic size={16} strokeWidth={1.6} color={colors.onInk} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.page,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  eyebrow: {
    ...typeScale.eyebrow,
    color: colors.muted,
  },
  scroll: {
    flex: 1,
  },
  // Anchored to the bottom (§6.6): the content grows upward from the input.
  conversation: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    backgroundColor: colors.raised,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 13,
  },
  userText: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.5,
    color: colors.ink,
  },
  // No bubble. This is the point.
  reply: {
    gap: 12,
  },
  replyRow: {
    flexDirection: 'row',
    gap: 9,
  },
  caron: {
    paddingTop: 7,
  },
  replyText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.7,
    color: colors.ink3,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: CARON_WIDTH + 9,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingLeft: 16,
    paddingRight: 12,
    height: 40,
    justifyContent: 'center',
  },
  textInput: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink,
    padding: 0,
  },
  micButton: {
    width: MIC_BUTTON,
    height: MIC_BUTTON,
    borderRadius: MIC_BUTTON / 2,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
