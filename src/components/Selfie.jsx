import { useEffect, useRef, useState } from 'react';
import { prepararArchivo } from '../lib/imagen.js';

/** Selfie de validación: cámara en vivo con guía ovalada, o subir una foto. */
export default function Selfie({ value, onChange }) {
  const video = useRef(null);
  const stream = useRef(null);
  const archivo = useRef(null);
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
    <div className={`pcf-selfie pcf-selfie--${modo}`}>
      <div className="pcf-selfie__view">
        {modo === 'camara' && <video ref={video} playsInline muted autoPlay />}
        {modo === 'foto' && preview && <img src={preview} alt="Tu selfie" />}
        {modo === 'idle' && (
          <div className="pcf-selfie__ph" aria-hidden="true">
            <div className="pcf-selfie__frame"><svg viewBox="0 0 80 88" width="80" height="88" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 23V12a5 5 0 0 1 5-5h11m28 0h11a5 5 0 0 1 5 5v11M10 65v11a5 5 0 0 0 5 5h11m28 0h11a5 5 0 0 0 5-5V65" /><ellipse cx="40" cy="35" rx="14" ry="17" /><path d="M19 69c2-19 40-19 42 0" /></svg></div>
            <span>Tu foto va acá</span>
          </div>
        )}
        {modo === 'camara' && <div className="pcf-selfie__oval" aria-hidden="true" />}
        {modo === 'camara' && <span className="pcf-selfie__live">Cámara activa</span>}
      </div>
      <div className="pcf-selfie__side">
        <span className="pcf-selfie__eyebrow">{modo === 'foto' ? 'Foto adjuntada' : 'Un último paso para conocerte'}</span>
        <h3 className="pcf-selfie__title">{modo === 'foto' ? 'Tu foto está lista' : 'Sumá tu foto de identidad'}</h3>
        <p className="pcf-selfie__description">{modo === 'foto' ? 'Revisá que tu rostro se vea completo y con claridad antes de enviar la solicitud.' : 'Podés sacarte una selfie ahora o elegir una foto que ya tengas.'}</p>
        <ul className="pcf-selfie__tips">
          <li>Rostro de frente y completo</li>
          <li>Buena luz y fondo simple</li>
          <li>Sin gorra ni anteojos de sol</li>
        </ul>
        <div className="pcf-selfie__btns">
          {modo === 'idle' && (
            <button type="button" className="pcf-btn pcf-btn--primary" onClick={abrir}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m8 5 2-2h4l2 2h4v15H4V5Z" /><circle cx="12" cy="12" r="4" /></svg>
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
          <button type="button" className="pcf-btn pcf-btn--ghost" onClick={() => archivo.current?.click()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" /></svg>
            Elegir una foto
          </button>
          <input ref={archivo} type="file" accept="image/jpeg,image/png" hidden onChange={subir} />
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
