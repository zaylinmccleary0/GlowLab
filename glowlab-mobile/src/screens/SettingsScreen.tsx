import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { InstallType, PricingProfile, PricingSettings, RateCard } from '@glowlab/shared';
import { INSTALL_TYPE_LABELS, MAX_PRICING_PROFILES, RATE_CARD_FIELDS, newPricingProfile, validatePricingSettings } from '@glowlab/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { useWorkspace } from '../workspace';
import NumberInput from '../NumberInput';
import { colors, styles } from '../theme';

const newId = () => `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { refreshSettings } = useWorkspace();
  const [settings, setSettings] = useState<PricingSettings | null>(null);
  const [activeId, setActiveId] = useState('');
  const [type, setType] = useState<InstallType>('seasonal');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    api.getSettings().then(({ settings: s }) => { setSettings(s); setActiveId((id) => (s.profiles.some((p) => p.id === id) ? id : s.profiles[0].id)); })
      .catch((e: Error) => setError(e.message));
  }, []));

  if (!settings) return <View style={[styles.screen, { padding: 20 }]}><Text style={styles.muted}>{error ?? 'Loading…'}</Text></View>;

  const active = settings.profiles.find((p) => p.id === activeId) ?? settings.profiles[0];
  const isDefault = settings.profiles[0].id === active.id;
  const updateActive = (patch: Partial<PricingProfile>) =>
    setSettings({ profiles: settings.profiles.map((p) => (p.id === active.id ? { ...p, ...patch } : p)) });
  const setRate = (key: keyof RateCard, v: number) => updateActive({ [type]: { ...active[type], [key]: v } } as Partial<PricingProfile>);

  const addList = () => {
    if (settings.profiles.length >= MAX_PRICING_PROFILES) return;
    const copy: PricingProfile = { ...JSON.parse(JSON.stringify(active)), id: newId(), name: `Price list ${settings.profiles.length + 1}` };
    setSettings({ profiles: [...settings.profiles, copy] });
    setActiveId(copy.id);
  };
  const removeActive = () => {
    if (settings.profiles.length <= 1) return;
    Alert.alert('Delete price list?', `Estimates using "${active.name}" will switch to the default list.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        const rest = settings.profiles.filter((p) => p.id !== active.id);
        setSettings({ profiles: rest }); setActiveId(rest[0].id);
      } },
    ]);
  };
  const resetActive = () => {
    const fresh = newPricingProfile(active.id, active.name);
    updateActive({ bulbSpacingInches: fresh.bulbSpacingInches, seasonal: fresh.seasonal, permanent: fresh.permanent });
  };
  const makeDefault = () => setSettings({ profiles: [active, ...settings.profiles.filter((p) => p.id !== active.id)] });

  const save = async () => {
    setError(null);
    const { settings: clean, error: invalid } = validatePricingSettings(settings);
    if (!clean) { setError(invalid ?? 'Check the prices'); return; }
    try {
      const { settings: s } = await api.saveSettings(clean);
      setSettings(s); await refreshSettings(); setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Pricing settings</Text>
      <Text style={styles.muted}>Signed in as {user?.name} ({user?.email}). Save up to {MAX_PRICING_PROFILES} price lists and pick one on each estimate.</Text>

      <View style={styles.row}>
        {settings.profiles.map((p, i) => (
          <TouchableOpacity key={p.id} style={[styles.chip, p.id === active.id && styles.chipActive]} onPress={() => setActiveId(p.id)}>
            <Text style={p.id === active.id ? styles.chipTextActive : styles.chipText}>{p.name || 'Untitled'}{i === 0 ? ' ★' : ''}</Text>
          </TouchableOpacity>
        ))}
        {settings.profiles.length < MAX_PRICING_PROFILES && (
          <TouchableOpacity style={styles.chip} onPress={addList}><Text style={styles.chipText}>+ Add list</Text></TouchableOpacity>
        )}
      </View>

      <View style={{ gap: 4 }}>
        <Text style={styles.label}>Price list name</Text>
        <TextInput style={styles.input} maxLength={40} value={active.name} onChangeText={(v) => updateActive({ name: v })}
          placeholder="e.g. Standard, Premium" placeholderTextColor={colors.muted} />
        {isDefault
          ? <Text style={[styles.muted, styles.small]}>★ Default — new estimates use this list.</Text>
          : <TouchableOpacity onPress={makeDefault}><Text style={{ color: colors.gold }}>Make this the default list</Text></TouchableOpacity>}
      </View>
      <View style={{ gap: 4 }}>
        <Text style={styles.label}>Bulb spacing (inches)</Text>
        <NumberInput value={active.bulbSpacingInches} onChange={(v) => updateActive({ bulbSpacingInches: v })} />
      </View>

      <View style={styles.row}>
        {(['seasonal', 'permanent'] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.chip, type === t && styles.chipActive]} onPress={() => setType(t)}>
            <Text style={type === t ? styles.chipTextActive : styles.chipText}>{INSTALL_TYPE_LABELS[t]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[styles.muted, styles.small]}>
        {type === 'seasonal' ? 'Seasonal: hung for the holidays, taken down after.' : 'Permanent: year-round LED track lighting.'}
      </Text>
      {RATE_CARD_FIELDS.map(({ key, label }) => (
        <View key={`${active.id}-${type}-${key}`} style={{ gap: 4 }}>
          <Text style={styles.label}>{label}</Text>
          <NumberInput value={active[type][key]} onChange={(v) => setRate(key, v)} />
        </View>
      ))}

      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity style={styles.button} onPress={save}><Text style={styles.buttonText}>{saved ? 'Saved ✓' : 'Save pricing'}</Text></TouchableOpacity>
      <TouchableOpacity style={styles.buttonGhost} onPress={resetActive}><Text style={styles.buttonGhostText}>Reset this list to defaults</Text></TouchableOpacity>
      {settings.profiles.length > 1 && (
        <TouchableOpacity style={styles.buttonGhost} onPress={removeActive}><Text style={styles.error}>Delete this list</Text></TouchableOpacity>
      )}
      <TouchableOpacity style={styles.buttonGhost} onPress={() => logout()}><Text style={styles.buttonGhostText}>Log out</Text></TouchableOpacity>
    </ScrollView>
  );
}
