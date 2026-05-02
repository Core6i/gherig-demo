import { useState } from 'react';
import {
  useReferrals, useDispatches, useEscalations, useCapacity, useVehicles,
  useNcris,
} from '../bridge/NcrisProvider.jsx';
import {
  Activity, X, ChevronUp, ChevronDown, Send, Database, Wifi,
  CheckCircle2, Clock, AlertCircle,
} from 'lucide-react';

const PALETTE = {
  bg: '#FAFAF7', surface: '#FFFFFF',
  ink: '#1A1815', ink2: '#4A4641', ink3: '#8A857E',
  border: '#E8E6DD',
  accent: '#1A1815',
};

/**
 * NcrisPanel — a floating draw-out panel that shows live NCRIS data.
 *
 * This proves to anyone watching the demo that the subsystem is talking
 * to a real backend. The hardcoded mock data inside each JSX subsystem
 * remains visible in the main UI, and this panel sits alongside it
 * showing the actual NCRIS state. As you deeply wire each subsystem,
 * the data in the panel and the data in the main UI converge.
 */
export default function NcrisPanel({ subsystemId }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('referrals');
  const { user } = useNcris();

  const tabs = pickTabsForSubsystem(subsystemId);

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 50,
          background: PALETTE.ink, color: '#FAFAF7',
          border: 'none', borderRadius: 100, padding: '12px 18px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 12px 32px rgba(26,24,21,0.20)',
          fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
        }}
      >
        <Activity size={14} />
        Live NCRIS Data
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      {/* Slide-out panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 80, right: 24, zIndex: 50,
          width: 460, maxHeight: '70vh',
          background: PALETTE.surface, border: `1px solid ${PALETTE.border}`,
          borderRadius: 14,
          boxShadow: '0 24px 48px rgba(26,24,21,0.16)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <PanelHeader user={user} onClose={() => setOpen(false)} />
          <PanelTabs tabs={tabs} active={tab} onChange={setTab} />
          <div style={{ flex: 1, overflow: 'auto' }}>
            {tab === 'referrals'   && <ReferralsTab />}
            {tab === 'dispatches'  && <DispatchesTab />}
            {tab === 'vehicles'    && <VehiclesTab />}
            {tab === 'escalations' && <EscalationsTab />}
            {tab === 'capacity'    && <CapacityTab />}
            {tab === 'about'       && <AboutTab subsystemId={subsystemId} />}
          </div>
          <PanelFooter />
        </div>
      )}
    </>
  );
}

function pickTabsForSubsystem(id) {
  const all = {
    tablet: ['referrals', 'about'],
    portal: ['referrals', 'capacity', 'about'],
    necc:   ['referrals', 'escalations', 'capacity', 'about'],
    arcs:   ['dispatches', 'vehicles', 'about'],
    emt:    ['dispatches', 'about'],
  };
  return (all[id] || ['about']).map(t => ({
    id: t,
    label: t.charAt(0).toUpperCase() + t.slice(1),
  }));
}

function PanelHeader({ user, onClose }) {
  return (
    <div style={{
      padding: '14px 18px', borderBottom: `1px solid ${PALETTE.border}`,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: '#10B98114',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Database size={16} color="#059669" />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: PALETTE.ink }}>NCRIS · Live Data</div>
        <div style={{ fontSize: 10, color: PALETTE.ink3, letterSpacing: '0.5px', textTransform: 'uppercase', marginTop: 2 }}>
          {user?.username} · {user?.role}
        </div>
      </div>
      <button onClick={onClose} style={{
        padding: 6, background: 'transparent', border: 'none',
        cursor: 'pointer', color: PALETTE.ink3,
      }}>
        <X size={16} />
      </button>
    </div>
  );
}

function PanelTabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${PALETTE.border}`, padding: '0 8px' }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            padding: '10px 14px', background: 'transparent', border: 'none',
            borderBottom: `2px solid ${active === t.id ? PALETTE.ink : 'transparent'}`,
            fontSize: 12, fontWeight: active === t.id ? 600 : 500,
            color: active === t.id ? PALETTE.ink : PALETTE.ink3,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function PanelFooter() {
  return (
    <div style={{
      padding: '8px 14px', borderTop: `1px solid ${PALETTE.border}`,
      background: PALETTE.bg, fontSize: 10, color: PALETTE.ink3,
      display: 'flex', alignItems: 'center', gap: 6,
      letterSpacing: '0.5px',
    }}>
      <Wifi size={11} />
      Auto-refreshing via WebSocket · GET /api/v1
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────

function ReferralsTab() {
  const { data, loading, error } = useReferrals({});
  if (loading) return <Empty>Loading referrals…</Empty>;
  if (error) return <Empty>Error: {error.message}</Empty>;
  const referrals = data?.referrals || [];
  if (referrals.length === 0) {
    return <Empty>No referrals yet. Submit one from the Tablet.</Empty>;
  }
  return (
    <div style={{ padding: 12 }}>
      <Counter label="Live referrals in NCRIS" value={referrals.length} />
      {referrals.slice(0, 12).map(r => (
        <Row
          key={r.id}
          title={r.referralNumber}
          subtitle={r.condition}
          status={r.state}
          priority={r.priority}
          time={r.createdAt}
          meta={`${r.fromFacilityCode} → ${r.targetFacilityCode || 'unrouted'}`}
        />
      ))}
    </div>
  );
}

function DispatchesTab() {
  const { data, loading, error } = useDispatches({});
  if (loading) return <Empty>Loading…</Empty>;
  if (error) return <Empty>Error: {error.message}</Empty>;
  const dispatches = data?.dispatches || [];
  if (dispatches.length === 0) return <Empty>No dispatches yet.</Empty>;
  return (
    <div style={{ padding: 12 }}>
      <Counter label="Live dispatches in NCRIS" value={dispatches.length} />
      {dispatches.slice(0, 12).map(d => (
        <Row
          key={d.id}
          title={d.id.slice(0, 8)}
          subtitle={d.condition}
          status={d.state}
          priority={d.priority}
          time={d.requestedAt}
          meta={`${d.fromFacilityCode} → ${d.toFacilityCode}${d.vehicleCode ? ` · ${d.vehicleCode}` : ''}`}
        />
      ))}
    </div>
  );
}

function VehiclesTab() {
  const { data, loading, error } = useVehicles({});
  if (loading) return <Empty>Loading…</Empty>;
  if (error) return <Empty>Error: {error.message}</Empty>;
  const vehicles = data?.vehicles || [];
  return (
    <div style={{ padding: 12 }}>
      <Counter label="Vehicles in fleet" value={vehicles.length} />
      {vehicles.map(v => (
        <Row
          key={v.id}
          title={v.code}
          subtitle={`${v.type} · ${v.station}`}
          status={v.status}
          priority={null}
          meta={`${v.region} · ${v.district}`}
          time={v.updatedAt}
        />
      ))}
    </div>
  );
}

function EscalationsTab() {
  const { data, loading } = useEscalations({});
  if (loading) return <Empty>Loading…</Empty>;
  const escalations = data?.escalations || [];
  if (escalations.length === 0) return <Empty>No escalations open.</Empty>;
  return (
    <div style={{ padding: 12 }}>
      <Counter label="Live escalations" value={escalations.length} />
      {escalations.map(e => (
        <Row
          key={e.id}
          title={e.kind}
          subtitle={e.summary}
          status={e.status}
          priority={e.severity}
          meta={e.facilityCode}
          time={e.raisedAt}
        />
      ))}
    </div>
  );
}

function CapacityTab() {
  const { data, loading } = useCapacity();
  if (loading) return <Empty>Loading…</Empty>;
  const capacity = data?.capacity || [];
  return (
    <div style={{ padding: 12 }}>
      <Counter label="Facilities tracked" value={capacity.length} />
      {capacity.map(c => (
        <Row
          key={c.id}
          title={c.facilityCode}
          subtitle={`${c.bedsAvailable}/${c.bedsTotal} beds · ${c.icuAvailable} ICU`}
          status={c.status}
          priority={null}
          time={c.updatedAt}
          meta={`updated by ${c.updatedBy?.slice(0, 8) || '?'}`}
        />
      ))}
    </div>
  );
}

function AboutTab({ subsystemId }) {
  const points = {
    tablet:  ['POST /api/v1/referrals on submit', 'POST /api/v1/identity/nhia/verify on patient lookup', 'POST /api/v1/clinical/assess for engine verification'],
    portal:  ['GET /api/v1/referrals on inbox load', 'POST /api/v1/referrals/:id/accept on accept', 'PUT /api/v1/capacity/:code on capacity update', 'WS subscribe: referral.{facility}'],
    necc:    ['GET /api/v1/referrals (no facility filter)', 'POST /api/v1/bedsearch on bed-search', 'POST /api/v1/escalations on raise', 'WS subscribe: necc.national, escalation.national'],
    arcs:    ['GET /api/v1/dispatches?region=GA', 'POST /api/v1/dispatches/:id/assign on assign', 'POST /api/v1/brokerage on inter-region request', 'WS subscribe: dispatch.GA, brokerage.hq'],
    emt:     ['POST /api/v1/dispatches/:id/transition on lifecycle step', 'POST /api/v1/dispatches/:id/gps every 15s', 'POST /api/v1/observations on vital capture', 'WS subscribe: dispatch.{vehicleCode}'],
  };
  const list = points[subsystemId] || [];
  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: PALETTE.ink3, letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>
        How this subsystem talks to NCRIS
      </div>
      {list.map((p, i) => (
        <div key={i} style={{
          display: 'flex', gap: 10, padding: '10px 0',
          borderBottom: i < list.length - 1 ? `1px solid ${PALETTE.border}` : 'none',
        }}>
          <Send size={14} color={PALETTE.ink3} style={{ flexShrink: 0, marginTop: 2 }} />
          <code style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: PALETTE.ink2,
            lineHeight: 1.5, wordBreak: 'break-all',
          }}>{p}</code>
        </div>
      ))}
      <div style={{
        marginTop: 16, padding: 12, background: PALETTE.bg, borderRadius: 8,
        fontSize: 11, color: PALETTE.ink2, lineHeight: 1.5,
      }}>
        <strong style={{ color: PALETTE.ink }}>Reading the demo.</strong> The subsystem UI above shows seed data from when it was originally built.
        The panel here shows live data from the NCRIS server — every referral, dispatch, escalation, and capacity update is real.
        As you deeply wire each subsystem, the seed data will be replaced and both views will converge.
      </div>
    </div>
  );
}

// ── Components ─────────────────────────────────────────────────────────

function Counter({ label, value }) {
  return (
    <div style={{
      padding: '10px 12px', background: PALETTE.bg, borderRadius: 8,
      marginBottom: 10, display: 'flex', alignItems: 'baseline', gap: 8,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: PALETTE.ink, fontFamily: 'Fraunces, serif' }}>{value}</div>
      <div style={{ fontSize: 11, color: PALETTE.ink3, letterSpacing: '0.5px' }}>{label}</div>
    </div>
  );
}

function Row({ title, subtitle, status, priority, time, meta }) {
  const statusColors = {
    submitted: '#5B7FB7', routed: '#5B7FB7', accepted: '#5C8A6F',
    declined: '#A85C3A', cancelled: '#8A857E',
    requested: '#5B7FB7', assigned: '#7B6FAA', en_route_pickup: '#7B6FAA',
    on_scene: '#7B6FAA', en_route_dest: '#7B6FAA', arrived: '#5C8A6F', cleared: '#8A857E',
    available: '#5C8A6F', dispatched: '#7B6FAA',
    open: '#A85C3A', resolved: '#5C8A6F',
    full: '#A85C3A', constrained: '#B89A4E',
  };
  const priorityColors = {
    critical: '#A85C3A', high: '#B89A4E', routine: '#5C8A6F',
  };
  return (
    <div style={{
      padding: '10px 12px', borderBottom: `1px solid ${PALETTE.border}`,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600, color: PALETTE.ink }}>{title}</code>
        <div style={{ flex: 1 }} />
        {priority && (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 100,
            background: `${priorityColors[priority] || '#8A857E'}1A`,
            color: priorityColors[priority] || '#8A857E',
            letterSpacing: '0.5px', textTransform: 'uppercase',
          }}>{priority}</span>
        )}
        {status && (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 100,
            background: `${statusColors[status] || '#8A857E'}1A`,
            color: statusColors[status] || '#8A857E',
            letterSpacing: '0.5px',
          }}>{status}</span>
        )}
      </div>
      {subtitle && <div style={{ fontSize: 12, color: PALETTE.ink2, lineHeight: 1.4 }}>{subtitle}</div>}
      {meta && <div style={{ fontSize: 10, color: PALETTE.ink3, fontFamily: 'JetBrains Mono, monospace' }}>{meta}</div>}
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{
      padding: 32, textAlign: 'center', color: PALETTE.ink3, fontSize: 12,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    }}>
      <Clock size={22} color={PALETTE.ink3} />
      {children}
    </div>
  );
}
