import type { SignedContract } from '@glowlab/shared';
import { INSTALL_TYPE_LABELS, contractAmounts, defaultDeposit, money } from '@glowlab/shared';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** A file name like "Contract - The Johnsons - 2026-11-14.pdf". */
export function contractFileName(c: SignedContract): string {
  const who = (c.clientName || c.customerName || 'Customer').replace(/[\\/:*?"<>|]+/g, '').trim();
  return `Contract - ${who} - ${c.signedAt.slice(0, 10)}.pdf`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

/**
 * Turns the on-screen house picture (photo + night look + lights) into a JPEG for the PDF.
 * Returns null if it can't (the PDF is still made, just without the picture).
 */
export async function snapshotStage(stage: HTMLElement | null): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    if (!stage) return null;
    const svg = stage.querySelector('svg.stage-overlay') as SVGSVGElement | null;
    if (!svg) return null;
    const [, , vw, vh] = (svg.getAttribute('viewBox') ?? '0 0 1000 600').split(/\s+/).map(Number);
    const scale = Math.min(1, 1400 / vw);
    const w = Math.round(vw * scale); const h = Math.round(vh * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const photo = stage.querySelector('img.stage-photo') as HTMLImageElement | null;
    const night = Boolean(stage.querySelector('.night-tint'));
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    ctx.filter = night ? 'brightness(.42) contrast(1.08) saturate(.8)' : 'none';
    if (photo?.src) {
      ctx.drawImage(await loadImage(photo.src), 0, 0, w, h);
    } else {
      const demo = stage.querySelector('div.stage-photo svg');
      if (demo) {
        const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(demo)], { type: 'image/svg+xml' }));
        try { ctx.drawImage(await loadImage(url), 0, 0, w, h); } finally { URL.revokeObjectURL(url); }
      }
    }
    ctx.filter = 'none';
    if (night) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(18, 30, 78, .55)'); g.addColorStop(0.6, 'rgba(10, 16, 44, .4)'); g.addColorStop(1, 'rgba(4, 6, 18, .55)');
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h));
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    try { ctx.drawImage(await loadImage(url), 0, 0, w, h); } finally { URL.revokeObjectURL(url); }
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), w, h };
  } catch {
    return null;
  }
}

async function logoDataUrl(): Promise<string | null> {
  try {
    const img = await loadImage('/icon-192.png');
    const c = document.createElement('canvas'); c.width = 96; c.height = 96;
    c.getContext('2d')?.drawImage(img, 0, 0, 96, 96);
    return c.toDataURL('image/png');
  } catch { return null; }
}

