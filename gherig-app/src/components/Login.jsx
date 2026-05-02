import { useState, useEffect } from 'react';
import { useNcrisAuth, useNcrisHealth } from '../bridge/NcrisProvider.jsx';
import {
  Tablet, Hospital, Command, Truck, Activity, ShieldCheck, AlertCircle, CheckCircle2, Loader2,
} from 'lucide-react';

const SUBSYSTEMS = [
  {
    id: 'tablet',
    name: 'Pre-referral Tablet',
    description: 'Bedside referral capture for ED clinicians',
    icon: Tablet,
    color: '#5B7FB7',
    user: { username: 'kbth.tablet', password: 'tablet-demo-2026' },
  },
  {
    id: 'portal',
    name: 'Hospital Portal',
    description: 'Inbound + outbound referral coordination',
    icon: Hospital,
    color: '#7B6FAA',
    user: { username: 'kbth.portal', password: 'portal-demo-2026' },
  },
  {
    id: 'necc',
    name: 'NECC Command Centre',
    description: 'National bed-search, capacity, escalation broker',
    icon: Command,
    color: '#A85C3A',
    user: { username: 'necc.operator', password: 'necc-demo-2026' },
  },
  {
    id: 'arcs',
    name: 'ARCS Dispatch',
    description: 'Regional ambulance dispatch + brokerage',
    icon: Activity,
    color: '#5C8A6F',
    user: { username: 'arcs.ga.dispatcher', password: 'arcs-demo-2026' },
  },
  {
    id: 'emt',
    name: 'EMT Device',
    description: 'In-vehicle paramedic tablet',
    icon: Truck,
    color: '#B89A4E',
    user: { username: 'emt.gr002', password: 'emt-demo-2026' },
  },
];

const PALETTE = {
  bg: '#FAFAF7',
  surface: '#FFFFFF',
  ink: '#1A1815',
  ink2: '#4A4641',
  ink3: '#8A857E',
  border: '#E8E6DD',
  borderStrong: '#D8D4CC',
  accent: '#1A1815',
};

