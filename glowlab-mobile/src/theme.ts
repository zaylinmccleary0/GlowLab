import { StyleSheet } from 'react-native';

export const colors = {
  gold: '#f2b544', goldDark: '#c98f1d', ink: '#f4ecd9', muted: '#a99f8a',
  line: '#3a3f35', bg: '#141a16', card: '#1f2721', danger: '#ff7a6b', pine: '#2e5d3a',
};

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  h1: { fontSize: 24, fontWeight: '800', color: colors.ink },
  h2: { fontSize: 18, fontWeight: '700', color: colors.ink, marginTop: 8 },
  muted: { color: colors.muted },
  small: { fontSize: 12 },
  error: { color: colors.danger },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { backgroundColor: colors.pine, color: '#dff5e3', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontSize: 11, fontWeight: '700', overflow: 'hidden' },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, backgroundColor: '#12160f', color: colors.ink, fontSize: 15 },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  button: { backgroundColor: colors.gold, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  buttonText: { color: '#231a05', fontWeight: '700' },
  buttonGhost: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center', backgroundColor: colors.card },
  buttonGhostText: { fontWeight: '600', color: colors.ink },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.card },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { fontWeight: '600', color: colors.ink },
  chipTextActive: { color: '#231a05', fontWeight: '700' },
});
