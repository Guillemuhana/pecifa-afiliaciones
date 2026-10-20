import { Component } from 'react';

export function returnToLogin() {
  // Clear only this application's session, leaving other browser data intact.
  try {
    localStorage.removeItem('pecifa-admin');
    localStorage.removeItem('pecifa-admin-code-verifier');
  } finally { window.location.replace('/admin'); }
}

export function AccessRecovery({ session = false }) {
  return <main className="adm admin-recovery"><section className="adm-login" role="alert">
    <img src="/logo.png" alt="PECIFA" />
    <h1>{session ? 'No pudimos recuperar tu sesión' : 'No pudimos abrir el panel'}</h1>
    <p>{session ? 'Volvé a intentar o ingresá nuevamente con tu cuenta.' : 'Puede haber una actualización pendiente o un problema de conexión. Volvé a cargar para continuar.'}</p>
    <button className="adm-btn adm-btn--pri" onClick={() => window.location.reload()}>Volver a cargar</button>
    <button className="adm-btn" onClick={returnToLogin}>Volver al ingreso</button>
  </section></main>;
}

export default class AdminBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) {
    console.error('Error al abrir el panel de afiliaciones', error);
    // A tab opened before a deployment may still request the previous version's JavaScript.
    if (/dynamically imported|loading chunk|importing a module|module script/i.test(error?.message || '')) {
      try {
        const key = 'pecifa-panel-reload';
        const last = Number(sessionStorage.getItem(key));
        if (Date.now() - last > 60000) {
          sessionStorage.setItem(key, String(Date.now()));
          window.location.reload();
        }
      } catch { /* Recovery buttons remain available if browser storage is blocked. */ }
    }
  }
  render() { return this.state.failed ? <AccessRecovery /> : this.props.children; }
}
