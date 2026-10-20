import { useState } from 'react';
import { LazyMotion, domAnimation, MotionConfig } from 'motion/react';
import * as m from 'motion/react-m';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, FileCheck2, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase.js';
import './login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  async function enter(event) {
    event.preventDefault();
    setBusy('login');
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setMessage({ type: 'error', text: 'Correo o contraseña incorrectos. Revisá tus datos e intentá de nuevo.' });
    } catch {
      setMessage({ type: 'error', text: 'No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.' });
    } finally { setBusy(null); }
  }

  async function recover() {
    const input = document.getElementById('staff-email');
    if (!input.reportValidity() || !email.trim()) { input.focus(); return; }
    setBusy('recovery');
    setMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/admin` });
      setMessage(error
        ? { type: 'error', text: 'No se pudo enviar el correo. Intentá de nuevo en unos minutos.' }
        : { type: 'success', text: 'Revisá tu correo: te enviamos las instrucciones para recuperar el acceso.' });
    } catch {
      setMessage({ type: 'error', text: 'No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.' });
    } finally { setBusy(null); }
  }

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <main className="staff-login">
          <div className="staff-glow staff-glow--one" aria-hidden="true" />
          <div className="staff-glow staff-glow--two" aria-hidden="true" />
          <header className="staff-topbar">
            <Link to="/" className="staff-back"><ArrowLeft size={16} aria-hidden="true" /> Volver al sitio</Link>
            <span><ShieldCheck size={16} aria-hidden="true" /> Portal institucional</span>
          </header>

          <m.div className="staff-shell" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <section className="staff-brand" aria-labelledby="staff-brand-title">
              <div className="staff-brand-top"><span className="staff-eyebrow">PE.CI.F.A.</span><span className="staff-gold-line" /></div>
              <div className="staff-emblem"><img src="/logo.png" alt="Escudo de PECIFA" width="180" height="180" /></div>
              <div className="staff-brand-copy">
                <span className="staff-eyebrow">Cerca de cada afiliado</span>
                <h2 id="staff-brand-title">Una gestión más simple.<br /><span>Un vínculo más fuerte.</span></h2>
                <p>Todo lo que necesitás para acompañar a nuestros afiliados, en un solo lugar.</p>
              </div>
              <div className="staff-features">
                <span><Users size={18} aria-hidden="true" /> Gestión de afiliaciones</span>
                <span><FileCheck2 size={18} aria-hidden="true" /> Documentación y seguimiento</span>
              </div>
              <p className="staff-institution">Unión del Personal Civil de las Fuerzas Armadas</p>
            </section>

            <section className="staff-access" aria-labelledby="staff-title">
              <div className="staff-access-inner">
                <div className="staff-access-tag"><span /> Acceso de administración</div>
                <h1 id="staff-title">Te damos la bienvenida</h1>
                <p className="staff-intro">Ingresá a tu panel de afiliaciones con tu cuenta autorizada.</p>
                <form onSubmit={enter} className="staff-form" aria-busy={Boolean(busy)}>
                  <div className="staff-field">
                    <label htmlFor="staff-email">Correo electrónico</label>
                    <div className="staff-input"><Mail size={19} aria-hidden="true" /><input id="staff-email" type="email" autoComplete="username" placeholder="tu.correo@pecifa.org" value={email} onChange={e => setEmail(e.target.value)} required /></div>
                  </div>
                  <div className="staff-field">
                    <label htmlFor="staff-password">Contraseña</label>
                    <div className="staff-input"><LockKeyhole size={19} aria-hidden="true" /><input id="staff-password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Ingresá tu contraseña" value={password} onChange={e => setPassword(e.target.value)} required /><button type="button" className="staff-reveal" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button></div>
                  </div>
                  <button type="button" className="staff-forgot" onClick={recover} disabled={Boolean(busy)}>{busy === 'recovery' ? 'Enviando instrucciones…' : '¿Olvidaste tu contraseña?'}</button>
                  <div aria-live="polite" aria-atomic="true">{message && <p className={`staff-message staff-message--${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.type === 'success' && <Check size={18} aria-hidden="true" />}{message.text}</p>}</div>
                  <m.button type="submit" className="staff-submit" disabled={Boolean(busy)} whileHover={{ y: -2 }} whileTap={{ scale: 0.985 }}>{busy === 'login' ? <><LoaderCircle className="staff-spinner" size={20} aria-hidden="true" /> Ingresando…</> : <>Ingresar al panel <ArrowRight size={20} aria-hidden="true" /></>}</m.button>
                </form>
                <div className="staff-trust"><ShieldCheck size={18} aria-hidden="true" /><span>Acceso exclusivo para personal autorizado</span></div>
              </div>
              <p className="staff-access-foot">PECIFA <span>·</span> Sistema de afiliaciones</p>
            </section>
          </m.div>
          <footer className="staff-footer">Al servicio de quienes nos eligen, todos los días.</footer>
        </main>
      </LazyMotion>
    </MotionConfig>
  );
}
