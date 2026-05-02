import { Suspense, lazy, useState, useEffect } from 'react';
import { useNcris } from './bridge/NcrisProvider.jsx';
import Login from './components/Login.jsx';
import Shell from './components/Shell.jsx';
import NcrisPanel from './components/NcrisPanel.jsx';
import { Loader2 } from 'lucide-react';

// Lazy-load the heavy subsystem components so we don't pay the cost
// for subsystems the user doesn't open. Each is ~80–180KB unminified.
const TabletApp   = lazy(() => import('./subsystems/gherig-tabletfinal.jsx'));
const PortalApp   = lazy(() => import('./subsystems/GherigHospitalPortalf.jsx'));
const NeccApp     = lazy(() => import('./subsystems/NeccCommandCentre.jsx'));
const ArcsApp     = lazy(() => import('./subsystems/ArcsPortal.jsx'));
const EmtApp      = lazy(() => import('./subsystems/EmtDevice.jsx'));

const SUBSYSTEMS = {
  tablet: TabletApp,
  portal: PortalApp,
  necc:   NeccApp,
  arcs:   ArcsApp,
  emt:    EmtApp,
};

export default function App() {
  const { authed } = useNcris();
  const [subsystemId, setSubsystemId] = useState(() => sessionStorage.getItem('gherig.subsystem') || 'tablet');

  // Persist selection
  useEffect(() => {
    if (subsystemId) sessionStorage.setItem('gherig.subsystem', subsystemId);
  }, [subsystemId]);

  if (!authed) {
    return <Login onAuthed={(picked) => setSubsystemId(picked)} />;
  }

  const Subsystem = SUBSYSTEMS[subsystemId];

  return (
    <Shell subsystemId={subsystemId} onSwitch={setSubsystemId}>
      <Suspense fallback={<Loading />}>
        {Subsystem && <Subsystem />}
      </Suspense>
      <NcrisPanel subsystemId={subsystemId} />
    </Shell>
  );
}

function Loading() {
  return (
    <div style={{
      minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 12, color: '#8A857E', fontSize: 13,
    }}>
      <Loader2 className="spin" size={24} />
      <div>Loading subsystem…</div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
