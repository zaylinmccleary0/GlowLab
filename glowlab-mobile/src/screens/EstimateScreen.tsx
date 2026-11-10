import { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { EstimateOptions } from '@glowlab/shared';
import { computeEstimate, money } from '@glowlab/shared';
import { useWorkspace } from '../workspace';
import { colors, styles } from '../theme';

export default function EstimateScreen() {
  const { current, presets, settings, updateCurrent, saveCurrent } = useWorkspace();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!current) {
    return <View style={[styles.screen, { padding: 20 }]}><Text style={styles.muted}>Pick or create a project on the Projects tab first.</Text></View>;
  }
  const project = current;
  const preset = presets.find((p) => p.id === project.presetId) ?? presets[0];
  if (!preset) return <View style={[styles.screen, { padding: 20 }]}><Text style={styles.muted}>Loading presets…</Text></View>;
  const estimate = computeEstimate(project, preset, settings, project.estimateOptions);

  const setOptions = (patch: Partial<EstimateOptions>) => updateCurrent({ ...project, estimateOptions: { ...project.estimateOptions, ...patch } });
  const setAddOn = (key: keyof EstimateOptions['addOns'], delta: number) =>
    setOptions({ addOns: { ...project.estimateOptions.addOns, [key]: Math.max(0, project.estimateOptions.addOns[key] + delta) } });

  const save = async () => {
    try { await saveCurrent(); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch (e) { setError((e as Error).message); }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Estimate — {project.clientName}</Text>
      <Text style={styles.muted}>{preset.name} • {estimate.totalFeet} ft • {estimate.bulbCount} bulbs • {estimate.clipCount} clips</Text>
      <View style={styles.row}>
        {(['rental', 'purchase'] as const).map((m) => (
          <TouchableOpacity key={m} style={[styles.chip, project.estimateOptions.model === m && styles.chipActive]} onPress={() => setOptions({ model: m })}>
            <Text style={project.estimateOptions.model === m ? styles.chipTextActive : styles.chipText}>{m}</Text>
          </TouchableOpacity>
        ))}
        {([1, 2] as const).map((s) => (
          <TouchableOpacity key={s} style={[styles.chip, project.estimateOptions.stories === s && styles.chipActive]} onPress={() => setOptions({ stories: s })}>
            <Text style={project.estimateOptions.stories === s ? styles.chipTextActive : styles.chipText}>{s} {s === 1 ? 'story' : 'stories'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={[styles.chip, project.estimateOptions.steepRoof && styles.chipActive]} onPress={() => setOptions({ steepRoof: !project.estimateOptions.steepRoof })}>
        <Text style={project.estimateOptions.steepRoof ? styles.chipTextActive : styles.chipText}>Steep roof (+{money(settings.steepRoofFee)}) {project.estimateOptions.steepRoof ? '✓' : ''}</Text>
      </TouchableOpacity>
      {([['wreaths', 'Wreaths', settings.wreathPrice], ['pathwayStakes', 'Pathway stakes', settings.pathwayStakePrice], ['treeWraps', 'Tree wraps', settings.treeWrapPrice], ['timers', 'Timers', settings.timerPrice]] as const).map(([key, label, price]) => (
        <View key={key} style={[styles.row, { justifyContent: 'space-between' }]}>
          <Text style={{ color: colors.ink }}>{label} <Text style={styles.muted}>{money(price)} ea</Text></Text>
          <View style={styles.row}>
            <TouchableOpacity style={styles.buttonGhost} onPress={() => setAddOn(key, -1)}><Text style={styles.buttonGhostText}>−</Text></TouchableOpacity>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>{project.estimateOptions.addOns[key]}</Text>
            <TouchableOpacity style={styles.buttonGhost} onPress={() => setAddOn(key, 1)}><Text style={styles.buttonGhostText}>+</Text></TouchableOpacity>
          </View>
        </View>
      ))}
      <View style={styles.card}>
        {estimate.lines.map((l, i) => (
          <View key={i} style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={{ color: colors.ink, flex: 1 }}>{l.label}{'\n'}<Text style={styles.muted}>{l.detail}</Text></Text>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>{money(l.amount)}</Text>
          </View>
        ))}
        <Text style={styles.h2}>Total: {money(estimate.total)}</Text>
        <Text style={styles.muted}>Deposit due (50%): {money(estimate.depositDue)}</Text>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity style={styles.button} onPress={save}><Text style={styles.buttonText}>{saved ? 'Saved ✓' : 'Save project'}</Text></TouchableOpacity>
    </ScrollView>
  );
}
