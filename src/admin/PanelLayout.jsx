import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Building2, ChartNoAxesCombined, ChevronRight, ExternalLink, LayoutDashboard, LogOut, ShieldCheck, Table2 } from 'lucide-react';
import { supabase } from '../supabase.js';
import './panel.css';

export default function PanelLayout({ usuario, children }) {
  const [params] = useSearchParams();
  const location = useLocation();
  const detail = location.pathname.replace(/\/$/, '') !== '/admin';
  const view = detail ? 'base' : params.get('vista') || 'resumen';
  function targetView(key) {
    const next = new URLSearchParams(detail ? '' : params);
    if (key === 'resumen') next.delete('vista'); else next.set('vista', key);
    return `/admin${next.size ? `?${next}` : ''}`;
  }
  return <div className="adm np-app">
    <aside className="np-sidebar">
      <Link className="np-brand" to="/admin"><img src="/logo.png" alt="PECIFA" /><span><strong>PECIFA</strong><small>ADMINISTRACIÓN NACIONAL</small></span></Link>
      <div className="np-workspace"><Building2 size={19} /><span><strong>Afiliaciones</strong><small>Espacio de gestión nacional</small></span><span className="np-workspace-dot" /></div>
      <p className="np-nav-label">GESTIÓN</p>
      <nav aria-label="Navegación del panel">{[
        { key: 'resumen', to: '/admin', label: 'Resumen nacional', icon: LayoutDashboard },
        { key: 'base', to: '/admin?vista=base', label: 'Base de afiliaciones', icon: Table2 },
        { key: 'informes', to: '/admin?vista=informes', label: 'Informes y seccionales', icon: ChartNoAxesCombined },
      ].map(item => <Link key={item.key} to={targetView(item.key)} className={view === item.key ? 'active' : ''} aria-current={view === item.key ? 'page' : undefined}><item.icon size={18} />{item.label}<ChevronRight size={14} /></Link>)}</nav>
      <div className="np-sidebar-bottom"><div className="np-access-note"><ShieldCheck size={20} /><strong>Gestión institucional</strong><p>Información centralizada para acompañar cada afiliación.</p></div><Link className="np-public-link" to="/" target="_blank" rel="noreferrer">Abrir formulario público <ExternalLink size={14} /></Link></div>
    </aside>
    <div className="np-content"><header className="np-topbar"><div className="np-breadcrumb">Afiliaciones <ChevronRight size={13} /><strong>{detail ? 'Ficha de solicitud' : view === 'base' ? 'Base nacional' : view === 'informes' ? 'Informes' : 'Resumen'}</strong></div><div className="np-user"><span className="np-user-avatar">{usuario.slice(0, 2).toUpperCase()}</span><span><strong>{usuario}</strong><small>Personal autorizado</small></span><button className="np-logout" onClick={() => supabase.auth.signOut()} aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={18} /></button></div></header><main className="adm-main">{children}</main></div>
  </div>;
}
