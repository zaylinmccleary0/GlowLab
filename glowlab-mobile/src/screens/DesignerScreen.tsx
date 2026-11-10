import { useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import type { LineKind, Point } from '@glowlab/shared';
import { bulbPositions, lineLengthsFeet, polylineLengthFeet, totalFeet } from '@glowlab/shared';
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
  const { current, presets, updateCurrent, saveCurrent } = useWorkspace();
  const [mode, setMode] = useState<'trace' | 'calibrate'>('trace');
  const [kind, setKind] = useState<LineKind>('roofline');
  const [currentPts, setCurrentPts] = useState<Point[]>([]);
  const [calPts, setCalPts] = useState<Point[]>([]);
  const [night, setNight] = useState(true);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!current) {
    return <View style={[styles.screen, { padding: 20 }]}><Text style={styles.muted}>Pick or create a project on the Projects tab first.</Text></View>;
  }
  const project = current;
  const preset = presets.find((p) => p.id === project.presetId) ?? presets[0];
  const size = { width: project.imageWidth, height: project.imageHeight };
  const lengths = lineLengthsFeet(project);
  const feet = preset ? totalFeet(project, preset) : 0;

  const onTap = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    if (!stageSize.w || !stageSize.h) return;
    const p: Point = { x: Math.min(1, Math.max(0, locationX / stageSize.w)), y: Math.min(1, Math.max(0, locationY / stageSize.h)) };
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
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.35, base64: true });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    // The API (Vercel) rejects requests over 4.5 MB; leave headroom for the rest of the project.
    if (asset.base64 && asset.base64.length > 3_500_000) { setError('That photo is too large. Try a smaller one or a screenshot of it.'); return; }
    const w = asset.width || Math.round(stageSize.w) || 1000;
    const h = asset.height || Math.round(stageSize.h) || 600;
    updateCurrent({
      ...project,
      photoDataUrl: asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri,
      imageWidth: w, imageHeight: h, calibration: null, lines: [],
    });
  };

  const save = async () => {
    try { await saveCurrent(); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch (e) { setError((e as Error).message); }
  };

  const aspect = project.imageWidth / Math.max(1, project.imageHeight);
  const allLines = currentPts.length ? [...project.lines, { id: 'cur', kind, points: currentPts }] : project.lines;

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

      <View
        style={{ width: '100%', aspectRatio: aspect, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden', opacity: night ? 0.92 : 1 }}
        onLayout={(e) => setStageSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        onTouchEnd={onTap}
      >
        {project.photoDataUrl ? (
          <Image source={{ uri: project.photoDataUrl }} style={{ position: 'absolute', width: '100%', height: '100%', opacity: night ? 0.6 : 1 }} resizeMode="cover" />
        ) : (
          <View style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#2b3a55', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#dfe8ff', fontWeight: '700' }}>Demo House (no photo yet)</Text>
          </View>
        )}
        {stageSize.w > 0 && preset && (
          <Svg width={stageSize.w} height={stageSize.h} style={{ position: 'absolute' }}>
            {allLines.map((line) => (
              <Polyline key={`t-${line.id}`} fill="none" stroke="rgba(255,255,255,.4)" strokeWidth={1.5} strokeDasharray="5 5"
                points={line.points.map((p) => `${p.x * stageSize.w},${p.y * stageSize.h}`).join(' ')} />
            ))}
            {project.calibration && (
              <Line x1={project.calibration.a.x * stageSize.w} y1={project.calibration.a.y * stageSize.h}
                x2={project.calibration.b.x * stageSize.w} y2={project.calibration.b.y * stageSize.h} stroke="#ff4fd8" strokeWidth={2} />
            )}
            {project.lines.filter((l) => preset.appliesTo.includes(l.kind)).map((line) =>
              bulbPositions(line, project.calibration, size, preset.spacingInches).map((b) => (
                <Circle key={`${line.id}-${b.index}`} cx={b.point.x * stageSize.w} cy={b.point.y * stageSize.h} r={5}
                  fill={preset.bulbColors[b.index % preset.bulbColors.length]} stroke="#fff8" strokeWidth={0.7} />
              )),
            )}
          </Svg>
        )}
      </View>
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
