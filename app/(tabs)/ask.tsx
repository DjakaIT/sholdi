/**
 * Ask Sholdi. DESIGN.md §6.6.
 *
 * The load-bearing decision: user messages get bubbles, Sholdi's replies do not.
 * Sholdi speaks as plain text on the page behind the caron. Putting its replies in
 * bubbles was explicitly rejected (§9) — it makes Sholdi the voice of the app rather
 * than a chatbot pasted into it.
 *
 * What is sent: a locally-built aggregate of monthly category totals and goals.
 * Never individual transactions (ARCHITECTURE.md §4.5). See features/expenses/summary.ts.
 */
import { useRef, useState } from 'react';
import { Mic } from 'lucide-react-native';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Caron } from '@/components/Caron';
import { buildSpendingSummary } from '@/features/expenses/summary';
import { askSholdi, isAiConfigured } from '@/lib/functions';
import { useMonthStore } from '@/stores/useMonthStore';
import { colors, fonts, radii, spacing, type as typeScale } from '@/theme/tokens';

const MIC_BUTTON = 34;
const CARON_WIDTH = 12;

type Message = { id: string; from: 'user' | 'sholdi'; text: string };

export default function AskScreen() {
  const month = useMonthStore((state) => state.month);

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  async function send() {
    const question = draft.trim();
    if (!question || busy) return;

    const userMessage: Message = { id: `u${Date.now()}`, from: 'user', text: question };
    setMessages((prev) => [...prev, userMessage]);
    setDraft('');
    setBusy(true);

    try {
      if (!isAiConfigured) {
        setMessages((prev) => [
          ...prev,
          {
            id: `s${Date.now()}`,
            from: 'sholdi',
            text: 'I cannot answer questions yet — the reading service is not set up. Your spending is still all here.',
          },
        ]);
        return;
      }

      // Built on the device, from aggregates only.
      const summary = await buildSpendingSummary(month);
      const answer = await askSholdi({ question, summary });

      setMessages((prev) => [...prev, { id: `s${Date.now()}`, from: 'sholdi', text: answer }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `s${Date.now()}`,
          from: 'sholdi',
          text: error instanceof Error ? error.message : 'Something went wrong. Try again.',
        },
      ]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Ask Sholdi</Text>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.conversation}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {messages.length === 0 && (
            <View style={styles.reply}>
              <View style={styles.replyRow}>
                <View style={styles.caron}>
                  <Caron width={CARON_WIDTH} color={colors.ink3} />
                </View>
                <Text style={styles.replyText}>
                  Ask me about your spending. I see monthly totals by category, never
                  individual purchases.
                </Text>
              </View>
            </View>
          )}

          {messages.map((message) =>
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
              </View>
            )
          )}

          {busy && (
            <View style={styles.thinking}>
              <ActivityIndicator color={colors.faint} />
            </View>
          )}
        </ScrollView>

        <View style={styles.inputRow}>
          <View style={styles.input}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask anything"
              placeholderTextColor={colors.muted}
              style={styles.textInput}
              onSubmitEditing={send}
              returnKeyType="send"
              editable={!busy}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            onPress={send}
            style={styles.micButton}>
            <Mic size={16} strokeWidth={1.6} color={colors.onInk} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  eyebrow: { ...typeScale.eyebrow, color: colors.muted },
  scroll: { flex: 1 },
  // Anchored to the bottom (§6.6): content grows upward from the input.
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
  reply: { gap: 12 },
  replyRow: { flexDirection: 'row', gap: 9 },
  caron: { paddingTop: 7 },
  replyText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.7,
    color: colors.ink3,
  },
  thinking: { paddingLeft: CARON_WIDTH + 9 },
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
