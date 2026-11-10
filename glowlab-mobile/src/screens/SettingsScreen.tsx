import { useCallback, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { PricingSettings } from '@glowlab/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { useWorkspace } from '../workspace';
import { colors, styles } from '../theme';

const FIELDS: { key: keyof PricingSettings; label: string }[] = [
  { key: 'baseRatePerFoot', label: 'Base rate per foot ($)' },
  { key: 'purchaseMultiplier', label: 'Purchase multiplier' },
  { key: 'secondStoryMultiplier', label: 'Second-story multiplier' },
  { key: 'steepRoofFee', label: 'Steep roof fee ($)' },
  { key: 'wreathPrice', label: 'Wreath ($ each)' },
  { key: 'pathwayStakePrice', label: 'Pathway stake ($ each)' },
  { key: 'treeWrapPrice', label: 'Tree wrap ($ each)' },
  { key: 'timerPrice', label: 'Timer ($ each)' },
];

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { refreshSettings } = useWorkspace();
  const [settings, setSettings] = useState<PricingSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    api.getSettings().then(({ settings: s }) => setSettings(s)).catch((e: Error) => setError(e.message));
  }, []));

  if (!settings) return <View style={[styles.screen, { padding: 20 }]}><Text style={styles.muted}>{error ?? 'Loading…'}</Text></View>;

  const save = async () => {
    try {
      const { settings: s } = await api.saveSettings(settings);
      setSettings(s); await refreshSettings(); setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Pricing settings</Text>
      <Text style={styles.muted}>Signed in as {user?.name} ({user?.email}). These rates drive every estimate.</Text>
      {FIELDS.map(({ key, label }) => (
        <View key={key} style={{ gap: 4 }}>
          <Text style={styles.label}>{label}</Text>
          <TextInput style={styles.input} keyboardType="decimal-pad" placeholderTextColor={colors.muted}
            value={String(settings[key])} onChangeText={(v) => setSettings({ ...settings, [key]: Number(v) || 0 })} />
        </View>
      ))}
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity style={styles.button} onPress={save}><Text style={styles.buttonText}>{saved ? 'Saved ✓' : 'Save pricing'}</Text></TouchableOpacity>
      <TouchableOpacity style={styles.buttonGhost} onPress={() => logout()}><Text style={styles.buttonGhostText}>Log out</Text></TouchableOpacity>
    </ScrollView>
  );
}
