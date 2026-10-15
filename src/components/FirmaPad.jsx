import { useEffect, useRef, useState } from 'react';

/** Recuadro para firmar con dedo, lápiz o mouse. Devuelve un PNG recortado (data URL) o ''. */
export default function FirmaPad({ onChange, aclaracion, error }) {
  const wrap = useRef(null);
  const cv = useRef(null);
  const st = useRef({ drawing: false, last: null, largo: 0, box: null, strokes: [] });
  const [tinta, setTinta] = useState(false);

  const ajustar = () => {
    const c = cv.current;
    const r = wrap.current.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b2350';
    // Redibuja los trazos (al rotar el celular).
    for (const s of st.current.strokes) {
      ctx.beginPath();
      s.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }
  };

  useEffect(() => {
    ajustar();
    const ro = new ResizeObserver(() => ajustar());
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const pos = (e) => {
    const r = cv.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const exportar = () => {
    const s = st.current;
    if (s.largo < 60 || !s.box) return '';
    const dpr = cv.current.width / cv.current.getBoundingClientRect().width;
    const pad = 10;
    const x = Math.max(0, (s.box.x1 - pad) * dpr);
    const y = Math.max(0, (s.box.y1 - pad) * dpr);
    const w = Math.min(cv.current.width - x, (s.box.x2 - s.box.x1 + pad * 2) * dpr);
    const h = Math.min(cv.current.height - y, (s.box.y2 - s.box.y1 + pad * 2) * dpr);
    const out = document.createElement('canvas');
    const k = Math.min(1, 1200 / w);
    out.width = Math.max(1, Math.round(w * k));
    out.height = Math.max(1, Math.round(h * k));
    out.getContext('2d').drawImage(cv.current, x, y, w, h, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  };

  const down = (e) => {
    e.preventDefault();
    cv.current.setPointerCapture?.(e.pointerId);
    const p = pos(e);
    const s = st.current;
    s.drawing = true;
    s.last = p;
    s.strokes.push([p]);
    s.box = s.box ? { x1: Math.min(s.box.x1, p.x), y1: Math.min(s.box.y1, p.y), x2: Math.max(s.box.x2, p.x), y2: Math.max(s.box.y2, p.y) } : { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
  };
  const move = (e) => {
    const s = st.current;
    if (!s.drawing) return;
    e.preventDefault();
    const p = pos(e);
    const ctx = cv.current.getContext('2d');
    const d = Math.hypot(p.x - s.last.x, p.y - s.last.y);
    ctx.lineWidth = Math.max(1.6, Math.min(3, 3.2 - d / 12));
    ctx.beginPath();
    ctx.moveTo(s.last.x, s.last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    s.largo += d;
    s.last = p;
    s.strokes[s.strokes.length - 1].push(p);
    s.box = { x1: Math.min(s.box.x1, p.x), y1: Math.min(s.box.y1, p.y), x2: Math.max(s.box.x2, p.x), y2: Math.max(s.box.y2, p.y) };
    if (!tinta) setTinta(true);
  };
  const up = () => {
    const s = st.current;
    if (!s.drawing) return;
    s.drawing = false;
    onChange(exportar());
  };
  const borrar = () => {
    st.current = { drawing: false, last: null, largo: 0, box: null, strokes: [] };
    const c = cv.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setTinta(false);
    onChange('');
  };

  return (
    <div ref={wrap} className={`pcf-firma${tinta ? ' has-ink is-on' : ''}`} aria-invalid={!!error}>
      <canvas
        ref={cv}
        role="img"
        aria-label="Recuadro para firmar"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
      />
      <span className="pcf-firma__ph" aria-hidden="true">Firmá acá</span>
      <span className="pcf-firma__x" aria-hidden="true">✕</span>
      <span className="pcf-firma__line" aria-hidden="true" />
      <span className="pcf-firma__acl">{aclaracion || 'Aclaración'}</span>
      {tinta && (
        <button type="button" className="pcf-firma__clear" onClick={borrar}>
          Borrar firma
        </button>
      )}
    </div>
  );
}
