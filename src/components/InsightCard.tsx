/**
 * An insight card. DESIGN.md §6.5, card spec §5.3.
 *
 * `surface`, radius 16, padding 15x14. The caron opens the meta line because this is
 * Sholdi speaking (§2). Body in `ink2` at 13 with 1.65 line-height.
 *
 * Copy rules that apply to whatever is passed in (§7): observes rather than
 * instructs, never moralises, no exclamation marks, no emoji.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Caron } from '@/components/Caron';
import { colors, fonts, radii } from '@/theme/tokens';
import { screenType } from '@/theme/type';

/** §6.5 specifies this meta colour inline; it is not part of the neutral ramp. */
const META_COLOR = '#B6B4B9';

const CARON_WIDTH = 12;

export type InsightCardProps = {
  /** Eyebrow-style meta, e.g. "SHOES · 3RD MONTH". Rendered uppercase. */
  meta: string;
  body: string;
  /** Action pills, rendered beneath the body. */
  children?: React.ReactNode;
};

export function InsightCard({ meta, body, children }: InsightCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.metaRow}>
        <Caron width={CARON_WIDTH} color={META_COLOR} />
        <Text style={styles.meta}>{meta}</Text>
      </View>

      <Text style={styles.body}>{body}</Text>

      {children && <View style={styles.actions}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    paddingVertical: 15,
    paddingHorizontal: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: META_COLOR,
    flexShrink: 1,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: screenType.insightCardSize,
    lineHeight: screenType.insightCardLineHeight,
    color: colors.ink2,
    marginTop: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
});
