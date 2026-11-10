import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { EstimateOptions, LineKind, Point, Preset, PricingSettings, Project, TracedLine } from '@glowlab/shared';
import { bulbPositions, calibrationPixelsPerFoot, computeEstimate, lineLengthsFeet, money, polylineLengthFeet, totalFeet } from '@glowlab/shared';
import { api, type ProjectInput } from '../api';

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

export function HouseStage({ project, preset, night, interactive, onTap }: {
  project: Project; preset: Preset; night: boolean; interactive?: boolean;
  onTap?: (p: Point) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const W = project.imageWidth || 1000;
  const H = project.imageHeight || 600;
  const ppf = calibrationPixelsPerFoot(project.calibration, { width: W, height: H });

  const handleClick = (e: React.MouseEvent) => {
    if (!interactive || !onTap || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    onTap({ x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
  };

  return (
    <div ref={ref} className="stage" style={{ aspectRatio: `${W} / ${H}` }} onClick={handleClick}>
      {project.photoDataUrl
        ? <img src={project.photoDataUrl} alt="House" className="stage-photo" style={{ filter: night ? 'brightness(.55) saturate(1.1)' : 'none' }} />
        : <div className="stage-photo" style={{ filter: night ? 'brightness(.55) saturate(1.1)' : 'none' }}><DemoHouse /></div>}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="stage-overlay">
        <defs>
          <filter id="bulbGlow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation={W * 0.008} result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {project.lines.map((line) => (
          <polyline key={`trace-${line.id}`} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth={W * 0.002} strokeDasharray="6 6"
            points={line.points.map((p) => `${p.x * W},${p.y * H}`).join(' ')} />
        ))}
        {project.calibration && (
          <line x1={project.calibration.a.x * W} y1={project.calibration.a.y * H} x2={project.calibration.b.x * W} y2={project.calibration.b.y * H}
            stroke="#ff4fd8" strokeWidth={W * 0.003} />
        )}
        {preset.icicle && ppf && project.lines.filter((l) => l.kind === 'gutter').map((line) => {
          const dropPx = ((preset.icicleDropInches ?? 18) / 12) * ppf;
          return bulbPositions(line, project.calibration, { width: W, height: H }, preset.spacingInches * 2).map((b, i) => (
            <g key={`ic-${line.id}-${i}`}>
              <line x1={b.point.x * W} y1={b.point.y * H} x2={b.point.x * W} y2={b.point.y * H + dropPx} stroke="#EAF4FF" strokeWidth={W * 0.0016} opacity={0.9} />
              <circle cx={b.point.x * W} cy={b.point.y * H + dropPx} r={W * 0.004} fill="#EAF4FF" filter="url(#bulbGlow)" />
            </g>
          ));
        })}
        {project.lines.filter((l) => preset.appliesTo.includes(l.kind)).map((line) =>
          bulbPositions(line, project.calibration, { width: W, height: H }, preset.spacingInches).map((b) => {
            const color = preset.bulbColors[b.index % preset.bulbColors.length];
            return (
              <g key={`${line.id}-${b.index}`}>
                <circle cx={b.point.x * W} cy={b.point.y * H} r={W * 0.013} fill={color} opacity={0.35} filter="url(#bulbGlow)" />
                <circle cx={b.point.x * W} cy={b.point.y * H} r={W * 0.0055} fill={color} stroke="#fff8" strokeWidth={W * 0.001} />
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}

export default function DesignerView({ initial, presets, settings, onBack }: {
  initial: Project; presets: Preset[]; settings: PricingSettings; onBack: () => void;
}) {
  const [project, setProject] = useState<Project>(initial);
  const [mode, setMode] = useState<'trace' | 'calibrate'>('trace');
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

  const setOptions = (patch: Partial<EstimateOptions>) => setProject({ ...project, estimateOptions: { ...project.estimateOptions, ...patch } });
  const setAddOn = (key: keyof EstimateOptions['addOns'], delta: number) =>
    setOptions({ addOns: { ...project.estimateOptions.addOns, [key]: Math.max(0, project.estimateOptions.addOns[key] + delta) } });

  const onTap = (p: Point) => {
    if (mode === 'calibrate') {
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
      img.onload = () => setProject({ ...project, photoDataUrl: String(reader.result), imageWidth: img.naturalWidth, imageHeight: img.naturalHeight, calibration: null, lines: [] });
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const useDemo = () => setProject({ ...project, photoDataUrl: null, imageWidth: 1000, imageHeight: 600, calibration: null, lines: [] });

  const save = async () => {
    try {
      const input: ProjectInput = {
        clientName: project.clientName, address: project.address, photoDataUrl: project.photoDataUrl,
        imageWidth: project.imageWidth, imageHeight: project.imageHeight, calibration: project.calibration,
        lines: project.lines, presetId: project.presetId, estimateOptions: project.estimateOptions,
      };
      const { project: savedProject } = await api.updateProject(project.id, input);
      setProject(savedProject); setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (err) { setError((err as Error).message); }
  };

  const previewProject: Project = { ...project, lines: current.length ? [...project.lines, { id: 'current', kind, points: current }] : project.lines };

  return (
    <div>
      <div className="toolbar no-print">
        <button onClick={onBack}>← Projects</button>
        <input className="inline-input" value={project.clientName} onChange={(e) => setProject({ ...project, clientName: e.target.value })} aria-label="Client name" />
        <input className="inline-input wide" value={project.address} onChange={(e) => setProject({ ...project, address: e.target.value })} placeholder="Address" aria-label="Address" />
        <button className="primary" onClick={save}>{saved ? 'Saved ✓' : 'Save project'}</button>
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

          <HouseStage project={previewProject} preset={preset} night={night} interactive onTap={onTap} />
          {current.length > 0 && (
            <p className="muted small">Current line: {current.length} point(s), {polylineLengthFeet(current, project.calibration, size).toFixed(1)} ft — click the photo to add points.</p>
          )}

          <div className="toolbar no-print" style={{ marginTop: 12 }}>
            <div className="chips">
              <button className={mode === 'trace' ? 'chip active' : 'chip'} onClick={() => setMode('trace')}>Trace</button>
              <button className={mode === 'calibrate' ? 'chip active' : 'chip'} onClick={() => setMode('calibrate')}>Calibrate</button>
            </div>
            {mode === 'trace' ? (
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
            <p className="muted small">{preset.description} Bulbs: {preset.bulbColors.map((c) => <span key={c} className="swatch" style={{ background: c }} />)} {preset.bulbSize}, every {preset.spacingInches}&quot;</p>
          </div>
        </div>

        <aside className="estimate-panel no-print">
          <h3>Estimate</h3>
          <div className="chips">
            <button className={project.estimateOptions.model === 'rental' ? 'chip active' : 'chip'} onClick={() => setOptions({ model: 'rental' })}>Rental</button>
            <button className={project.estimateOptions.model === 'purchase' ? 'chip active' : 'chip'} onClick={() => setOptions({ model: 'purchase' })}>Purchase</button>
          </div>
          <div className="chips">
            <button className={project.estimateOptions.stories === 1 ? 'chip active' : 'chip'} onClick={() => setOptions({ stories: 1 })}>1 story</button>
            <button className={project.estimateOptions.stories === 2 ? 'chip active' : 'chip'} onClick={() => setOptions({ stories: 2 })}>2 stories</button>
          </div>
          <label className="toggle"><input type="checkbox" checked={project.estimateOptions.steepRoof} onChange={(e) => setOptions({ steepRoof: e.target.checked })} /> Steep / difficult roof (+{money(settings.steepRoofFee)})</label>
          {([['wreaths', 'Wreaths', settings.wreathPrice], ['pathwayStakes', 'Pathway stakes', settings.pathwayStakePrice], ['treeWraps', 'Tree wraps', settings.treeWrapPrice], ['timers', 'Timers', settings.timerPrice]] as const).map(([key, label, price]) => (
            <div key={key} className="stepper">
              <span>{label} <span className="muted small">{money(price)} ea</span></span>
              <span>
                <button onClick={() => setAddOn(key, -1)}>−</button> {project.estimateOptions.addOns[key]} <button onClick={() => setAddOn(key, 1)}>+</button>
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
            Design: <strong>{preset.name}</strong> ({preset.bulbSize}, {preset.spacingInches}&quot; spacing)</p>
          <HouseStage project={project} preset={preset} night={night} />
          <table className="estimate-table"><tbody>
            {estimate.lines.map((l, i) => <tr key={i}><td>{l.label}<br /><span className="muted small">{l.detail}</span></td><td className="num">{money(l.amount)}</td></tr>)}
          </tbody></table>
          <p>{estimate.totalFeet} ft of lighting • {estimate.bulbCount} bulbs • {estimate.clipCount} clips</p>
          <p className="total-row"><span>Total</span><span>{money(estimate.total)}</span></p>
          <p className="total-row deposit"><span>Deposit due to book (50%)</span><span>{money(estimate.depositDue)}</span></p>
          <p className="muted small">Rental includes installation and January takedown. Estimate based on the traced design above; final footage confirmed on install day.</p>
          <button className="primary no-print" onClick={() => window.print()}>Print quote</button>
        </section>
      )}
      <form hidden onSubmit={(e: FormEvent) => e.preventDefault()} />
    </div>
  );
}
