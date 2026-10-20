import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpRight, Building2, CheckCheck, ChevronLeft, ChevronRight, CircleAlert, Clock3, Download, FileSpreadsheet, Filter, Inbox, ListFilter, LoaderCircle, Printer, RefreshCw, Search, Share2, SlidersHorizontal, Users, X } from 'lucide-react';
import { supabase } from '../supabase.js';
import { ESTADOS, fechaHora } from '../../lib/schema.js';
import { EMPTY_FILTERS, field, filterRows, overdue, statistics } from './management.js';
import { exportRecords } from './exports.js';

const SUMMARY_COLUMNS = 'id,nro_tramite,estado,apellido,nombres,dni,cuil,email,telefono,fuerza,localidad,created_at,updated_at,nro_afiliado,archivos,seccional:datos->>seccional,afiliado_por:datos->>afiliado_por,categoria:datos->>categoria,organismo:datos->>organismo,situacion:datos->>situacion';
const DETAIL_COLUMNS = 'id,nro_tramite,estado,apellido,nombres,dni,cuil,email,telefono,fuerza,localidad,created_at,nro_afiliado,datos,archivos,notas';
const number = value => value.toLocaleString('es-AR');
const stateColors = { pendiente: '#d4a23c', en_revision: '#5186c8', observada: '#d77c58', aprobada: '#32846d', rechazada: '#a3afbf' };
const optionalColumns = { contacto: 'Contacto', fuerza: 'Fuerza / organismo', seccional: 'Seccional / referente', localidad: 'Localidad', documentos: 'Documentación' };
const filterNames = { q: 'Búsqueda', estado: 'Estado', seccional: 'Seccional', fuerza: 'Fuerza', categoria: 'Personal', desde: 'Desde', hasta: 'Hasta', prioridad: 'Atención' };

