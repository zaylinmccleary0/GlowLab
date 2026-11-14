import { useEffect, useRef, useState } from 'react';

/**
 * Draw-to-sign box. Works with a finger, stylus or mouse. Reports the signature as a
 * PNG data URL after each stroke, or null when it's empty/cleared.
 */
export default function SignaturePad({ onChange, disabled }: { onChange: (dataUrl: string | null) => void; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  // Size the drawing surface to the box (sharp on high-DPI screens). Resizing clears it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth; const h = canvas.clientHeight;
      if (canvas.width === Math.round(w * dpr) && canvas.height === Math.round(h * dpr)) return;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827'; ctx.lineWidth = 2.4; }
      setHasInk(false); onChange(null);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    last.current = p;
    const ctx = e.currentTarget.getContext('2d');
    if (ctx) { ctx.beginPath(); ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2); ctx.fillStyle = '#111827'; ctx.fill(); }
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = point(e);
    const mid = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false; last.current = null;
    setHasInk(true);
    onChange(canvasRef.current?.toDataURL('image/png') ?? null);
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore(); }
    setHasInk(false); onChange(null);
  };

  return (
    <div className="sigpad">
      <canvas ref={canvasRef} className="sigpad-canvas" aria-label="Signature box: sign with your finger or mouse"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
      {!hasInk && <span className="sigpad-hint" aria-hidden="true">Sign here</span>}
      <div className="sigpad-foot">
        <span className="sign-label">Customer signature</span>
        <button type="button" className="link" onClick={clear} disabled={!hasInk || disabled}>Clear</button>
      </div>
    </div>
  );
}
