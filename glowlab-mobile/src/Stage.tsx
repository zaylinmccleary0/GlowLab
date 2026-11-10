import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, Polyline, RadialGradient, Stop } from 'react-native-svg';
import type { InstallType, Point, Preset, Project, TracedLine } from '@glowlab/shared';
import { bulbColorFor, bulbDrawSize, bulbPositions, calibrationPixelsPerFoot } from '@glowlab/shared';

let stageCount = 0;

/**
 * The house photo with the lights drawn on it, at real size from the calibration.
 * `guides` adds the dashed tracing lines and pink calibration line (designer only).
 * `photoUri` overrides the background, e.g. the small preview on project cards.
 */
export default function Stage({ project, preset, spacingInches, installType, night, guides, extraLines, photoUri, onTap, rounded = 12 }: {
  project: Project; preset: Preset; spacingInches: number; installType: InstallType; night: boolean;
  guides?: boolean; extraLines?: TracedLine[]; photoUri?: string | null;
  onTap?: (p: Point, stage: { w: number; h: number }) => void; rounded?: number;
}) {
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [gid] = useState(() => `s${stageCount++}`);
  const size = { width: project.imageWidth, height: project.imageHeight };
  const aspect = project.imageWidth / Math.max(1, project.imageHeight);
  const permanent = installType === 'permanent';
  const ppf = calibrationPixelsPerFoot(project.calibration, size);
  const toScreen = stageSize.w / Math.max(1, project.imageWidth);
  const sz = ppf ? bulbDrawSize(ppf, project.imageWidth, installType) : null;
  const painted = preset.customizableBulbs ? project.lines.flatMap((l) => Object.values(l.bulbColors ?? {})) : [];
  const colorsUsed = Array.from(new Set([...preset.bulbColors, ...painted]));
  const photo = photoUri === undefined ? project.photoDataUrl : photoUri;
  const guideLines = extraLines?.length ? [...project.lines, ...extraLines] : project.lines;
  const litLines = sz ? project.lines.filter((l) => preset.appliesTo.includes(l.kind)) : [];
  const bulbsByLine = new Map(litLines.map((l) => [l.id, bulbPositions(l, project.calibration, size, spacingInches)]));
  const pts = (line: TracedLine) => line.points.map((p) => `${p.x * stageSize.w},${p.y * stageSize.h}`).join(' ');

  const handleTouch = (e: GestureResponderEvent) => {
    if (!onTap || !stageSize.w || !stageSize.h) return;
    const { locationX, locationY } = e.nativeEvent;
    onTap({ x: Math.min(1, Math.max(0, locationX / stageSize.w)), y: Math.min(1, Math.max(0, locationY / stageSize.h)) }, stageSize);
  };

  return (
    <View
      style={{ width: '100%', aspectRatio: aspect, backgroundColor: '#000', borderRadius: rounded, overflow: 'hidden', opacity: night ? 0.92 : 1 }}
      onLayout={(e) => setStageSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      onTouchEnd={onTap ? handleTouch : undefined}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={{ position: 'absolute', width: '100%', height: '100%', opacity: night ? 0.42 : 1 }} resizeMode="cover" />
      ) : (
        <View style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#2b3a55', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#dfe8ff', fontWeight: '700' }}>Demo House (no photo yet)</Text>
        </View>
      )}
      {night && <View pointerEvents="none" style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: 'rgba(12, 22, 64, 0.38)' }} />}
      {stageSize.w > 0 && (
        <Svg width={stageSize.w} height={stageSize.h} style={{ position: 'absolute' }}>
          <Defs>
            {colorsUsed.map((c, i) => (
              <RadialGradient key={c} id={`${gid}glow${i}`}>
                <Stop offset="0%" stopColor={c} stopOpacity={0.85} />
                <Stop offset="30%" stopColor={c} stopOpacity={0.35} />
                <Stop offset="100%" stopColor={c} stopOpacity={0} />
              </RadialGradient>
            ))}
          </Defs>
          {guides && guideLines.map((line) => (
            <Polyline key={`t-${line.id}`} fill="none" stroke="rgba(255,255,255,.4)" strokeWidth={1.5} strokeDasharray="5 5" points={pts(line)} />
          ))}
          {guides && project.calibration && (
            <Line x1={project.calibration.a.x * stageSize.w} y1={project.calibration.a.y * stageSize.h}
              x2={project.calibration.b.x * stageSize.w} y2={project.calibration.b.y * stageSize.h} stroke="#ff4fd8" strokeWidth={2} />
          )}
          {sz && project.lines.filter((l) => preset.appliesTo.includes(l.kind)).map((line) => (
            <G key={`lights-${line.id}`}>
              <Polyline fill="none" points={pts(line)}
                stroke={permanent ? '#3a3a3a' : '#1d3b22'} strokeWidth={Math.max(0.6, sz.wire * toScreen)} strokeLinecap="round" strokeLinejoin="round" opacity={night ? 0.6 : 0.9} />
              {(bulbsByLine.get(line.id) ?? []).map((b) => {
                const color = bulbColorFor(preset, line, b.index);
                const glow = `url(#${gid}glow${colorsUsed.indexOf(color)})`;
                const x = b.point.x * stageSize.w; const y = b.point.y * stageSize.h;
                const rx = Math.max(0.8, sz.rx * toScreen); const ry = Math.max(0.8, sz.ry * toScreen); const gr = sz.glowR * toScreen;
                if (permanent) {
                  return (
                    <G key={b.index}>
                      {night && <Circle cx={x} cy={y} r={gr * 3.2} fill={glow} opacity={0.22} />}
                      <Circle cx={x} cy={y} r={gr} fill={glow} opacity={night ? 1 : 0.45} />
                      <Circle cx={x} cy={y} r={rx} fill={color} />
                    </G>
                  );
                }
                // C9 bulb standing up off the cord: long axis perpendicular to the line, pointing upward.
                const a = (b.angleDeg * Math.PI) / 180;
                let nx = Math.sin(a); let ny = -Math.cos(a);
                if (ny > 0) { nx = -nx; ny = -ny; }
                const cx = x + nx * ry; const cy = y + ny * ry;
                const rot = (Math.atan2(ny, nx) * 180) / Math.PI + 90;
                return (
                  <G key={b.index}>
                    {night && <Circle cx={x} cy={y} r={gr * 3.2} fill={glow} opacity={0.22} />}
                    <Circle cx={cx} cy={cy} r={gr} fill={glow} opacity={night ? 1 : 0.45} />
                    <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={color} rotation={rot} origin={`${cx}, ${cy}`} />
                  </G>
                );
              })}
            </G>
          ))}
        </Svg>
      )}
    </View>
  );
}
