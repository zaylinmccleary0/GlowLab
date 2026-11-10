import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { EstimateOptions, InstallType, LineKind, Point, Preset, PricingSettings, Project, TracedLine } from '@glowlab/shared';
import {
  COOL_WHITE, INSTALL_TYPE_LABELS, PAINT_COLORS, bulbColorFor, bulbDrawSize, bulbPositions, nearestBulb, calibrationPixelsPerFoot, computeEstimate, lineLengthsFeet, money,
  normalizeEstimateOptions, polylineLengthFeet, profileFor, rateCardFor, totalFeet,
} from '@glowlab/shared';
import { api, type ProjectInput } from '../api';
import NumberField from '../NumberField';

const ICICLE_COLOR = COOL_WHITE;

/** Small JPEG copy of a photo for the project list (~400px wide, usually 15–40 KB). */
function makeThumb(img: HTMLImageElement): string | null {
  const MAX = 400;
  const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.65);
}

const KINDS: LineKind[] = ['roofline', 'ridge', 'gutter', 'window', 'door', 'pathway', 'tree', 'outline'];
let uid = 0;
const nextId = () => `line-${Date.now()}-${uid++}`;

function DemoHouse() {
  // Simple inline SVG house backdrop used when no photo is uploaded.
  return (
    <svg viewBox="0 0 1000 600" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-label="Demo House">
      <rect width="1000" height="600" fill="#2b3a55" />
      <rect y="470" width="1000" height="130" fill="#23301f" />
      <rect x="220" y="260" width="560" height="220" fill="#cbb59a" />
      <polygon points="180,265 500,110 820,265" fill="#6e3b2e" />
      <rect x="455" y="350" width="90" height="130" fill="#5a4030" />
      <rect x="270" y="300" width="90" height="80" fill="#f5eeda" stroke="#5a4030" strokeWidth="6" />
      <rect x="640" y="300" width="90" height="80" fill="#f5eeda" stroke="#5a4030" strokeWidth="6" />
      <rect x="800" y="330" width="120" height="150" fill="#8b93a1" />
      <text x="500" y="580" textAnchor="middle" fill="#dfe8ff" fontSize="26" fontWeight="700">Demo House — trace the roofline to try it</text>
    </svg>
  );
}