/** Builds the signed contract as a PDF (US Letter). */
export async function buildContractPdf(c: SignedContract, signatureDataUrl: string | null, picture: { dataUrl: string; w: number; h: number } | null): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight();
  const M = 50; const CW = W - M * 2;
  let y = M;
  const ink = () => doc.setTextColor(28, 36, 32);
  const muted = () => doc.setTextColor(107, 118, 112);
  const room = (need: number) => { if (y + need > H - M) { doc.addPage(); y = M; } };
  const text = (s: string, opts: { size?: number; bold?: boolean; color?: 'ink' | 'muted'; gap?: number; x?: number; width?: number } = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size ?? 10.5);
    if (opts.color === 'muted') muted(); else ink();
    const lines = doc.splitTextToSize(s, opts.width ?? CW) as string[];
    const lh = (opts.size ?? 10.5) * 1.35;
    for (const line of lines) { room(lh); doc.text(line, opts.x ?? M, y + (opts.size ?? 10.5)); y += lh; }
    y += opts.gap ?? 0;
  };
  const rule = (gapAbove = 6, gapBelow = 10) => { y += gapAbove; room(2); doc.setDrawColor(221, 228, 222); doc.line(M, y, W - M, y); y += gapBelow; };
  const row = (label: string, amount: string, opts: { bold?: boolean; size?: number; detail?: string; gold?: boolean } = {}) => {
    const size = opts.size ?? 10.5;
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal'); doc.setFontSize(size);
    const labelLines = doc.splitTextToSize(label, CW - 110) as string[];
    const detailLines = opts.detail ? (doc.splitTextToSize(opts.detail, CW - 110) as string[]) : [];
    room(labelLines.length * size * 1.35 + detailLines.length * 12 + 6);
    if (opts.gold) doc.setTextColor(176, 120, 20); else ink();
    doc.text(amount, W - M, y + size, { align: 'right' });
    for (const l of labelLines) { doc.text(l, M, y + size); y += size * 1.35; }
    if (detailLines.length) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); muted(); for (const l of detailLines) { doc.text(l, M, y + 9); y += 12; } }
    y += 4;
  };

  // Header
  const logo = await logoDataUrl();
  if (logo) doc.addImage(logo, 'PNG', M, y, 34, 34);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); ink();
  doc.text(c.businessName || 'GlowLab', M + (logo ? 44 : 0), y + 23);
  y += 46;
  text('Holiday Lighting Installation Agreement', { size: 14, bold: true, gap: 6 });
  text(`Date: ${fmtDate(c.signedAt)}`);
  text(`Customer: ${c.clientName}${c.address ? ` — ${c.address}` : ''}`);
  text(`Design: ${c.presetName} — ${INSTALL_TYPE_LABELS[c.installType]} lighting (${c.installType === 'permanent' ? 'permanent LED' : 'C9'}, ${c.bulbSpacingInches}" spacing)`, { gap: 10 });

  if (picture) {
    const pw = CW; const ph = Math.min(300, (pw * picture.h) / picture.w);
    const ww = (ph * picture.w) / picture.h;
    room(ph + 10);
    doc.addImage(picture.dataUrl, 'JPEG', M + (CW - ww) / 2, y, ww, ph);
    y += ph + 14;
  }

  // Price
  rule(0, 8);
  const amt = contractAmounts(c);
  for (const l of c.estimate.lines) row(l.label, money(l.amount), { detail: l.detail });
  text(`${c.estimate.totalFeet} ft of lighting • ${c.estimate.bulbCount} bulbs`, { size: 9.5, color: 'muted', gap: 4 });
  rule(2, 8);
  row('Contract price', money(amt.price), { bold: true, size: 13 });
  if (amt.takedown > 0) {
    row('Takedown / reinstall fee (added to the contract price)', `+ ${money(amt.takedown)}`);
    row('Total', money(amt.total), { bold: true, size: 13 });
  }
  row(`Deposit due at signing${Math.abs(amt.deposit - defaultDeposit(amt.price)) < 0.005 ? ' (50% of the contract price)' : ''}`, money(amt.deposit), { bold: true, gold: true });
  row('Balance due on completion', money(amt.balance));

  // Terms
  rule(8, 8);
  text('Terms', { size: 13, bold: true, gap: 4 });
  for (const para of c.terms.split(/\n\s*\n/)) text(para.trim(), { size: 9.5, gap: 6 });

  // Signatures
  rule(6, 8);
  text('Signatures', { size: 13, bold: true, gap: 6 });
  room(120);
  if (signatureDataUrl) {
    try {
      const sig = await loadImage(signatureDataUrl);
      const sw = Math.min(260, CW); const sh = Math.min(90, (sw * sig.naturalHeight) / Math.max(1, sig.naturalWidth));
      doc.addImage(signatureDataUrl, 'PNG', M, y, (sh * sig.naturalWidth) / Math.max(1, sig.naturalHeight), sh);
      y += sh + 2;
    } catch { /* signature image unreadable: the signed-by line below still records it */ }
  }
  doc.setDrawColor(28, 36, 32); doc.line(M, y, M + 260, y); y += 4;
  text('CUSTOMER SIGNATURE', { size: 8, color: 'muted', gap: 8 });
  text(`Signed electronically by ${c.customerName} on ${fmtDate(c.signedAt)} at ${fmtTime(c.signedAt)}.`, { size: 10 });
  if (c.customerPhone) text(`Phone: ${c.customerPhone}`, { size: 10 });
  if (c.customerEmail) text(`Email: ${c.customerEmail}`, { size: 10 });
  y += 4;
  text(`Accepted for ${c.businessName}.`, { size: 10, gap: 8 });
  text(`Signature record: ${c.signedAt}${c.signerIp ? ` • IP ${c.signerIp}` : ''}`, { size: 8, color: 'muted' });

  // Page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); muted();
    doc.text(`${c.businessName} — ${c.clientName} — page ${i} of ${pages}`, W / 2, H - 24, { align: 'center' });
  }
  return doc.output('blob');
}

/** Saves a file through the browser's normal download. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
