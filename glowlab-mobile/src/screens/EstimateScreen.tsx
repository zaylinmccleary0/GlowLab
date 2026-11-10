import { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { EstimateOptions } from '@glowlab/shared';
import { INSTALL_TYPE_LABELS, QUOTE_DISCLAIMER, computeEstimate, money, normalizeEstimateOptions, profileFor, rateCardFor } from '@glowlab/shared';
import NumberInput from '../NumberInput';
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
  const opts = normalizeEstimateOptions(project.estimateOptions);
  const profile = profileFor(settings, opts);
  const card = rateCardFor(settings, opts);
  const estimate = computeEstimate(project, preset, settings, opts);

  const setOptions = (patch: Partial<EstimateOptions>) => updateCurrent({ ...project, estimateOptions: { ...opts, ...patch } });
  const setAddOn = (key: keyof EstimateOptions['addOns'], delta: number) =>
    setOptions({ addOns: { ...opts.addOns, [key]: Math.max(0, opts.addOns[key] + delta) } });

  const save = async () => {
    try { await saveCurrent(); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch (e) { setError((e as Error).message); }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Estimate — {project.clientName}</Text>
      <Text style={styles.muted}>{preset.name} • {INSTALL_TYPE_LABELS[opts.installType]} • {estimate.totalFeet} ft • {estimate.bulbCount} bulbs • {estimate.clipCount} clips</Text>
      {settings.profiles.length > 1 && (
        <>
          <Text style={styles.label}>Price list</Text>
          <View style={styles.row}>
            {settings.profiles.map((p) => (
              <TouchableOpacity key={p.id} style={[styles.chip, profile.id === p.id && styles.chipActive]} onPress={() => setOptions({ pricingProfileId: p.id })}>
                <Text style={profile.id === p.id ? styles.chipTextActive : styles.chipText}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
      <View style={styles.row}>
        {(['seasonal', 'permanent'] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.chip, opts.installType === t && styles.chipActive]} onPress={() => setOptions({ installType: t })}>
            <Text style={opts.installType === t ? styles.chipTextActive : styles.chipText}>{INSTALL_TYPE_LABELS[t]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ gap: 4 }}>
        <Text style={styles.label}>Price per linear foot ($)</Text>
        <NumberInput value={opts.ratePerFoot} placeholder={card.ratePerFoot.toFixed(2)}
          onChange={(v) => setOptions({ ratePerFoot: Number.isNaN(v) ? null : v })} />
        {opts.ratePerFoot === null
          ? <Text style={[styles.muted, styles.small]}>Using {profile.name} {INSTALL_TYPE_LABELS[opts.installType].toLowerCase()} rate, {money(card.ratePerFoot)}/ft. Type a price to change it for this job.</Text>
          : <TouchableOpacity onPress={() => setOptions({ ratePerFoot: null })}><Text style={{ color: colors.gold }}>Custom rate. Use {money(card.ratePerFoot)}/ft instead</Text></TouchableOpacity>}
      </View>
      <View style={styles.row}>
        {([1, 2] as const).map((s) => (
          <TouchableOpacity key={s} style={[styles.chip, opts.stories === s && styles.chipActive]} onPress={() => setOptions({ stories: s })}>
            <Text style={opts.stories === s ? styles.chipTextActive : styles.chipText}>{s} {s === 1 ? 'story' : 'stories'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={[styles.chip, opts.steepRoof && styles.chipActive]} onPress={() => setOptions({ steepRoof: !opts.steepRoof })}>
        <Text style={opts.steepRoof ? styles.chipTextActive : styles.chipText}>Steep roof (+{money(card.steepRoofFee)}) {opts.steepRoof ? '✓' : ''}</Text>
      </TouchableOpacity>
      {([['wreaths', 'Wreaths', card.wreathPrice], ['pathwayStakes', 'Pathway stakes', card.pathwayStakePrice], ['treeWraps', 'Tree wraps', card.treeWrapPrice], ['timers', 'Timers', card.timerPrice]] as const).map(([key, label, price]) => (
        <View key={key} style={[styles.row, { justifyContent: 'space-between' }]}>
          <Text style={{ color: colors.ink }}>{label} <Text style={styles.muted}>{money(price)} ea</Text></Text>
          <View style={styles.row}>
            <TouchableOpacity style={styles.buttonGhost} onPress={() => setAddOn(key, -1)}><Text style={styles.buttonGhostText}>−</Text></TouchableOpacity>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>{opts.addOns[key]}</Text>
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
        <Text style={[styles.muted, styles.small]}>Please note: {QUOTE_DISCLAIMER}</Text>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity style={styles.button} onPress={save}><Text style={styles.buttonText}>{saved ? 'Saved ✓' : 'Save project'}</Text></TouchableOpacity>
    </ScrollView>
  );
}
