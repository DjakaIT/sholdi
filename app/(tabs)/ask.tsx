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
import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react-native';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import {
  CHAT_MESSAGES_PER_DAY,
  QuotaExceededError,
  consumeQuota,
  quotaStatus,
  refundQuota,
} from '@/features/usage/quota';
import { RequestRefusedError, askSholdi, isAiConfigured } from '@/lib/functions';
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
  /** How many questions are left today. Null until the ledger has been read. */
  const [remaining, setRemaining] = useState<number | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  // COST-CONTROLS.md §7 caps chat per day. Read on mount so the count is honest
  // before the first question rather than only after one is refused.
  useEffect(() => {
    let active = true;
    quotaStatus('chat')
      .then((status) => {
        if (active) setRemaining(status.remaining);
      })
      .catch(() => {
        // The ledger failing to open must not take the screen down with it.
      });
    return () => {
      active = false;
    };
  }, []);

  const say = (text: string) =>
    setMessages((prev) => [...prev, { id: `s${Date.now()}`, from: 'sholdi', text }]);

  async function send() {
    const question = draft.trim();
    if (!question || busy) return;

    const userMessage: Message = { id: `u${Date.now()}`, from: 'user', text: question };
    setMessages((prev) => [...prev, userMessage]);
    setDraft('');
    setBusy(true);

    // Declared out here so the catch can tell whether the unit was actually taken.
    let quotaTaken = false;

    try {
      if (!isAiConfigured) {
        say(
          'I cannot answer questions yet — the reading service is not set up. Your spending is still all here.'
        );
        return;
      }

      // §7: check the quota BEFORE calling out, and count the call whether or not
      // the answer arrives. A question whose reply is lost still reached the model.
      const after = await consumeQuota('chat');
      quotaTaken = true;
      setRemaining(after.remaining);

      // Built on the device, from aggregates only.
      const summary = await buildSpendingSummary(month);
      const answer = await askSholdi({ question, summary });

      say(answer);
    } catch (error) {
      // §7: "a typed error the UI can render — never a generic failure."
      if (error instanceof QuotaExceededError) {
        setRemaining(0);
        say(error.message);
        return;
      }

      // Refused before the model was reached, so it cost nothing and should not
      // count. Without this a run of rate-limited requests would silently eat the
      // day's allowance.
      if (quotaTaken && error instanceof RequestRefusedError) {
        await refundQuota('chat').catch(() => {});
        await quotaStatus('chat')
          .then((status) => setRemaining(status.remaining))
          .catch(() => {});
      }

      say(error instanceof Error ? error.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  }

  const spent = remaining !== null && remaining <= 0;
  const canSend = !busy && !spent && draft.trim().length > 0;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        // Both platforms: Android 15+ is edge to edge and no longer resizes the
        // window for the keyboard, so `undefined` left the question field under it.
        behavior="padding">
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Ask Sholdi</Text>
          {/* Stated quietly and only as it starts to matter. DESIGN.md §7 asks for
              observation without nagging, and a counter sitting at "3 left" all day
              is nagging. */}
          {remaining !== null && remaining <= 1 && (
            <Text style={styles.allowance}>
              {remaining === 0 ? 'No questions left today' : 'One question left today'}
            </Text>
          )}
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
                  individual purchases. {CHAT_MESSAGES_PER_DAY} questions a day.
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
              placeholder={spent ? 'Back tomorrow' : 'Ask anything'}
              placeholderTextColor={colors.muted}
              style={styles.textInput}
              onSubmitEditing={send}
              returnKeyType="send"
              editable={!busy && !spent}
            />
          </View>
          {/*
            DESIGN.md §6.6 draws a mic here. Voice input is not built yet, and a mic
            that sends typed text promises something the button does not do — so
            until speech-to-text lands this is an honest send arrow, in the same
            34px ink circle.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={send}
            hitSlop={6}
            style={[styles.micButton, !canSend && styles.micButtonSpent]}>
            <ArrowUp size={16} strokeWidth={1.8} color={colors.onInk} />
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
  allowance: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 3,
  },
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
  // Faded rather than hidden: the control stays where it was, so the screen does
  // not rearrange itself the moment the last question is used.
  micButtonSpent: {
    opacity: 0.35,
  },
});
