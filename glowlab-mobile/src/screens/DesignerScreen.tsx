import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import type { LineKind, Point } from '@glowlab/shared';
import { lineLengthsFeet, normalizeEstimateOptions, polylineLengthFeet, profileFor, totalFeet } from '@glowlab/shared';
import Stage from '../Stage';
import { useWorkspace } from '../workspace';
import { colors, styles } from '../theme';

const KINDS: LineKind[] = ['roofline', 'ridge', 'gutter', 'window', 'door', 'pathway', 'tree', 'outline'];
let uid = 0;

/**
 * Designer. Photo measuring note: expo-image-picker returns the asset's real
 * width/height, which we store as imageWidth/Height for the geometry math. If
 * a picker build ever omits them, we fall back to the on-screen layout size
 * captured via onLayout — normalized coordinates make the math identical as
 * long as width/height share the photo's aspect ratio.
 */
export default function DesignerScreen() {
  const { current, presets, settings, updateCurrent, saveCurrent } = useWorkspace();
  const [mode, setMode] = useState<'trace' | 'calibrate'>('trace');
  const [kind, setKind] = useState<LineKind>('roofline');
  const [currentPts, setCurrentPts] = useState<Point[]>([]);
  const [calPts, setCalPts] = useState<Point[]>([]);
  const [night, setNight] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Projects saved before previews existed: make the list preview from the photo; it's saved with the next save.
  const needsThumb = Boolean(current?.photoDataUrl && !current.thumbDataUrl);
  useEffect(() => {
    if (!needsThumb || !current?.photoDataUrl) return;
    const photo = current.photoDataUrl;
    ImageManipulator.manipulateAsync(photo, [{ resize: { width: 400 } }], { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG, base64: true })
      .then((t) => { if (t.base64 && current.photoDataUrl === photo) updateCurrent({ ...current, thumbDataUrl: `data:image/jpeg;base64,${t.base64}` }); })
      .catch(() => undefined); // no preview is fine; the card shows a placeholder
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, needsThumb]);

  if (!current) {
    return <View style={[styles.screen, { padding: 20 }]}><Text style={styles.muted}>Pick or create a project on the Projects tab first.</Text></View>;
  }
  const project = current;
  const preset = presets.find((p) => p.id === project.presetId) ?? presets[0];
  const size = { width: project.imageWidth, height: project.imageHeight };
  const lengths = lineLengthsFeet(project);
  const feet = preset ? totalFeet(project, preset) : 0;
  const opts = normalizeEstimateOptions(project.estimateOptions);
  const spacingInches = profileFor(settings, opts).bulbSpacingInches;

  const onTap = (p: Point) => {
    if (mode === 'calibrate') {
      const pts = [...calPts, p].slice(-2);
      setCalPts(pts);
      if (pts.length === 2) updateCurrent({ ...project, calibration: { a: pts[0], b: pts[1], realFeet: project.calibration?.realFeet ?? 3 } });
    } else setCurrentPts([...currentPts, p]);
  };

  const applyFeet = (realFeet: number) => {
    if (calPts.length === 2) updateCurrent({ ...project, calibration: { a: calPts[0], b: calPts[1], realFeet } });
    else if (project.calibration) updateCurrent({ ...project, calibration: { ...project.calibration, realFeet } });
  };

  const finishLine = () => {
    if (currentPts.length < 2) return;
    updateCurrent({ ...project, lines: [...project.lines, { id: `line-${Date.now()}-${uid++}`, kind, points: currentPts }] });
    setCurrentPts([]);
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError('Photo library permission was not granted.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      // Full photo: at most 1600px wide (the API, on Vercel, rejects requests over 4.5 MB).
      // Preview: ~400px wide, shown on the project list.
      const wide = (asset.width || 0) >= (asset.height || 0);
      const fit = (max: number) => (wide ? { width: Math.min(max, asset.width || max) } : { height: Math.min(max, asset.height || max) });
      const photo = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: fit(1600) }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      const thumb = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: fit(400) }], { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      if (!photo.base64 || photo.base64.length > 3_500_000) { setError('That photo is too large. Try a smaller one.'); return; }
      updateCurrent({
        ...project,
        photoDataUrl: `data:image/jpeg;base64,${photo.base64}`,
        thumbDataUrl: thumb.base64 ? `data:image/jpeg;base64,${thumb.base64}` : null,
        imageWidth: photo.width, imageHeight: photo.height, calibration: null, lines: [],
      });
    } catch (e) { setError(`Could not process that photo: ${(e as Error).message}`); }
  };

  const save = async () => {
    try { await saveCurrent(); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch (e) { setError((e as Error).message); }
  };


  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>{project.clientName}</Text>
      <Text style={styles.muted}>{project.address}</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.row}>
        <TouchableOpacity style={styles.buttonGhost} onPress={pickPhoto}><Text style={styles.buttonGhostText}>Pick photo</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.chip, night && styles.chipActive]} onPress={() => setNight(!night)}>
          <Text style={night ? styles.chipTextActive : styles.chipText}>Night {night ? 'on' : 'off'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={save}><Text style={styles.buttonText}>{saved ? 'Saved ✓' : 'Save'}</Text></TouchableOpacity>
      </View>

      {preset && (
        <Stage project={project} preset={preset} spacingInches={spacingInches} installType={opts.installType} night={night}
          guides extraLines={currentPts.length ? [{ id: 'cur', kind, points: currentPts }] : undefined} onTap={onTap} />
      )}
      <Text style={styles.muted}>Tap the photo to add points. Total for this preset: {feet.toFixed(1)} ft{currentPts.length ? ` • current line ${polylineLengthFeet(currentPts, project.calibration, size).toFixed(1)} ft` : ''}</Text>

      <View style={styles.row}>
        {(['trace', 'calibrate'] as const).map((m) => (
          <TouchableOpacity key={m} style={[styles.chip, mode === m && styles.chipActive]} onPress={() => setMode(m)}>
            <Text style={mode === m ? styles.chipTextActive : styles.chipText}>{m === 'trace' ? 'Trace' : 'Calibrate'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {mode === 'trace' ? (
        <>
          <View style={styles.row}>
            {KINDS.map((k) => (
              <TouchableOpacity key={k} style={[styles.chip, kind === k && styles.chipActive]} onPress={() => setKind(k)}>
                <Text style={kind === k ? styles.chipTextActive : styles.chipText}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.row}>
            <TouchableOpacity style={styles.button} onPress={finishLine}><Text style={styles.buttonText}>Finish line</Text></TouchableOpacity>
            <TouchableOpacity style={styles.buttonGhost} onPress={() => setCurrentPts(currentPts.slice(0, -1))}><Text style={styles.buttonGhostText}>Undo point</Text></TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={styles.row}>
          <Text style={styles.muted}>Tap 2 points on a known width, then:</Text>
          <TouchableOpacity style={styles.buttonGhost} onPress={() => applyFeet(3)}><Text style={styles.buttonGhostText}>Door 3 ft</Text></TouchableOpacity>
          <TouchableOpacity style={styles.buttonGhost} onPress={() => applyFeet(9)}><Text style={styles.buttonGhostText}>Garage 9 ft</Text></TouchableOpacity>
        </View>
      )}

      <Text style={styles.h2}>Preset</Text>
      <View style={styles.row}>
        {presets.map((p) => (
          <TouchableOpacity key={p.id} style={[styles.chip, project.presetId === p.id && styles.chipActive]} onPress={() => updateCurrent({ ...project, presetId: p.id })}>
            <Text style={project.presetId === p.id ? styles.chipTextActive : styles.chipText}>{p.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.h2}>Lines</Text>
      {!project.calibration && <Text style={styles.error}>No calibration yet — lengths read 0 until you calibrate.</Text>}
      {project.lines.map((l) => (
        <View key={l.id} style={[styles.row, { justifyContent: 'space-between' }]}>
          <Text style={{ color: colors.ink }}><Text style={styles.badge}>{l.kind}</Text>  {(lengths[l.id] ?? 0).toFixed(1)} ft</Text>
          <TouchableOpacity onPress={() => updateCurrent({ ...project, lines: project.lines.filter((x) => x.id !== l.id) })}>
            <Text style={styles.error}>Delete</Text>
          </TouchableOpacity>
        </View>
      ))}
      {project.lines.length === 0 && <Text style={styles.muted}>No lines yet. Trace the roofline first.</Text>}
    </ScrollView>
  );
}