export function HouseStage({ project, preset, spacingInches, installType, night, interactive, onTap }: {
  project: Project; preset: Preset; spacingInches: number; installType: InstallType; night: boolean; interactive?: boolean;
  onTap?: (p: Point) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, '');
  const W = project.imageWidth || 1000;
  const H = project.imageHeight || 600;
  const imageSize = { width: W, height: H };
  const ppf = calibrationPixelsPerFoot(project.calibration, imageSize);
  // Bulbs are sized in real inches from the calibration, so they're to scale with the house.
  const sz = ppf ? bulbDrawSize(ppf, W, installType) : null;
  const permanent = installType === 'permanent';
  const painted = preset.customizableBulbs ? project.lines.flatMap((l) => Object.values(l.bulbColors ?? {})) : [];
  const colors = Array.from(new Set([...preset.bulbColors, ICICLE_COLOR, ...painted]));
  const gradId = (c: string) => `glow-${uid}-${colors.indexOf(c)}`;
  const glowOpacity = night ? 1 : 0.45;
  // Night: the photo is darkened to dusk with a blue sky tint, and each bulb throws a faint
  // wide pool of light onto the house so the lights read as the brightest thing in the scene.
  const photoFilter = night ? 'brightness(.42) contrast(1.08) saturate(.8)' : 'none';

  const handleClick = (e: React.MouseEvent) => {
    if (!interactive || !onTap || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    onTap({ x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
  };
  const pts = (line: TracedLine) => line.points.map((p) => `${p.x * W},${p.y * H}`).join(' ');

  return (
    <div ref={ref} className="stage" style={{ aspectRatio: `${W} / ${H}` }} onClick={handleClick}>
      {project.photoDataUrl
        ? <img src={project.photoDataUrl} alt="House" className="stage-photo" style={{ filter: photoFilter }} />
        : <div className="stage-photo" style={{ filter: photoFilter }}><DemoHouse /></div>}
      {night && <div className="night-tint" aria-hidden="true" />}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="stage-overlay">
        <defs>
          {colors.map((c) => (
            <radialGradient key={c} id={gradId(c)}>
              <stop offset="0%" stopColor={c} stopOpacity={0.85} />
              <stop offset="30%" stopColor={c} stopOpacity={0.35} />
              <stop offset="100%" stopColor={c} stopOpacity={0} />
            </radialGradient>
          ))}
        </defs>
        {/* Tracing guides (dashed lines, pink calibration) only while designing, never on the quote. */}
        {interactive && project.lines.map((line) => (
          <polyline key={`trace-${line.id}`} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth={W * 0.002} strokeDasharray="6 6" points={pts(line)} />
        ))}
        {interactive && project.calibration && (
          <line x1={project.calibration.a.x * W} y1={project.calibration.a.y * H} x2={project.calibration.b.x * W} y2={project.calibration.b.y * H}
            stroke="#ff4fd8" strokeWidth={W * 0.003} />
        )}
        {sz && ppf && preset.icicle && project.lines.filter((l) => l.kind === 'gutter').map((line) => {
          const dropPx = ((preset.icicleDropInches ?? 18) / 12) * ppf;
          return bulbPositions(line, project.calibration, imageSize, spacingInches * 2).map((b, i) => {
            const x = b.point.x * W; const y = b.point.y * H;
            return (
              <g key={`ic-${line.id}-${i}`}>
                <line x1={x} y1={y} x2={x} y2={y + dropPx} stroke={ICICLE_COLOR} strokeWidth={sz.wire} opacity={0.85} />
                <circle cx={x} cy={y + dropPx} r={sz.glowR * 0.7} fill={`url(#${gradId(ICICLE_COLOR)})`} opacity={glowOpacity} />
                <circle cx={x} cy={y + dropPx} r={sz.rx * 0.8} fill={ICICLE_COLOR} />
              </g>
            );
          });
        })}
        {sz && project.lines.filter((l) => preset.appliesTo.includes(l.kind)).map((line) => {
          const bulbs = bulbPositions(line, project.calibration, imageSize, spacingInches);
          return (
            <g key={`lights-${line.id}`}>
              {/* Cord (seasonal) or mounting track (permanent) */}
              <polyline fill="none" points={pts(line)} strokeLinecap="round" strokeLinejoin="round"
                stroke={permanent ? '#3a3a3a' : '#1d3b22'} strokeWidth={sz.wire} opacity={night ? 0.6 : 0.9} />
              {bulbs.map((b) => {
                const color = bulbColorFor(preset, line, b.index);
                const x = b.point.x * W; const y = b.point.y * H;
                const spill = night && <circle cx={x} cy={y} r={sz.glowR * 3.2} fill={`url(#${gradId(color)})`} opacity={0.22} />;
                if (permanent) {
                  return (
                    <g key={b.index}>
                      {spill}
                      <circle cx={x} cy={y} r={sz.glowR} fill={`url(#${gradId(color)})`} opacity={glowOpacity} />
                      <circle cx={x} cy={y} r={sz.rx} fill={color} stroke="#0006" strokeWidth={sz.rx * 0.25} />
                    </g>
                  );
                }
                // C9 bulb standing up off the cord: long axis perpendicular to the line, pointing upward.
                const a = (b.angleDeg * Math.PI) / 180;
                let nx = Math.sin(a); let ny = -Math.cos(a);
                if (ny > 0) { nx = -nx; ny = -ny; }
                const cx = x + nx * sz.ry; const cy = y + ny * sz.ry;
                const rot = (Math.atan2(ny, nx) * 180) / Math.PI + 90;
                return (
                  <g key={b.index}>
                    {spill}
                    <circle cx={cx} cy={cy} r={sz.glowR} fill={`url(#${gradId(color)})`} opacity={glowOpacity} />
                    <ellipse cx={cx} cy={cy} rx={sz.rx} ry={sz.ry} fill={color} transform={`rotate(${rot} ${cx} ${cy})`} />
                    <ellipse cx={cx} cy={cy} rx={sz.rx * 0.45} ry={sz.ry * 0.5} fill="#fff" opacity={0.55} transform={`rotate(${rot} ${cx} ${cy})`} />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function DesignerView({ initial, presets, settings, onBack }: {
  initial: Project; presets: Preset[]; settings: PricingSettings; onBack: () => void;
}) {
  const [project, setProjectState] = useState<Project>(initial);
  // Unsaved changes: every edit goes through setProject, which marks the project dirty;
  // going back to Projects saves first so nothing (like a new photo) is lost.
  const [dirty, setDirty] = useState(false);
  const setProject = (p: Project | ((prev: Project) => Project)) => { setProjectState(p); setDirty(true); };
  const [mode, setMode] = useState<'trace' | 'calibrate' | 'paint'>('trace');
  const [paintColor, setPaintColor] = useState(PAINT_COLORS[2].color);
  const [kind, setKind] = useState<LineKind>('roofline');
  const [current, setCurrent] = useState<Point[]>([]);
  const [calPoints, setCalPoints] = useState<Point[]>([]);
  const [customFeet, setCustomFeet] = useState('3');
  const [night, setNight] = useState(true);
  const [showQuote, setShowQuote] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const preset = presets.find((p) => p.id === project.presetId) ?? presets[0];
  const size = { width: project.imageWidth, height: project.imageHeight };
  const lengths = useMemo(() => lineLengthsFeet(project), [project]);
  const feet = totalFeet(project, preset);
  const estimate = useMemo(
    () => (preset ? computeEstimate(project, preset, settings, project.estimateOptions) : null),
    [project, preset, settings],
  );

  const opts = normalizeEstimateOptions(project.estimateOptions);
  const profile = profileFor(settings, opts);
  const card = rateCardFor(settings, opts);
  const setOptions = (patch: Partial<EstimateOptions>) => setProject({ ...project, estimateOptions: { ...opts, ...patch } });
  const setAddOn = (key: keyof EstimateOptions['addOns'], delta: number) =>
    setOptions({ addOns: { ...opts.addOns, [key]: Math.max(0, opts.addOns[key] + delta) } });

  const canPaint = Boolean(preset?.customizableBulbs);
  const activeMode = mode === 'paint' && !canPaint ? 'trace' : mode;
  // Paint: recolor the bulb nearest the tap. Picking the design's own color clears the paint.
  const paintAt = (p: Point) => {
    const hit = nearestBulb(project, preset, profile.bulbSpacingInches, p);
    if (!hit) return;
    setProject({
      ...project,
      lines: project.lines.map((l) => {
        if (l.id !== hit.lineId) return l;
        const next = { ...(l.bulbColors ?? {}) };
        if (paintColor === preset.bulbColors[hit.index % preset.bulbColors.length]) delete next[String(hit.index)];
        else next[String(hit.index)] = paintColor;
        return { ...l, bulbColors: next };
      }),
    });
  };
  const paintAll = (color: string | null) => setProject({
    ...project,
    lines: project.lines.map((l) => {
      if (!preset.appliesTo.includes(l.kind)) return l;
      if (color === null) return { ...l, bulbColors: {} };
      const all: Record<string, string> = {};
      for (const b of bulbPositions(l, project.calibration, size, profile.bulbSpacingInches)) all[String(b.index)] = color;
      return { ...l, bulbColors: all };
    }),
  });
  const paintedCount = canPaint ? project.lines.reduce((n, l) => n + Object.keys(l.bulbColors ?? {}).length, 0) : 0;

  const onTap = (p: Point) => {
    if (activeMode === 'paint') { paintAt(p); return; }
    if (activeMode === 'calibrate') {
      const pts = [...calPoints, p].slice(-2);
      setCalPoints(pts);
      if (pts.length === 2) setProject({ ...project, calibration: { a: pts[0], b: pts[1], realFeet: project.calibration?.realFeet ?? 3 } });
    } else setCurrent([...current, p]);
  };

  const applyCalibrationFeet = (feetValue: number) => {
    if (calPoints.length === 2) setProject({ ...project, calibration: { a: calPoints[0], b: calPoints[1], realFeet: feetValue } });
    else if (project.calibration) setProject({ ...project, calibration: { ...project.calibration, realFeet: feetValue } });
  };

  const finishLine = () => {
    if (current.length < 2) return;
    const line: TracedLine = { id: nextId(), kind, points: current };
    setProject({ ...project, lines: [...project.lines, line] });
    setCurrent([]);
  };

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Shrink to at most 1600px on the long edge as a JPEG: phone photos are 5-10 MB,
        // and the API (Vercel) rejects requests over 4.5 MB.
        const MAX = 1600;
        const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { setError('Could not process that photo.'); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        setProject({ ...project, photoDataUrl: dataUrl, thumbDataUrl: makeThumb(img), imageWidth: w, imageHeight: h, calibration: null, lines: [] });
      };
      img.onerror = () => setError('Could not read that photo.');
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const useDemo = () => setProject({ ...project, photoDataUrl: null, thumbDataUrl: null, imageWidth: 1000, imageHeight: 600, calibration: null, lines: [] });

  // Projects saved before previews existed: make the preview now; it's saved with the next save.
  useEffect(() => {
    if (!initial.photoDataUrl || initial.thumbDataUrl) return;
    const img = new Image();
    img.onload = () => {
      const thumb = makeThumb(img);
      if (thumb) setProject((p) => (p.photoDataUrl === initial.photoDataUrl ? { ...p, thumbDataUrl: thumb } : p));
    };
    img.src = initial.photoDataUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (): Promise<boolean> => {
    try {
      const input: ProjectInput = {
        clientName: project.clientName, address: project.address, photoDataUrl: project.photoDataUrl,
        thumbDataUrl: project.thumbDataUrl ?? null,
        imageWidth: project.imageWidth, imageHeight: project.imageHeight, calibration: project.calibration,
        lines: project.lines, presetId: project.presetId, estimateOptions: project.estimateOptions,
      };
      const { project: savedProject } = await api.updateProject(project.id, input);
      setProjectState(savedProject); setDirty(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (err) { setError((err as Error).message); return false; }
  };

  const goBack = async () => {
    if (dirty && !(await save()) && !window.confirm('Your changes could not be saved. Leave anyway and lose them?')) return;
    onBack();
  };

  const previewProject: Project = { ...project, lines: current.length ? [...project.lines, { id: 'current', kind, points: current }] : project.lines };

  return (
    <div>
      <div className="toolbar no-print">
        <button onClick={goBack} title={dirty ? 'Saves your changes, then goes back' : undefined}>← Projects</button>
        <input className="inline-input" value={project.clientName} onChange={(e) => setProject({ ...project, clientName: e.target.value })} aria-label="Client name" />
        <input className="inline-input wide" value={project.address} onChange={(e) => setProject({ ...project, address: e.target.value })} placeholder="Address" aria-label="Address" />
        <button className="primary" onClick={() => { void save(); }}>{saved ? 'Saved ✓' : dirty ? 'Save project •' : 'Save project'}</button>
        <button onClick={() => setShowQuote(!showQuote)}>{showQuote ? 'Hide quote' : 'Quote view'}</button>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="designer-grid">
        <div>
          <div className="toolbar no-print">
            <button onClick={() => fileRef.current?.click()}>Upload photo</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
            <button onClick={useDemo}>Demo house</button>
            <label className="toggle"><input type="checkbox" checked={night} onChange={(e) => setNight(e.target.checked)} /> Night mode</label>
          </div>

          <HouseStage project={previewProject} preset={preset} spacingInches={profile.bulbSpacingInches} installType={opts.installType} night={night} interactive onTap={onTap} />
          {current.length > 0 && (
            <p className="muted small">Current line: {current.length} point(s), {polylineLengthFeet(current, project.calibration, size).toFixed(1)} ft — click the photo to add points.</p>
          )}

          <div className="toolbar no-print" style={{ marginTop: 12 }}>
            <div className="chips">
              <button className={activeMode === 'trace' ? 'chip active' : 'chip'} onClick={() => setMode('trace')}>Trace</button>
              <button className={activeMode === 'calibrate' ? 'chip active' : 'chip'} onClick={() => setMode('calibrate')}>Calibrate</button>
              {canPaint && <button className={activeMode === 'paint' ? 'chip active' : 'chip'} onClick={() => { setCurrent([]); setMode('paint'); }}>Paint bulbs</button>}
            </div>
            {activeMode === 'paint' ? (
              <>
                <span className="small muted">Pick a color, then click any bulb:</span>
                <div className="swatches" role="radiogroup" aria-label="Bulb color">
                  {PAINT_COLORS.map((c) => (
                    <button key={c.color} role="radio" aria-checked={paintColor === c.color} title={c.name} aria-label={c.name}
                      className={paintColor === c.color ? 'swatch-btn active' : 'swatch-btn'} style={{ background: c.color }}
                      onClick={() => setPaintColor(c.color)} />
                  ))}
                </div>
                <button onClick={() => paintAll(paintColor)} disabled={!project.calibration}>Fill all</button>
                <button onClick={() => paintAll(null)} disabled={!paintedCount}>Reset to warm white</button>
                {!project.calibration && <span className="small error">Calibrate first so bulbs can be placed.</span>}
              </>
            ) : activeMode === 'trace' ? (
              <>
                <select value={kind} onChange={(e) => setKind(e.target.value as LineKind)} aria-label="Line kind">
                  {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <button className="primary" onClick={finishLine} disabled={current.length < 2}>Finish line</button>
                <button onClick={() => setCurrent(current.slice(0, -1))} disabled={!current.length}>Undo point</button>
              </>
            ) : (
              <>
                <span className="small muted">Click 2 points on a known width, then set its real size:</span>
                <button onClick={() => applyCalibrationFeet(3)}>Front door 3 ft</button>
                <button onClick={() => applyCalibrationFeet(9)}>Garage 9 ft</button>
                <input style={{ width: 70 }} type="number" min="0.5" step="0.5" value={customFeet} onChange={(e) => setCustomFeet(e.target.value)} aria-label="Custom feet" />
                <button onClick={() => applyCalibrationFeet(Number(customFeet) || 3)}>Set custom ft</button>
              </>
            )}
          </div>

          <div className="no-print">
            <h3>Lines — total {feet.toFixed(1)} ft for this preset</h3>
            {!project.calibration && <p className="error">No calibration yet — lengths read 0 until you calibrate (door = 3 ft is the easy one).</p>}
            <ul className="line-list">
              {project.lines.map((l) => (
                <li key={l.id}>
                  <span className="badge">{l.kind}</span> {(lengths[l.id] ?? 0).toFixed(1)} ft
                  <button className="icon" onClick={() => setProject({ ...project, lines: project.lines.filter((x) => x.id !== l.id) })}>✕</button>
                </li>
              ))}
              {project.lines.length === 0 && <li className="muted">No lines yet. Trace the roofline first.</li>}
            </ul>
            <h3>Preset</h3>
            <div className="chips wrap">
              {presets.map((p) => (
                <button key={p.id} className={p.id === preset.id ? 'chip active' : 'chip'} onClick={() => setProject({ ...project, presetId: p.id })} title={p.description}>{p.name}</button>
              ))}
            </div>
            <p className="muted small">{preset.description} Bulbs: {preset.bulbColors.map((c) => <span key={c} className="swatch" style={{ background: c }} />)} {opts.installType === 'permanent' ? 'permanent LED' : preset.bulbSize}, every {profile.bulbSpacingInches}&quot;</p>
          </div>
        </div>

        <aside className="estimate-panel no-print">
          <h3>Estimate</h3>
          {settings.profiles.length > 1 && (
            <label className="field">Price list
              <select value={profile.id} onChange={(e) => setOptions({ pricingProfileId: e.target.value })}>
                {settings.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          <div className="chips">
            {(['seasonal', 'permanent'] as InstallType[]).map((t) => (
              <button key={t} className={opts.installType === t ? 'chip active' : 'chip'} onClick={() => setOptions({ installType: t })}>{INSTALL_TYPE_LABELS[t]}</button>
            ))}
          </div>
          <label className="field">Price per linear foot ($)
            <NumberField value={opts.ratePerFoot} placeholder={card.ratePerFoot.toFixed(2)}
              onChange={(v) => setOptions({ ratePerFoot: Number.isNaN(v) ? null : v })} ariaLabel="Price per linear foot" />
            <span className="muted small">
              {opts.ratePerFoot === null
                ? <>Using {profile.name} {INSTALL_TYPE_LABELS[opts.installType].toLowerCase()} rate, {money(card.ratePerFoot)}/ft. Type a price to change it for this job.</>
                : <>Custom rate for this job. <button className="link" onClick={() => setOptions({ ratePerFoot: null })}>Use {money(card.ratePerFoot)}/ft</button></>}
            </span>
          </label>
          <div className="chips">
            <button className={opts.stories === 1 ? 'chip active' : 'chip'} onClick={() => setOptions({ stories: 1 })}>1 story</button>
            <button className={opts.stories === 2 ? 'chip active' : 'chip'} onClick={() => setOptions({ stories: 2 })}>2 stories</button>
          </div>
          <label className="toggle"><input type="checkbox" checked={opts.steepRoof} onChange={(e) => setOptions({ steepRoof: e.target.checked })} /> Steep / difficult roof (+{money(card.steepRoofFee)})</label>
          {([['wreaths', 'Wreaths', card.wreathPrice], ['pathwayStakes', 'Pathway stakes', card.pathwayStakePrice], ['treeWraps', 'Tree wraps', card.treeWrapPrice], ['timers', 'Timers', card.timerPrice]] as const).map(([key, label, price]) => (
            <div key={key} className="stepper">
              <span>{label} <span className="muted small">{money(price)} ea</span></span>
              <span>
                <button onClick={() => setAddOn(key, -1)}>−</button> {opts.addOns[key]} <button onClick={() => setAddOn(key, 1)}>+</button>
              </span>
            </div>
          ))}
          {estimate && (
            <>
              <table className="estimate-table"><tbody>
                {estimate.lines.map((l, i) => <tr key={i}><td>{l.label}<br /><span className="muted small">{l.detail}</span></td><td className="num">{money(l.amount)}</td></tr>)}
              </tbody></table>
              <p className="small muted">{estimate.totalFeet} ft • {estimate.bulbCount} bulbs • {estimate.clipCount} clips</p>
              <p className="total-row"><span>Total</span><span>{money(estimate.total)}</span></p>
              <p className="total-row deposit"><span>Deposit due (50%)</span><span>{money(estimate.depositDue)}</span></p>
            </>
          )}
        </aside>
      </div>

      {showQuote && estimate && (
        <section className="quote">
          <h2>✨ GlowLab — Holiday Lighting Estimate</h2>
          <p><strong>{project.clientName}</strong>{project.address ? ` — ${project.address}` : ''}<br />
            Design: <strong>{preset.name}</strong> — {INSTALL_TYPE_LABELS[opts.installType]} ({opts.installType === 'permanent' ? 'permanent LED' : preset.bulbSize}, {profile.bulbSpacingInches}&quot; spacing)</p>
          <HouseStage project={project} preset={preset} spacingInches={profile.bulbSpacingInches} installType={opts.installType} night={night} />
          <table className="estimate-table"><tbody>
            {estimate.lines.map((l, i) => <tr key={i}><td>{l.label}<br /><span className="muted small">{l.detail}</span></td><td className="num">{money(l.amount)}</td></tr>)}
          </tbody></table>
          <p>{estimate.totalFeet} ft of lighting • {estimate.bulbCount} bulbs • {estimate.clipCount} clips</p>
          <p className="total-row"><span>Total</span><span>{money(estimate.total)}</span></p>
          <p className="total-row deposit"><span>Deposit due to book (50%)</span><span>{money(estimate.depositDue)}</span></p>
          <p className="muted small">{opts.installType === 'permanent'
            ? 'Permanent lighting is installed once and stays up year-round.'
            : 'Seasonal lighting includes installation and takedown after the holidays.'} Estimate based on the traced design above; final footage confirmed on install day.</p>
          <button className="primary no-print" onClick={() => window.print()}>Print quote</button>
        </section>
      )}
      <form hidden onSubmit={(e: FormEvent) => e.preventDefault()} />
    </div>
  );
}