export default function Dashboard() {
  const [params, setParams] = useSearchParams();
  const view = ['base', 'informes'].includes(params.get('vista')) ? params.get('vista') : 'resumen';
  const filters = useMemo(() => Object.fromEntries(Object.keys(EMPTY_FILTERS).map(key => [key, params.get(key) || ''])), [params]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState(null);
  const [updated, setUpdated] = useState(null);
  const [reload, setReload] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [exporting, setExporting] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState({ key: 'created_at', ascending: false });
  const [columns, setColumns] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem('pecifa-columns')); return Array.isArray(saved) ? saved.filter(key => key in optionalColumns) : Object.keys(optionalColumns); }
    catch { return Object.keys(optionalColumns); }
  });

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setLoadError(''); setLoadedCount(0); setRows([]); setSelected(new Set());
      try {
        const collected = [];
        const snapshot = new Date().toISOString();
        // Paginate until the exact count is reached, including projects configured with a lower API row limit.
        let expected = Infinity;
        while (collected.length < expected) {
          const { data, error, count } = await supabase.from('afiliaciones').select(SUMMARY_COLUMNS, { count: 'exact' })
            .lte('created_at', snapshot).order('created_at', { ascending: false }).order('id', { ascending: false })
            .range(collected.length, collected.length + 499).abortSignal(controller.signal);
          if (error) throw error;
          if (count === null) throw new Error('No se pudo verificar el total de solicitudes. Actualizá para reintentar.');
          expected = count;
          if (!data?.length) {
            if (collected.length < expected) throw new Error('La carga quedó incompleta. Actualizá para volver a intentarlo.');
            break;
          }
          collected.push(...data);
          if (controller.signal.aborted) return;
          setLoadedCount(collected.length);
        }
        if (!controller.signal.aborted) { setRows(collected); setUpdated(new Date()); }
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error.message || 'No se pudieron cargar las afiliaciones.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [reload]);

  useEffect(() => { setPage(1); setSelected(new Set()); }, [params, pageSize]);
  const invalidDates = Boolean(filters.desde && filters.hasta && filters.desde > filters.hasta);
  const filtered = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const stats = useMemo(() => statistics(filtered), [filtered]);
  const allStats = useMemo(() => statistics(rows), [rows]);
  const options = useMemo(() => ({
    sections: [...new Set(rows.map(row => field(row, 'seccional') || 'Sin seccional'))].sort((a, b) => a.localeCompare(b, 'es')),
    forces: [...new Set(rows.map(row => row.fuerza || 'Sin fuerza'))].sort((a, b) => a.localeCompare(b, 'es')),
  }), [rows]);
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const result = String(field(a, sort.key)).localeCompare(String(field(b, sort.key)), 'es', { numeric: true });
    return (sort.ascending ? result : -result) || a.id.localeCompare(b.id);
  }), [filtered, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const activePage = Math.min(page, pages);
  const pageRows = sorted.slice((activePage - 1) * pageSize, activePage * pageSize);
  const activeFilters = Object.entries(filters).filter(([, value]) => value);
  const ready = !loading && !loadError && !invalidDates;

  function changeFilter(key, value) {
    setParams(current => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  }
  function clearFilters() { setParams(view === 'resumen' ? {} : { vista: view }, { replace: true }); }
  function toggleColumn(key) {
    const next = columns.includes(key) ? columns.filter(item => item !== key) : [...columns, key];
    setColumns(next);
    try { localStorage.setItem('pecifa-columns', JSON.stringify(next)); } catch { /* Layout still works without persistence. */ }
  }
  async function shareView() {
    try {
      await navigator.clipboard.writeText(location.href);
      setNotice({ type: 'ok', text: 'Enlace de la vista copiado. Quien lo abra necesita una cuenta autorizada.' });
    } catch { setNotice({ type: 'warn', text: 'No pudimos copiar el enlace. Podés copiar la dirección del navegador para compartir esta vista.' }); }
  }
  async function download(format) {
    setExporting(format); setNotice(null);
    try {
      const source = selected.size ? sorted.filter(row => selected.has(row.id)) : sorted;
      const records = [];
      // Download precisely the visible filter/selection, without a silent 1,000 or 10,000-row cap.
      for (let offset = 0; offset < source.length; offset += 100) {
        const ids = source.slice(offset, offset + 100).map(row => row.id);
        let batch = [];
        while (batch.length < ids.length) {
          const { data, error } = await supabase.from('afiliaciones').select(DETAIL_COLUMNS).in('id', ids)
            .order('id').range(batch.length, ids.length - 1);
          if (error) throw error;
          if (!data?.length) throw new Error('No se pudieron recuperar todos los registros. Actualizá la base e intentá de nuevo.');
          batch.push(...data);
        }
        records.push(...batch);
      }
      const index = new Map(records.map(row => [row.id, row]));
      await exportRecords(source.map(row => index.get(row.id)), format, filters);
      setNotice({ type: 'ok', text: `${number(source.length)} solicitudes exportadas ${selected.size ? 'de la selección' : 'con los filtros actuales'}.` });
    } catch (error) { setNotice({ type: 'err', text: `No se pudo exportar: ${error.message}` }); }
    finally { setExporting(''); }
  }
  function toggleRow(id) { setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function togglePage() {
    const all = pageRows.every(row => selected.has(row.id));
    setSelected(current => { const next = new Set(current); pageRows.forEach(row => all ? next.delete(row.id) : next.add(row.id)); return next; });
  }
  const sortHeader = (key, label) => <th aria-sort={sort.key === key ? sort.ascending ? 'ascending' : 'descending' : 'none'}><button className="np-sort" onClick={() => setSort(current => ({ key, ascending: current.key === key ? !current.ascending : true }))}>{label}{sort.key === key ? sort.ascending ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : null}</button></th>;

  return (
    <div className="np-dashboard">
      <header className="np-page-heading">
        <div><span className="np-eyebrow">PECIFA NACIONAL / GESTIÓN DE AFILIACIONES</span><h1>{view === 'base' ? 'Base de afiliaciones' : view === 'informes' ? 'Informes y seccionales' : 'Resumen nacional'}</h1><p>{view === 'base' ? 'Cada solicitud, su documentación y su seguimiento, en una sola base.' : view === 'informes' ? 'Información para coordinar el trabajo de las seccionales y referentes.' : 'Una mirada clara sobre las solicitudes y el trabajo pendiente.'}</p></div>
        <div className="np-actions"><button className="adm-btn" onClick={shareView}><Share2 size={16} /> Compartir vista</button><button className="adm-btn" onClick={() => setReload(value => value + 1)} disabled={loading || Boolean(exporting)}><RefreshCw size={16} className={loading ? 'np-spin' : ''} /> Actualizar</button></div>
      </header>

      <section className="np-filter-panel" aria-label="Filtros de afiliaciones">
        <div className="np-filter-top"><div className="np-search"><Search size={19} aria-hidden="true" /><input aria-label="Buscar afiliaciones" type="search" placeholder="Buscar nombre, DNI, CUIL, trámite, referente…" value={filters.q} onChange={event => changeFilter('q', event.target.value)} /></div><span className="np-filter-indicator"><Filter size={15} /> {activeFilters.length ? `${activeFilters.length} filtros activos` : 'Todas las solicitudes'}</span></div>
        <div className="np-filter-grid">
          <label>Estado<select value={filters.estado} onChange={event => changeFilter('estado', event.target.value)}><option value="">Todos los estados</option>{Object.entries(ESTADOS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Seccional<select value={filters.seccional} onChange={event => changeFilter('seccional', event.target.value)}><option value="">Todas las seccionales</option>{options.sections.map(section => <option key={section}>{section}</option>)}</select></label>
          <label>Fuerza<select value={filters.fuerza} onChange={event => changeFilter('fuerza', event.target.value)}><option value="">Todas las fuerzas</option>{options.forces.map(force => <option key={force}>{force}</option>)}</select></label>
          <label>Personal<select value={filters.categoria} onChange={event => changeFilter('categoria', event.target.value)}><option value="">Todas las categorías</option><option value="personal_civil">Personal civil</option><option value="docente_civil">Docente civil</option></select></label>
          <label>Desde<input type="date" value={filters.desde} onChange={event => changeFilter('desde', event.target.value)} /></label>
          <label>Hasta<input type="date" value={filters.hasta} onChange={event => changeFilter('hasta', event.target.value)} /></label>
        </div>
        {activeFilters.length > 0 && <div className="np-chips">{activeFilters.map(([key, value]) => <button key={key} onClick={() => changeFilter(key, '')}>{filterNames[key]}: {key === 'estado' ? ESTADOS[value] || value : value}<X size={12} aria-label="Quitar filtro" /></button>)}<button className="np-clear" onClick={clearFilters}>Limpiar filtros</button></div>}
        {invalidDates && <p className="np-date-error" role="alert">La fecha «Desde» debe ser anterior o igual a «Hasta».</p>}
      </section>

      {notice && <div className={`adm-msg ${notice.type} np-notice`} role="status">{notice.text}<button aria-label="Cerrar aviso" onClick={() => setNotice(null)}><X size={17} /></button></div>}
      {loadError && <div className="adm-msg err" role="alert">No se pudo cargar la base: {loadError} <button className="adm-btn" onClick={() => setReload(value => value + 1)}>Reintentar</button></div>}
      {loading ? <div className="np-loading" role="status"><LoaderCircle className="np-spin" size={28} /><strong>Preparando la base nacional</strong><span>{loadedCount ? `${number(loadedCount)} solicitudes recuperadas…` : 'Consultando las afiliaciones…'}</span></div> : !loadError && <>
        <div className="np-scope"><span><span className="np-live-dot" /> {number(filtered.length)} de {number(rows.length)} solicitudes · {activeFilters.length ? 'Estadísticas de la vista filtrada' : 'Alcance nacional'}</span><span>Actualizado {updated && fechaHora(updated)}</span></div>
        <section className="np-kpis" aria-label="Indicadores de la vista">
          {[
            { title: 'Solicitudes recibidas', value: stats.total, detail: `${number(stats.thisMonth)} ingresadas este mes`, icon: Users, color: 'blue', state: '' },
            { title: 'Afiliaciones aprobadas', value: stats.states.aprobada, detail: `${stats.approvalRate}% de las solicitudes de esta vista`, icon: CheckCheck, color: 'green', state: 'aprobada' },
            { title: 'Solicitudes pendientes', value: stats.states.pendiente, detail: `${number(stats.states.en_revision)} adicionales en revisión`, icon: Clock3, color: 'gold', state: 'pendiente' },
            { title: 'Solicitudes observadas', value: stats.states.observada, detail: 'Requieren corrección o documentación', icon: CircleAlert, color: 'coral', state: 'observada' },
          ].map(card => <button key={card.title} className={`np-kpi np-kpi--${card.color}`} onClick={() => { changeFilter('estado', card.state); }}><span className="np-kpi-top">{card.title}<card.icon size={19} /></span><strong>{number(card.value)}</strong><span className="np-kpi-detail">{card.detail}</span></button>)}
        </section>

        {view === 'resumen' && <>
          <div className="np-chart-grid">
            <section className="np-panel"><div className="np-panel-title"><div><h2>Ingresos de solicitudes</h2><p>Últimos 6 meses · según los filtros actuales</p></div><span className="np-chart-key"><i /> Recibidas <i className="green" /> Aprobadas</span></div><div className="np-month-chart" role="img" aria-label={stats.months.map(month => `${month.label}: ${month.total} recibidas, ${month.aprobada} actualmente aprobadas`).join('. ')}>{stats.months.map(month => <div className="np-month" key={month.key}><strong>{month.total}</strong><div className="np-month-track"><div className="np-month-total" style={{ height: `${month.total / Math.max(1, ...stats.months.map(item => item.total)) * 100}%` }}><div style={{ height: `${month.total ? month.aprobada / month.total * 100 : 0}%` }} /></div></div><span>{month.label}</span></div>)}</div><p className="np-chart-note">Las aprobadas corresponden al estado actual de las solicitudes recibidas en cada mes.</p></section>
            <section className="np-panel"><div className="np-panel-title"><div><h2>Estado de las solicitudes</h2><p>Distribución de esta vista</p></div><ListFilter size={19} /></div><div className="np-state-stack" aria-hidden="true">{Object.keys(ESTADOS).map(key => <span key={key} style={{ width: `${stats.total ? stats.states[key] / stats.total * 100 : 0}%`, background: stateColors[key] }} />)}</div><div className="np-state-list">{Object.entries(ESTADOS).map(([key, label]) => <button key={key} onClick={() => changeFilter('estado', key)}><span><i style={{ background: stateColors[key] }} />{label}</span><strong>{number(stats.states[key])}<small>{stats.total ? Math.round(stats.states[key] / stats.total * 100) : 0}%</small></strong></button>)}</div></section>
          </div>
          <div className="np-chart-grid np-chart-grid--equal"><section className="np-panel"><div className="np-panel-title"><div><h2>Seccionales con más solicitudes</h2><p>Volumen de solicitudes recibidas</p></div><Building2 size={20} /></div><Ranking groups={stats.sections.slice(0, 5)} onSelect={name => changeFilter('seccional', name)} empty="Todavía no hay solicitudes para agrupar." /></section><section className="np-panel"><div className="np-panel-title"><div><h2>Para atender</h2><p>Alertas nacionales · independientes de los filtros</p></div><CircleAlert size={20} /></div><Link className="np-attention" to="/admin?vista=base&prioridad=demoradas"><span className="np-attention-icon"><Clock3 size={20} /></span><span><strong>Sin resolver hace 7 días o más</strong><small>Pendientes, en revisión u observadas</small></span><b>{number(allStats.overdue)}</b><ArrowUpRight size={17} /></Link><Link className="np-attention" to="/admin?vista=base&prioridad=sin-seccional"><span className="np-attention-icon"><Building2 size={20} /></span><span><strong>Sin seccional informada</strong><small>Revisar el origen de la solicitud</small></span><b>{number(allStats.unassigned)}</b><ArrowUpRight size={17} /></Link><Link className="np-text-link" to="/admin?vista=base">Abrir la base completa <ArrowUpRight size={15} /></Link></section></div>
        </>}

        {view === 'informes' && <>
          <section className="np-panel"><div className="np-panel-title"><div><h2>Gestión por seccional</h2><p>Seleccioná una seccional para filtrar toda la vista.</p></div><Building2 size={20} /></div><GroupTable groups={stats.sections} label="Seccional" onSelect={name => changeFilter('seccional', name)} /></section>
          <div className="np-chart-grid np-chart-grid--equal"><section className="np-panel"><div className="np-panel-title"><div><h2>Distribución por fuerza</h2><p>Solicitudes recibidas</p></div></div><Ranking groups={stats.forces} onSelect={name => changeFilter('fuerza', name)} empty="Sin datos para los filtros actuales." /></section><section className="np-panel"><div className="np-panel-title"><div><h2>Referentes informados</h2><p>Nombre declarado en «¿Quién te afilió?»</p></div></div><div className="np-report-scroll"><GroupTable groups={stats.delegates} label="Referente" /></div></section></div>
        </>}

        {view !== 'informes' && <section className="np-panel np-records" aria-label="Base de afiliaciones">
          <div className="np-panel-title"><div><h2>{view === 'resumen' ? 'Solicitudes de esta vista' : 'Registro de solicitudes'} <span className="np-count">{number(filtered.length)}</span></h2><p>Abrí una ficha para consultar documentos, estado e historial.</p></div><details className="np-columns"><summary><SlidersHorizontal size={16} /> Columnas</summary><div>{Object.entries(optionalColumns).map(([key, title]) => <label key={key}><input type="checkbox" checked={columns.includes(key)} onChange={() => toggleColumn(key)} />{title}</label>)}</div></details></div>
          <div className="np-selection-bar"><span>{selected.size ? `${number(selected.size)} seleccionadas` : 'Seleccioná registros para exportar un grupo'}</span>{selected.size > 0 && <><button onClick={() => setSelected(new Set(sorted.map(row => row.id)))}>Seleccionar {number(sorted.length)} resultados</button><button onClick={() => setSelected(new Set())}>Quitar selección</button></>}</div>
          <div className="np-table-scroll"><table className="np-table"><thead><tr><th><input type="checkbox" aria-label="Seleccionar esta página" checked={pageRows.length > 0 && pageRows.every(row => selected.has(row.id))} onChange={togglePage} /></th>{sortHeader('nro_tramite', 'Trámite / fecha')}{sortHeader('apellido', 'Afiliado / DNI')}{columns.includes('contacto') && <th>Contacto</th>}{columns.includes('fuerza') && sortHeader('fuerza', 'Fuerza / organismo')}{columns.includes('seccional') && sortHeader('seccional', 'Seccional / referente')}{columns.includes('localidad') && sortHeader('localidad', 'Localidad')}{columns.includes('documentos') && <th>Docs.</th>}{sortHeader('estado', 'Estado')}<th><span className="np-sr-only">Abrir ficha</span></th></tr></thead><tbody>
            {!pageRows.length && <tr><td colSpan={10}><div className="np-empty"><Inbox size={32} /><strong>{rows.length ? 'No hay coincidencias' : 'La base está lista para recibir afiliaciones'}</strong><span>{rows.length ? 'Probá con otra búsqueda o limpiá los filtros.' : 'Las nuevas solicitudes aparecerán acá al actualizar.'}</span>{activeFilters.length > 0 && <button className="adm-btn" onClick={clearFilters}>Limpiar filtros</button>}</div></td></tr>}
            {pageRows.map(row => <tr key={row.id} className={selected.has(row.id) ? 'np-selected' : ''}><td><input type="checkbox" aria-label={`Seleccionar ${row.apellido}, ${row.nombres}`} checked={selected.has(row.id)} onChange={() => toggleRow(row.id)} /></td><td><Link className="np-record-link" to={`/admin/${row.id}`} state={{ returnTo: `/admin?${params}` }}>{row.nro_tramite}</Link><small>{fechaHora(row.created_at)}</small></td><td><strong>{row.apellido}, {row.nombres}</strong><small>DNI {row.dni}{row.nro_afiliado ? ` · N.º ${row.nro_afiliado}` : ''}</small></td>{columns.includes('contacto') && <td>{row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : '—'}<small>{row.telefono || 'Sin teléfono'}</small></td>}{columns.includes('fuerza') && <td>{row.fuerza || '—'}<small>{field(row, 'organismo') || 'Sin organismo'}</small></td>}{columns.includes('seccional') && <td>{field(row, 'seccional') || <span className="np-muted">Sin seccional</span>}<small>{field(row, 'afiliado_por') || 'Sin referente'}</small></td>}{columns.includes('localidad') && <td>{row.localidad || '—'}</td>}{columns.includes('documentos') && <td><span className="np-doc-count">{(row.archivos || []).length}</span><small>{(row.archivos || []).some(file => file.campo === 'firma') ? 'Con firma' : 'Sin firma'}</small></td>}<td><span className={`badge ${row.estado}`}>{ESTADOS[row.estado] || row.estado}</span>{overdue(row) && <small className="np-age">7+ días sin resolver</small>}</td><td><Link className="np-open-record" to={`/admin/${row.id}`} state={{ returnTo: `/admin?${params}` }} aria-label={`Abrir ficha de ${row.apellido}, ${row.nombres}`}><ArrowUpRight size={17} /></Link></td></tr>)}
          </tbody></table></div>
          <div className="np-pagination"><span>{filtered.length ? `${number((activePage - 1) * pageSize + 1)}–${number(Math.min(activePage * pageSize, filtered.length))} de ${number(filtered.length)}` : '0 resultados'}</span><label>Filas<select aria-label="Filas por página" value={pageSize} onChange={event => setPageSize(Number(event.target.value))}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><div><button aria-label="Página anterior" disabled={activePage === 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={17} /></button><span>{activePage} / {pages}</span><button aria-label="Página siguiente" disabled={activePage >= pages} onClick={() => setPage(value => value + 1)}><ChevronRight size={17} /></button></div></div>
        </section>}
      </>}

      <section className="np-export-bar" aria-label="Exportaciones"><div className="np-export-label"><FileSpreadsheet size={22} /><div><strong>Información lista para trabajar</strong><span>{selected.size ? `${number(selected.size)} solicitudes seleccionadas` : `${number(filtered.length)} solicitudes con los filtros actuales`} · Excel incluye resumen y seccionales</span></div></div><div className="np-actions"><button className="adm-btn" disabled={!ready || !filtered.length || Boolean(exporting)} onClick={() => download('csv')}><Download size={16} />{exporting === 'csv' ? 'Exportando…' : 'CSV'}</button><button className="adm-btn" disabled={!ready || Boolean(exporting)} onClick={() => window.print()}><Printer size={16} /> Informe PDF</button><button className="adm-btn adm-btn--pri" disabled={!ready || !filtered.length || Boolean(exporting)} onClick={() => download('xlsx')}>{exporting === 'xlsx' ? <LoaderCircle size={17} className="np-spin" /> : <FileSpreadsheet size={17} />}{exporting === 'xlsx' ? 'Preparando Excel…' : 'Descargar Excel'}</button></div></section>
      <p className="np-footnote">Las cifras corresponden a solicitudes registradas en este sistema. «Aprobada» indica el estado de gestión registrado por PECIFA. Informe PDF abre las opciones de impresión y guardado como PDF.</p>

      <section className="np-print-report"><header><img src="/logo.png" alt="PECIFA" /><div><h1>PECIFA Nacional · Informe de afiliaciones</h1><p>Generado el {fechaHora(new Date())} · {stats.total} solicitudes</p></div></header><p>Alcance: {activeFilters.length ? activeFilters.map(([key, value]) => `${filterNames[key]}: ${value}`).join(' · ') : 'Todas las solicitudes registradas'}</p><p>El informe incluye todos los resultados filtrados, independientemente de la selección de filas.</p><h2>Indicadores</h2><table><tbody><tr><th>Solicitudes recibidas</th><td>{stats.total}</td></tr>{Object.entries(ESTADOS).map(([key, label]) => <tr key={key}><th>{label}</th><td>{stats.states[key]}</td></tr>)}<tr><th>Sin resolver hace 7 días o más</th><td>{stats.overdue}</td></tr></tbody></table><h2>Seccionales</h2><GroupTable groups={stats.sections} label="Seccional" /><h2>Fuerzas</h2><GroupTable groups={stats.forces} label="Fuerza" /><h2>Referentes informados</h2><GroupTable groups={stats.delegates} label="Referente" /></section>
    </div>
  );
}

function Ranking({ groups, onSelect, empty }) {
  if (!groups.length) return <p className="np-chart-note">{empty}</p>;
  return <div className="np-ranking">{groups.map(group => <button key={group.name} onClick={() => onSelect(group.name)}><span>{group.name}<strong>{number(group.total)}</strong></span><span className="np-rank-track"><i style={{ width: `${group.total / Math.max(...groups.map(item => item.total), 1) * 100}%` }} /></span></button>)}</div>;
}

function GroupTable({ groups, label, onSelect }) {
  return <div className="np-table-scroll"><table className="np-table np-group-table"><thead><tr><th>{label}</th><th>Total</th><th>Aprobadas</th><th>Sin resolver</th><th>Rechazadas</th><th>% aprobado</th></tr></thead><tbody>{!groups.length && <tr><td colSpan={6} className="np-no-groups">Sin datos para los filtros actuales.</td></tr>}{groups.map(group => <tr key={group.name}><td>{onSelect ? <button className="np-group-link" onClick={() => onSelect(group.name)}>{group.name}</button> : group.name}</td><td><strong>{number(group.total)}</strong></td><td>{number(group.aprobada)}</td><td>{number(group.pendiente + group.en_revision + group.observada)}</td><td>{number(group.rechazada)}</td><td>{Math.round(group.aprobada / group.total * 100)}%</td></tr>)}</tbody></table></div>;
}
