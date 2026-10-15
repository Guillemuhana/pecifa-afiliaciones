import { PARENTESCOS } from '../../lib/schema.js';
import { hoyAR } from '../../lib/validacion.js';

const vacio = () => ({ nombre: '', parentesco: '', dni: '', nacimiento: '' });

export default function Familiares({ value, onChange, max }) {
  const rows = value?.length ? value : [vacio()];
  const set = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div>
      <div className="pcf-fam pcf-fam--head" aria-hidden="true">
        <span>#</span>
        <span>Apellido y nombre</span>
        <span>Parentesco</span>
        <span>DNI</span>
        <span>Fecha de nac.</span>
        <span />
      </div>
      {rows.map((r, i) => (
        <div className="pcf-fam" key={i}>
          <span className="pcf-fam__n">{i + 1}</span>
          <input className="pcf-input" placeholder="Apellido y nombre" aria-label={`Familiar ${i + 1}: apellido y nombre`} maxLength={100} value={r.nombre} onChange={(e) => set(i, 'nombre', e.target.value)} />
          <select className="pcf-input" aria-label={`Familiar ${i + 1}: parentesco`} value={r.parentesco} onChange={(e) => set(i, 'parentesco', e.target.value)}>
            <option value="">Parentesco…</option>
            {PARENTESCOS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <input className="pcf-input" inputMode="numeric" placeholder="DNI" aria-label={`Familiar ${i + 1}: DNI`} maxLength={9} value={r.dni} onChange={(e) => set(i, 'dni', e.target.value.replace(/\D/g, ''))} />
          <input className="pcf-input" type="date" aria-label={`Familiar ${i + 1}: fecha de nacimiento`} min="1910-01-01" max={hoyAR()} value={r.nacimiento} onChange={(e) => set(i, 'nacimiento', e.target.value)} />
          <button type="button" className="pcf-fam__del" aria-label={`Quitar familiar ${i + 1}`} onClick={() => onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [vacio()])}>
            ×
          </button>
        </div>
      ))}
      {rows.length < max && (
        <button type="button" className="pcf-btn pcf-btn--ghost" onClick={() => onChange([...rows, vacio()])}>
          + Agregar familiar
        </button>
      )}
    </div>
  );
}
