import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { LineKind, Project } from '@glowlab/shared';
import {
  DEFAULT_ESTIMATE_OPTIONS, INSTALL_TYPE_LABELS, computeEstimate, getPreset, lineLengthsFeet, money, normalizeEstimateOptions, profileFor,
} from '@glowlab/shared';
import { api } from '../api';
import { useWorkspace } from '../workspace';
import Stage from '../Stage';
import { colors, styles } from '../theme';

/** Feet traced per kind of line, e.g. [['roofline', 62.4], ['gutter', 30.1]]. */
function feetByKind(p: Project): [LineKind, number][] {
  const lengths = lineLengthsFeet(p);
  const totals = new Map<LineKind, number>();
  for (const l of p.lines) totals.set(l.kind, (totals.get(l.kind) ?? 0) + (lengths[l.id] ?? 0));
  return [...totals.entries()];
}

export default function ProjectsScreen({ navigation }: { navigation: { navigate: (route: string) => void } }) {
  const ws = useWorkspace();
  const { projects, settings, reload, setCurrent } = ws;
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef(ws);
  wsRef.current = ws;

  // Coming back to this tab: save the open project's changes first (so a new photo isn't lost), then refresh.
  useFocusEffect(useCallback(() => {
    wsRef.current.saveIfDirty()
      .catch((e: Error) => setError(`Couldn't save your last changes: ${e.message}`))
      .finally(() => { reload().catch(() => undefined); });
  }, [reload]));

  const create = async () => {
    try {
      await ws.saveIfDirty();
      const { project } = await api.createProject({
        clientName: clientName.trim(), address: address.trim(), photoDataUrl: null, thumbDataUrl: null,
        imageWidth: 1000, imageHeight: 600, calibration: null, lines: [],
        presetId: 'classic-warm-white', estimateOptions: DEFAULT_ESTIMATE_OPTIONS,
      });
      setClientName(''); setAddress('');
      setCurrent(project);
      navigation.navigate('Designer');
    } catch (e) { setError((e as Error).message); }
  };

  // The list has no full-size photos (keeps it small), so load the full project before opening it.
  const open = async (id: string) => {
    try {
      await ws.saveIfDirty();
      const { project } = await api.getProject(id);
      setCurrent(project); navigation.navigate('Designer');
    } catch (e) { setError((e as Error).message); }
  };

  const remove = (p: Project) => {
    Alert.alert('Delete project?', `Delete the project for ${p.clientName}? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        api.deleteProject(p.id).then(() => { if (ws.current?.id === p.id) setCurrent(null); return reload(); })
          .catch((e: Error) => setError(e.message));
      } },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Projects</Text>
      <Text style={styles.label}>Client name</Text>
      <TextInput style={styles.input} value={clientName} onChangeText={setClientName} placeholder="The Johnsons" placeholderTextColor={colors.muted} />
      <Text style={styles.label}>Address</Text>
      <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="123 Candy Cane Ln" placeholderTextColor={colors.muted} />
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity style={styles.button} onPress={create} disabled={!clientName.trim()}>
        <Text style={styles.buttonText}>+ New estimate</Text>
      </TouchableOpacity>
      {projects.map((p) => {
        const preset = getPreset(p.presetId);
        const opts = normalizeEstimateOptions(p.estimateOptions);
        const profile = profileFor(settings, opts);
        const est = preset ? computeEstimate(p, preset, settings, opts) : null;
        const missingPreview = p.hasPhoto && !p.thumbDataUrl;
        return (
          <TouchableOpacity key={p.id} style={styles.card} onPress={() => open(p.id)} onLongPress={() => remove(p)}>
            {preset && !missingPreview ? (
              <Stage project={p} photoUri={p.thumbDataUrl ?? null} preset={preset} spacingInches={profile.bulbSpacingInches}
                installType={opts.installType} night rounded={10} />
            ) : (
              <View style={{ aspectRatio: 5 / 3, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, alignItems: 'center', justifyContent: 'center', padding: 12 }}>
                <Text style={[styles.muted, { textAlign: 'center' }]}>Photo saved — open once to make its preview</Text>
              </View>
            )}
            <Text style={styles.cardTitle}>{p.clientName}</Text>
            <Text style={styles.muted}>{p.address || 'No address'}</Text>
            <View style={styles.row}>
              <Text style={styles.badge}>{preset?.name ?? p.presetId}</Text>
              <Text style={styles.badge}>{INSTALL_TYPE_LABELS[opts.installType]}</Text>
              {settings.profiles.length > 1 && <Text style={styles.badge}>{profile.name}</Text>}
            </View>
            {p.lines.length === 0 ? (
              <Text style={styles.muted}>No lines traced yet</Text>
            ) : !p.calibration ? (
              <Text style={styles.muted}>{p.lines.length} line(s) traced — not calibrated yet, so no feet or price</Text>
            ) : (
              <>
                {feetByKind(p).map(([k, ft]) => (
                  <View key={k} style={[styles.row, { justifyContent: 'space-between' }]}>
                    <Text style={{ color: colors.ink, textTransform: 'capitalize' }}>{k}</Text>
                    <Text style={{ color: colors.ink }}>{ft.toFixed(1)} ft</Text>
                  </View>
                ))}
                {est && (
                  <View style={[styles.row, { justifyContent: 'space-between' }]}>
                    <Text style={styles.muted}>{est.totalFeet} ft lit • {est.bulbCount} bulbs</Text>
                    <Text style={{ color: colors.gold, fontWeight: '800', fontSize: 18 }}>{money(est.total)}</Text>
                  </View>
                )}
              </>
            )}
          </TouchableOpacity>
        );
      })}
      {projects.length > 0 && <Text style={[styles.muted, styles.small]}>Tip: press and hold a project to delete it.</Text>}
      {projects.length === 0 && <Text style={styles.muted}>No projects yet — create your first estimate above.</Text>}
    </ScrollView>
  );
}
