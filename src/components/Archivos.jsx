import { useEffect, useState } from 'react';
import { prepararArchivo, esImagen, esPdf, tamano } from '../lib/imagen.js';
import { LIMITES } from '../../lib/schema.js';

function Miniatura({ file }) {
  const [u, setU] = useState('');
  useEffect(() => {
    if (!file.type.startsWith('image/')) return undefined;
    const x = URL.createObjectURL(file);
    setU(x);
    return () => URL.revokeObjectURL(x);
  }, [file]);
  return u ? <img className="pcf-file__th" src={u} alt="" /> : <span className="pcf-file__th">PDF</span>;
}

/** Selector de archivos con miniaturas. Convierte fotos a JPEG liviano. */
export default function Archivos({ id, value = [], onChange, multiple, onError }) {
  const [over, setOver] = useState(false);
  const [proc, setProc] = useState(false);

  const agregar = async (lista) => {
    const nuevos = [];
    setProc(true);
    for (const f of Array.from(lista || [])) {
      if (!esImagen(f) && !esPdf(f)) {
        onError(`«${f.name}» no es una foto ni un PDF.`);
        continue;
      }
      try {
        const p = await prepararArchivo(f);
        if (p.size > LIMITES.maxBytes) {
          onError(`«${f.name}» pesa más de 8 MB.`);
          continue;
        }
        nuevos.push(p);
      } catch {
        onError(`No pudimos leer «${f.name}». Si es una foto de iPhone (HEIC), sacale captura o exportala como JPG.`);
      }
    }
    setProc(false);
    if (!nuevos.length) return;
    let todo = multiple ? [...value, ...nuevos] : nuevos.slice(0, 1);
    if (todo.length > LIMITES.maxPorCampo) {
      onError(`Podés adjuntar hasta ${LIMITES.maxPorCampo} archivos en este campo.`);
      todo = todo.slice(0, LIMITES.maxPorCampo);
    } else onError('');
    onChange(todo);
  };

  const pick = (e) => {
    agregar(e.target.files);
    e.target.value = '';
  };

  return (
    <div>
      <label
        className={`pcf-drop${over ? ' is-over' : ''}`}
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          agregar(e.dataTransfer.files);
        }}
      >
        <input type="file" id={id} accept=".pdf,application/pdf,image/*" multiple={multiple} onChange={pick} />
        <span className="pcf-drop__ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M20 16v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3" /></svg>
        </span>
        <span className="pcf-drop__txt">
          {proc ? (
            'Procesando…'
          ) : (
            <>
              <strong>{value.length ? 'Agregar más archivos' : multiple ? 'Elegí fotos o PDF' : 'Elegí una foto o PDF'}</strong> o arrastralos acá
            </>
          )}
        </span>
      </label>
      <label className="pcf-btn pcf-btn--ghost pcf-drop__cam" style={{ marginTop: 8 }}>
        📷 Sacar foto con la cámara
        <input type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      </label>
      <div className="pcf-files">
        {value.map((f, i) => (
          <div className="pcf-file" key={i + f.name}>
            <Miniatura file={f} />
            <span className="pcf-file__n">{f.name}</span>
            <span className="pcf-file__s">{tamano(f.size)}</span>
            <button type="button" className="pcf-file__x" aria-label={`Quitar ${f.name}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