export default function Login({ onAuthed }) {
  const { login, busy, error } = useNcrisAuth();
  const health = useNcrisHealth();
  const [picked, setPicked] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localErr, setLocalErr] = useState(null);

  // Pre-fill credentials when a subsystem is picked
  useEffect(() => {
    if (picked) {
      setUsername(picked.user.username);
      setPassword(picked.user.password);
      setLocalErr(null);
    }
  }, [picked]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!picked) return;
    setLocalErr(null);
    try {
      await login(username, password, picked.id);
      onAuthed(picked.id);
    } catch (err) {
      setLocalErr(err.message || 'Login failed');
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: PALETTE.bg, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ maxWidth: 1080, width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12, background: PALETTE.ink,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShieldCheck size={26} color="#FAFAF7" />
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 600, color: PALETTE.ink, letterSpacing: '-0.5px' }}>GhERIG</div>
              <div style={{ fontSize: 11, color: PALETTE.ink3, letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 2 }}>
                Ghana Emergency Referral & Intelligence Grid
              </div>
            </div>
          </div>
          <div style={{ fontSize: 14, color: PALETTE.ink2, marginTop: 16, fontWeight: 400 }}>
            Pilot demonstration · Greater Accra · v1.0
          </div>
        </div>

        {/* NCRIS health */}
        <NcrisHealthChip health={health} />

        {/* Subsystem grid */}
        <div style={{ marginTop: 28, marginBottom: 16 }}>
          <div style={{
            fontSize: 11, color: PALETTE.ink3, letterSpacing: '1.5px',
            textTransform: 'uppercase', fontWeight: 600, marginBottom: 12,
          }}>
            Choose subsystem
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12,
          }}>
            {SUBSYSTEMS.map(s => {
              const Icon = s.icon;
              const selected = picked?.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setPicked(s)}
                  style={{
                    background: selected ? PALETTE.ink : PALETTE.surface,
                    border: `1.5px solid ${selected ? PALETTE.ink : PALETTE.border}`,
                    borderRadius: 14, padding: '20px 18px', textAlign: 'left',
                    cursor: 'pointer', transition: 'all 160ms',
                    color: selected ? '#FAFAF7' : PALETTE.ink,
                  }}
                  onMouseEnter={(e) => { if (!selected) e.currentTarget.style.borderColor = PALETTE.borderStrong; }}
                  onMouseLeave={(e) => { if (!selected) e.currentTarget.style.borderColor = PALETTE.border; }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: selected ? 'rgba(250,250,247,0.12)' : `${s.color}1A`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
                  }}>
                    <Icon size={18} color={selected ? '#FAFAF7' : s.color} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{s.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.72, lineHeight: 1.4 }}>{s.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Login form */}
        {picked && (
          <form onSubmit={handleLogin} style={{
            background: PALETTE.surface, border: `1.5px solid ${PALETTE.border}`,
            borderRadius: 14, padding: 24, marginTop: 16,
          }}>
            <div style={{
              fontSize: 11, color: PALETTE.ink3, letterSpacing: '1.5px',
              textTransform: 'uppercase', fontWeight: 600, marginBottom: 12,
            }}>
              Sign in to {picked.name}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Input label="Username" value={username} onChange={setUsername} />
              <Input label="Password" type="password" value={password} onChange={setPassword} />
            </div>

            <div style={{
              fontSize: 12, color: PALETTE.ink3, marginBottom: 16, padding: 10,
              background: PALETTE.bg, borderRadius: 8,
            }}>
              <strong style={{ color: PALETTE.ink2 }}>Demo credentials pre-filled.</strong> Production credentials are issued by the GhERIG Programme Office.
            </div>

            {(localErr || error) && (
              <div style={{
                background: '#FEF2F2', color: '#991B1B', borderRadius: 8,
                padding: 12, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <AlertCircle size={16} />
                {localErr || error?.message}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !health.ok}
              style={{
                width: '100%', padding: '14px 20px', background: PALETTE.ink, color: '#FAFAF7',
                border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                opacity: busy || !health.ok ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {busy ? <><Loader2 size={16} className="spin" /> Signing in…</> : `Sign in to ${picked.name}`}
            </button>

            {!health.ok && (
              <div style={{ fontSize: 12, color: PALETTE.ink3, marginTop: 10, textAlign: 'center' }}>
                NCRIS is unreachable. Start the backend with <code style={{ background: PALETTE.bg, padding: '2px 6px', borderRadius: 4 }}>node src/index.js</code> in the ncris folder.
              </div>
            )}
          </form>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 32, fontSize: 11, color: PALETTE.ink3, letterSpacing: '1px' }}>
          EVERY WHEEL · EVERY MINUTE · EVERY PATIENT
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text' }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11, color: PALETTE.ink3, marginBottom: 6, fontWeight: 500, letterSpacing: '0.5px' }}>{label.toUpperCase()}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', padding: '11px 12px', border: `1.5px solid ${PALETTE.border}`,
          borderRadius: 8, fontSize: 14, fontFamily: 'inherit', background: PALETTE.bg, color: PALETTE.ink,
          outline: 'none',
        }}
        onFocus={(e) => e.currentTarget.style.borderColor = PALETTE.ink}
        onBlur={(e) => e.currentTarget.style.borderColor = PALETTE.border}
      />
    </label>
  );
}

function NcrisHealthChip({ health }) {
  const ok = health.ok;
  const checking = health.ok === null;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '8px 14px', borderRadius: 100,
      background: ok ? '#ECFDF5' : checking ? '#FEF3C7' : '#FEF2F2',
      color: ok ? '#065F46' : checking ? '#92400E' : '#991B1B',
      fontSize: 12, fontWeight: 500,
      margin: '0 auto', display: 'flex', maxWidth: 'fit-content',
    }}>
      {checking ? <Loader2 size={13} className="spin" /> : ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
      NCRIS {checking ? 'connecting' : ok ? `online · v${health.banner?.version || '?'}` : 'unreachable'}
      {ok && health.banner?.engineVersion && (
        <span style={{ opacity: 0.7, marginLeft: 4 }}>· engine {health.banner.engineVersion}</span>
      )}
    </div>
  );
}
