import { useEffect, useRef, useState } from 'react';
import { prepararArchivo } from '../lib/imagen.js';

/** Selfie de validación: cámara en vivo con guía ovalada, o subir una foto. */
export default function Selfie({ value, onChange }) {
  const video = useRef(null);
  const stream = useRef(null);
  const [modo, setModo] = useState('idle'); // idle | camara | foto
  const [msg, setMsg] = useState('');
  const [preview, setPreview] = useState('');

  const parar = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => parar, []);
  useEffect(() => {
    if (!value) {
      setPreview('');
      return undefined;
    }
    const u = URL.createObjectURL(value);
    setPreview(u);
    setModo('foto');
    return () => URL.revokeObjectURL(u);
  }, [value]);

  const abrir = async () => {
    setMsg('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setMsg('Tu navegador no permite usar la cámara acá. Usá «Subir una foto».');
      return;
    }
    try {
      parar();
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      setModo('camara');
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = stream.current;
          video.current.play().catch(() => {});
        }
      });
    } catch (e) {
      setMsg(e?.name === 'NotAllowedError' ? 'No diste permiso para usar la cámara. Habilitalo en el navegador o usá «Subir una foto».' : 'No pudimos abrir la cámara. Usá «Subir una foto».');
    }
  };

  const sacar = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    // Recorte 3:4 centrado, sin espejo (como la ve otra persona).
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    let w = vw;
    let h = (vw * 4) / 3;
    if (h > vh) {
      h = vh;
      w = (vh * 3) / 4;
    }
    const c = document.createElement('canvas');
    const k = Math.min(1, 1200 / h);
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    c.getContext('2d').drawImage(v, (vw - w) / 2, (vh - h) / 2, w, h, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
    parar();
    onChange(new File([blob], 'selfie.jpg', { type: 'image/jpeg' }));
  };

  const subir = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      parar();
      onChange(await prepararArchivo(f, 1200, 0.88));
    } catch {
      setMsg('No pudimos leer esa foto. Probá con otra (JPG o PNG).');
    }
  };

  const repetir = () => {
    onChange(null);
    setModo('idle');
    abrir();
  };

  return (
    <div className="pcf-selfie">
      <div className="pcf-selfie__view">
        {modo === 'camara' && <video ref={video} playsInline muted autoPlay />}
        {modo === 'foto' && preview && <img src={preview} alt="Tu selfie" />}
        {modo === 'idle' && (
          <div className="pcf-selfie__ph" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="54" height="54" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
          </div>
        )}
        {modo !== 'foto' && <div className="pcf-selfie__oval" aria-hidden="true" />}
      </div>
      <div className="pcf-selfie__side">
        <ul className="pcf-selfie__tips">
          <li>Mirá de frente y ubicá la cara dentro del óvalo.</li>
          <li>Buena luz, sin anteojos de sol, gorra ni barbijo.</li>
          <li>Fondo liso si podés.</li>
        </ul>
        <div className="pcf-selfie__btns">
          {modo === 'idle' && (
            <button type="button" className="pcf-btn pcf-btn--primary" onClick={abrir}>
              Abrir cámara
            </button>
          )}
          {modo === 'camara' && (
            <button type="button" className="pcf-btn pcf-btn--primary" onClick={sacar}>
              Sacar foto
            </button>
          )}
          {modo === 'foto' && (
            <button type="button" className="pcf-btn pcf-btn--ghost" onClick={repetir}>
              Volver a sacar
            </button>
          )}
          <label className="pcf-btn pcf-btn--ghost">
            Subir una foto
            <input type="file" accept="image/*" capture="user" hidden onChange={subir} />
          </label>
        </div>
        {modo === 'foto' && <p className="pcf-selfie__msg pcf-selfie__ok">✓ Foto lista</p>}
        {msg && (
          <p className="pcf-selfie__msg" role="alert">
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
