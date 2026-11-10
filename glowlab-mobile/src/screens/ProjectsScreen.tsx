import { useCallback, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DEFAULT_ESTIMATE_OPTIONS, computeEstimate, getPreset, money } from '@glowlab/shared';
import { api } from '../api';
import { useWorkspace } from '../workspace';
import { colors, styles } from '../theme';

export default function ProjectsScreen({ navigation }: { navigation: { navigate: (route: string) => void } }) {
  const { projects, settings, reload, setCurrent } = useWorkspace();
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { reload().catch(() => undefined); }, [reload]));

  const create = async () => {
    try {
      const { project } = await api.createProject({
        clientName: clientName.trim(), address: address.trim(), photoDataUrl: null,
        imageWidth: 1000, imageHeight: 600, calibration: null, lines: [],
        presetId: 'classic-warm-white', estimateOptions: DEFAULT_ESTIMATE_OPTIONS,
      });
      setClientName(''); setAddress('');
      setCurrent(project);
      navigation.navigate('Designer');
    } catch (e) { setError((e as Error).message); }
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
        const est = preset ? computeEstimate(p, preset, settings, p.estimateOptions) : null;
        return (
          <TouchableOpacity key={p.id} style={styles.card} onPress={() => { setCurrent(p); navigation.navigate('Designer'); }}>
            <Text style={styles.cardTitle}>{p.clientName}</Text>
            <Text style={styles.muted}>{p.address || 'No address'}</Text>
            <View style={styles.row}><Text style={styles.badge}>{preset?.name ?? p.presetId}</Text></View>
            <Text style={styles.muted}>{p.lines.length} line(s){est ? ` • ${est.totalFeet} ft • ${money(est.total)}` : ''}</Text>
          </TouchableOpacity>
        );
      })}
      {projects.length === 0 && <Text style={styles.muted}>No projects yet — create your first estimate above.</Text>}
    </ScrollView>
  );
}
