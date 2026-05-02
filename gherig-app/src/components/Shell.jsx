import { useState, useEffect } from 'react';
import { useNcris, useNcrisAuth } from '../bridge/NcrisProvider.jsx';
import {
  Tablet, Hospital, Command, Activity, Truck, ChevronDown, LogOut, Wifi, WifiOff,
  ShieldCheck, Settings,
} from 'lucide-react';

const SUBS = {
  tablet: { name: 'Pre-referral Tablet', icon: Tablet,  color: '#5B7FB7' },
  portal: { name: 'Hospital Portal',     icon: Hospital, color: '#7B6FAA' },
  necc:   { name: 'NECC Command Centre', icon: Command,  color: '#A85C3A' },
  arcs:   { name: 'ARCS Dispatch',        icon: Activity, color: '#5C8A6F' },
  emt:    { name: 'EMT Device',           icon: Truck,    color: '#B89A4E' },
};

const PALETTE = {
  bg: '#FAFAF7', surface: '#FFFFFF', surface2: '#F4F3EE',
  ink: '#1A1815', ink2: '#4A4641', ink3: '#8A857E',
  border: '#E8E6DD', borderStrong: '#D8D4CC',
};

export default function Shell({ subsystemId, onSwitch, children }) {
  const { user, ncris } = useNcris();
  const { logout } = useNcrisAuth();
  const [wsConnected, setWsConnected] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [auditEvents, setAuditEvents] = useState([]);

  useEffect(() => {
    const checkWs = () => setWsConnected(!!(ncris.ws && ncris.ws.readyState === 1));
    const interval = setInterval(checkWs, 1000);
    checkWs();
    return () => clearInterval(interval);
  }, [ncris]);

  // Subscribe to high-level audit-style topic for the live ticker
  useEffect(() => {
    const handler = (msg) => {
      setAuditEvents((prev) => [{
        topic: msg.topic, payload: msg.payload, t: msg.timestamp,
      }, ...prev].slice(0, 8));
    };
    const unsubA = ncris.subscribe('necc.national', handler);
    const unsubB = ncris.subscribe('escalation.national', handler);
    return () => { unsubA(); unsubB(); };
  }, [ncris]);

  const meta = SUBS[subsystemId];
  const Icon = meta?.icon || Command;

  return (
    <div style={{ minHeight: '100vh', background: PALETTE.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <header style={{
        background: PALETTE.surface, borderBottom: `1px solid ${PALETTE.border}`,
        padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 16,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        {/* GhERIG mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: PALETTE.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ShieldCheck size={16} color="#FAFAF7" />
          </div>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600, lineHeight: 1, color: PALETTE.ink }}>GhERIG</div>
            <div style={{ fontSize: 9, color: PALETTE.ink3, letterSpacing: '1px', textTransform: 'uppercase', marginTop: 2 }}>v1.0 · Pilot</div>
          </div>
        </div>

        <div style={{ width: 1, height: 24, background: PALETTE.border, margin: '0 6px' }} />

        {/* Subsystem switcher */}
        <button
          onClick={() => setShowMenu(!showMenu)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '6px 12px', background: PALETTE.surface2,
            border: `1px solid ${PALETTE.border}`, borderRadius: 8,
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: PALETTE.ink,
            position: 'relative',
          }}
        >
          <div style={{
            width: 22, height: 22, borderRadius: 6, background: `${meta?.color}1A`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={13} color={meta?.color} />
          </div>
          <span style={{ fontWeight: 600 }}>{meta?.name || 'Subsystem'}</span>
          <ChevronDown size={14} color={PALETTE.ink3} />
        </button>

        {showMenu && (
          <div style={{
            position: 'absolute', top: 56, left: 152, background: PALETTE.surface,
            border: `1px solid ${PALETTE.border}`, borderRadius: 10,
            boxShadow: '0 12px 32px rgba(26,24,21,0.12)',
            padding: 6, minWidth: 240, zIndex: 200,
          }}>
            {Object.entries(SUBS).map(([id, s]) => {
              const SIcon = s.icon;
              return (
                <button
                  key={id}
                  onClick={() => { setShowMenu(false); onSwitch(id); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', background: id === subsystemId ? PALETTE.surface2 : 'transparent',
                    border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                    color: PALETTE.ink, textAlign: 'left',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = PALETTE.surface2}
                  onMouseLeave={(e) => e.currentTarget.style.background = id === subsystemId ? PALETTE.surface2 : 'transparent'}
                >
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: `${s.color}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <SIcon size={13} color={s.color} />
                  </div>
                  <span style={{ fontWeight: 500 }}>{s.name}</span>
                </button>
              );
            })}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Live audit ticker */}
        <LiveTicker events={auditEvents} />

        {/* WS status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
          background: wsConnected ? '#ECFDF5' : '#FEF3C7',
          color: wsConnected ? '#065F46' : '#92400E',
          borderRadius: 100, fontSize: 11, fontWeight: 500,
        }}>
          {wsConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
          {wsConnected ? 'NCRIS · live' : 'reconnecting'}
        </div>

        {/* User chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: PALETTE.ink, lineHeight: 1.2 }}>{user?.username}</div>
            <div style={{ fontSize: 10, color: PALETTE.ink3, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{user?.role?.replace(/_/g, ' ')}</div>
          </div>
          <button
            onClick={logout}
            style={{
              padding: 8, background: PALETTE.surface2, border: `1px solid ${PALETTE.border}`,
              borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center',
              color: PALETTE.ink2,
            }}
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Subsystem viewport */}
      <main style={{ flex: 1, position: 'relative' }}>
        {children}
      </main>
    </div>
  );
}

function LiveTicker({ events }) {
  if (events.length === 0) return null;
  const latest = events[0];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      maxWidth: 360, overflow: 'hidden',
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: 3, background: '#10B981',
        boxShadow: '0 0 8px #10B981',
      }} />
      <div style={{
        fontSize: 11, color: PALETTE.ink3, fontFamily: 'JetBrains Mono, monospace',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        <span style={{ color: PALETTE.ink2, fontWeight: 600 }}>{latest.topic}</span>
        {' · '}
        {latest.payload?.event || latest.payload?.referral?.referralNumber || latest.payload?.dispatch?.id?.slice(0, 8) || 'event'}
      </div>
    </div>
  );
}
