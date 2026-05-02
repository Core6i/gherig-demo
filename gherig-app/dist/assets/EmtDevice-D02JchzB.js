import{r as o,j as e}from"./index-Bu1-gaC-.js";const X={emtA:{name:"Akosua Mensah",role:"EMT-A · Lead",council:"NAS-EMT-2021-1847",initials:"AM"},emtB:{name:"Kwame Sarpong",role:"EMT-B · Driver",council:"NAS-EMT-2022-2109",initials:"KS"}},C={plate:"AMB-GR-002",type:"BLS",station:"NAS Tema East",region:"Greater Accra"},D=[{id:"awaiting",label:"Awaiting",short:"WAIT",color:"ink"},{id:"wheels_rolling",label:"Wheels Rolling",short:"GO",color:"amber"},{id:"on_scene",label:"On Scene",short:"SCENE",color:"copper"},{id:"patient_loaded",label:"Patient Loaded",short:"LOADED",color:"amber"},{id:"arrived_dest",label:"Arrived Dest.",short:"ARRIVED",color:"emerald"},{id:"cleared",label:"Cleared",short:"CLEAR",color:"ink"}],Q=[{id:"iv_access",label:"IV Access",icon:"💉",category:"access"},{id:"iv_fluid_500",label:"NS 500 mL bolus",icon:"💧",category:"fluid"},{id:"iv_fluid_1l",label:"NS 1 L bolus",icon:"💧",category:"fluid"},{id:"oxygen_nc",label:"O₂ Nasal Cannula",icon:"🫁",category:"oxygen"},{id:"oxygen_mask",label:"O₂ Mask",icon:"🫁",category:"oxygen"},{id:"oxygen_nrb",label:"O₂ Non-Rebreather",icon:"🫁",category:"oxygen"},{id:"splint",label:"Splint Applied",icon:"🦴",category:"trauma"},{id:"c_collar",label:"C-Collar Applied",icon:"🦴",category:"trauma"},{id:"pressure_dr",label:"Pressure Dressing",icon:"🩹",category:"trauma"},{id:"tourniquet",label:"Tourniquet",icon:"🩹",category:"trauma"},{id:"drug_morphine",label:"Morphine 5 mg IV",icon:"💊",category:"drug"},{id:"drug_tramadol",label:"Tramadol 100 mg IV",icon:"💊",category:"drug"},{id:"drug_adrenal",label:"Adrenaline 1 mg IV",icon:"💊",category:"drug"},{id:"drug_atropine",label:"Atropine 0.5 mg IV",icon:"💊",category:"drug"},{id:"drug_dextrose",label:"Dextrose 50% 50 mL",icon:"💊",category:"drug"},{id:"cpr",label:"CPR Started",icon:"❤️",category:"cpr"},{id:"defib",label:"Defib Shock",icon:"⚡",category:"cpr"},{id:"intubation",label:"Intubation",icon:"🫁",category:"airway"}],be=[{id:"access",label:"Access"},{id:"fluid",label:"Fluids"},{id:"oxygen",label:"Oxygen"},{id:"trauma",label:"Trauma"},{id:"drug",label:"Drugs"},{id:"cpr",label:"CPR"},{id:"airway",label:"Airway"}],B={normal:0,borderline:1,abnormal:2,critical:3},M=(t,a)=>a==="Neonate"?"neonate":a==="Paediatric"||t!=null&&t<13?t==null?"child":t<1?"infant":t<5?"child_under5":"child":t!=null&&t<18?"adolescent":t!=null&&t>=65?"elderly":"adult",w={sbp:{neonate:{critical:[null,50],abnormal:[50,60],borderline:[60,70],normal:[70,90]},infant:{critical:[null,60],abnormal:[60,70],borderline:[70,80],normal:[80,110]},child_under5:{critical:[null,70],abnormal:[70,80],borderline:[80,90],normal:[90,115]},child:{critical:[null,80],abnormal:[80,90],borderline:[90,100],normal:[100,120]},adolescent:{critical:[null,85],abnormal:[85,95],borderline:[95,105],normal:[105,130]},adult:{critical:[null,90],abnormal:[90,100],borderline:[100,110],normal:[110,140]},elderly:{critical:[null,90],abnormal:[90,105],borderline:[105,115],normal:[115,150]},highCritical:180,highAbnormal:160,highBorderline:140},hr:{neonate:{critical:[null,90],abnormal:[90,100],borderline:[100,110],normal:[110,160],borderlineHi:160,abnormalHi:180,criticalHi:200},infant:{critical:[null,80],abnormal:[80,90],borderline:[90,100],normal:[100,150],borderlineHi:150,abnormalHi:170,criticalHi:190},child_under5:{critical:[null,60],abnormal:[60,70],borderline:[70,80],normal:[80,130],borderlineHi:130,abnormalHi:150,criticalHi:170},child:{critical:[null,50],abnormal:[50,60],borderline:[60,70],normal:[70,110],borderlineHi:110,abnormalHi:130,criticalHi:150},adolescent:{critical:[null,45],abnormal:[45,50],borderline:[50,60],normal:[60,100],borderlineHi:100,abnormalHi:120,criticalHi:140},adult:{critical:[null,40],abnormal:[40,50],borderline:[50,60],normal:[60,100],borderlineHi:100,abnormalHi:120,criticalHi:140},elderly:{critical:[null,40],abnormal:[40,50],borderline:[50,55],normal:[55,95],borderlineHi:95,abnormalHi:115,criticalHi:130}},rr:{neonate:{critical:[null,25],abnormal:[25,30],borderline:[30,35],normal:[35,60],borderlineHi:60,abnormalHi:70,criticalHi:80},infant:{critical:[null,22],abnormal:[22,28],borderline:[28,32],normal:[32,50],borderlineHi:50,abnormalHi:60,criticalHi:70},child_under5:{critical:[null,18],abnormal:[18,22],borderline:[22,26],normal:[26,40],borderlineHi:40,abnormalHi:50,criticalHi:60},child:{critical:[null,14],abnormal:[14,16],borderline:[16,18],normal:[18,30],borderlineHi:30,abnormalHi:40,criticalHi:50},adolescent:{critical:[null,10],abnormal:[10,12],borderline:[12,14],normal:[14,22],borderlineHi:22,abnormalHi:26,criticalHi:30},adult:{critical:[null,8],abnormal:[8,10],borderline:[10,12],normal:[12,20],borderlineHi:20,abnormalHi:25,criticalHi:30},elderly:{critical:[null,8],abnormal:[8,10],borderline:[10,12],normal:[12,20],borderlineHi:20,abnormalHi:25,criticalHi:30}},spo2:{all:{critical:90,abnormal:92,borderline:94},neonate:{critical:88,abnormal:90,borderline:93}},gcs:{critical:8,abnormal:12,borderline:14}},Z=(t,a)=>t==null||isNaN(t)?null:a.critical&&a.critical[1]!=null&&t<a.critical[1]?"critical":a.abnormal&&t>=a.abnormal[0]&&t<a.abnormal[1]?"abnormal":a.borderline&&t>=a.borderline[0]&&t<a.borderline[1]?"borderline":a.normal&&t>=a.normal[0]&&t<=a.normal[1]?"normal":a.criticalHi!=null&&t>=a.criticalHi?"critical":a.abnormalHi!=null&&t>=a.abnormalHi?"abnormal":a.borderlineHi!=null&&t>a.borderlineHi?"borderline":"normal",ve=(t,a,i)=>{if(t==null||isNaN(t))return null;const l=M(a,i),n=w.sbp[l];let c="normal";return t<n.critical[1]?c="critical":t<n.abnormal[1]?c="abnormal":t<n.borderline[1]?c="borderline":t>=w.sbp.highCritical?c="critical":t>=w.sbp.highAbnormal?c="abnormal":t>=w.sbp.highBorderline&&(c="borderline"),{tier:c,score:B[c]}},ue=(t,a,i)=>{if(t==null||isNaN(t))return null;const l=M(a,i),n=Z(t,w.hr[l])||"normal";return{tier:n,score:B[n]}},ye=(t,a,i)=>{if(t==null||isNaN(t))return null;const l=M(a,i),n=Z(t,w.rr[l])||"normal";return{tier:n,score:B[n]}},Ne=(t,a)=>{if(t==null||isNaN(t))return null;const i=a==="Neonate"?w.spo2.neonate:w.spo2.all;let l="normal";return t<i.critical?l="critical":t<i.abnormal?l="abnormal":t<i.borderline&&(l="borderline"),{tier:l,score:B[l]}},je=t=>{if(t==null||isNaN(t))return null;let a="normal";return t<=w.gcs.critical?a="critical":t<=w.gcs.abnormal?a="abnormal":t<=w.gcs.borderline&&(a="borderline"),{tier:a,score:B[a]}},L=(t,a,i)=>{const l={sbp:ve(parseFloat(t.sbp),a,i),hr:ue(parseFloat(t.hr),a,i),rr:ye(parseFloat(t.rr),a,i),spo2:Ne(parseFloat(t.spo2),i),gcs:je(parseFloat(t.gcs))};let n=0,c=0;return Object.values(l).forEach(s=>{s&&(n+=s.score,s.tier==="critical"&&c++)}),{perVital:l,totalScore:n,criticalCount:c}},we=`
:root {
  --emt-bg:#000000;
  --emt-bg-1:#0A0A0A;
  --emt-bg-2:#141414;
  --emt-bg-3:#1F1F1F;
  --emt-line:#2C2C2C;
  --emt-line-strong:#3A3A3A;

  --emt-text:#FFFFFF;
  --emt-text-2:#D4D4D4;
  --emt-text-3:#9A9A9A;
  --emt-text-4:#6E6E6E;

  --emt-action:#E63946;       /* Bright crimson — primary action */
  --emt-action-hi:#FF4D5C;
  --emt-action-pale:#3A1216;

  --emt-go:#10B981;            /* Deep emerald — confirm / wheels-rolling */
  --emt-go-hi:#34D399;
  --emt-go-pale:#0A2E22;

  --emt-warn:#F5B800;          /* Neon yellow — caution / pending */
  --emt-warn-hi:#FFD03A;
  --emt-warn-pale:#3D2D04;

  --emt-info:#3B82F6;          /* Sky blue — info / neutral */
  --emt-info-pale:#0E2447;

  --emt-copper:#D9803A;        /* Carries copper from system — softer here */
  --emt-copper-pale:#3A1F0C;

  --tier-normal:#10B981;
  --tier-borderline:#F5B800;
  --tier-abnormal:#D9803A;
  --tier-critical:#E63946;

  --emt-radius:14px;
  --emt-radius-lg:20px;
  --emt-radius-xl:28px;
  --emt-shadow:0 6px 20px rgba(0,0,0,0.5);
  --emt-shadow-lg:0 12px 32px rgba(0,0,0,0.6);

  --emt-display:'Fraunces','Times New Roman',serif;
  --emt-body:'Inter Tight',-apple-system,system-ui,sans-serif;
  --emt-mono:'JetBrains Mono','SF Mono',Menlo,monospace;
}

.emt *, .emt *::before, .emt *::after { box-sizing:border-box; margin:0; padding:0; -webkit-tap-highlight-color:transparent; }
.emt {
  font-family:var(--emt-body);
  background:var(--emt-bg);
  color:var(--emt-text);
  font-size:16px;
  line-height:1.5;
  -webkit-font-smoothing:antialiased;
  min-height:100vh;
  user-select:none;
  -webkit-user-select:none;
  touch-action:manipulation;
}
.emt button { font-family:inherit; cursor:pointer; border:none; background:none; color:inherit; font-size:inherit; }
.emt button:disabled { opacity:0.35; }
.emt input, .emt select, .emt textarea { font-family:inherit; color:inherit; font-size:inherit; }
.emt ::-webkit-scrollbar { width:6px; height:6px; }
.emt ::-webkit-scrollbar-track { background:transparent; }
.emt ::-webkit-scrollbar-thumb { background:var(--emt-line-strong); border-radius:3px; }

/* ─── SHELL ─── */
.emt-shell { min-height:100vh; display:flex; flex-direction:column; max-width:1100px; margin:0 auto; }

/* ─── TOPBAR ─── */
.emt-topbar {
  position:sticky; top:0; z-index:50;
  height:64px; padding:0 18px;
  background:var(--emt-bg-1);
  border-bottom:1px solid var(--emt-line);
  display:flex; align-items:center; gap:14px;
}
.emt-topbar-mark {
  width:40px; height:40px; border-radius:10px;
  background:var(--emt-action); color:#fff;
  display:flex; align-items:center; justify-content:center;
  font-family:var(--emt-display); font-weight:700; font-size:20px;
  flex-shrink:0;
}
.emt-topbar-id { flex:1; min-width:0; }
.emt-topbar-plate { font-family:var(--emt-mono); font-size:15px; font-weight:700; color:var(--emt-text); letter-spacing:0.04em; }
.emt-topbar-meta { font-family:var(--emt-mono); font-size:11px; color:var(--emt-text-3); margin-top:2px; letter-spacing:0.06em; }

.emt-status-cluster { display:flex; align-items:center; gap:10px; flex-shrink:0; }
.emt-pill {
  display:inline-flex; align-items:center; gap:6px;
  padding:7px 12px; border-radius:18px;
  font-family:var(--emt-mono); font-size:11px; font-weight:700;
  letter-spacing:0.1em; text-transform:uppercase;
  background:var(--emt-bg-3); color:var(--emt-text-2);
  border:1px solid var(--emt-line);
}
.emt-pill.broadcast {
  background:var(--emt-go-pale); color:var(--emt-go); border-color:var(--emt-go);
}
.emt-pill.broadcast .dot { background:var(--emt-go); animation:emt-pulse 1.4s ease-in-out infinite; }
.emt-pill .dot { width:8px; height:8px; border-radius:50%; background:var(--emt-text-3); flex-shrink:0; }
@keyframes emt-pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }

.emt-clock { font-family:var(--emt-mono); font-size:13px; font-weight:600; color:var(--emt-text-2); flex-shrink:0; }

/* ─── BODY ─── */
.emt-body { flex:1; padding:18px; padding-bottom:90px; }
.emt-bottom-bar {
  position:fixed; bottom:0; left:0; right:0; z-index:40;
  max-width:1100px; margin:0 auto;
  background:var(--emt-bg-1); border-top:1px solid var(--emt-line);
  padding:12px 18px; display:flex; gap:10px;
}
.emt-tab {
  flex:1; height:64px;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:3px; border-radius:12px;
  font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase;
  color:var(--emt-text-3); background:transparent;
  border:1px solid transparent;
  transition:all .15s;
}
.emt-tab .icon { font-size:22px; line-height:1; }
.emt-tab:active { background:var(--emt-bg-3); }
.emt-tab.active { color:var(--emt-action); background:var(--emt-action-pale); border-color:var(--emt-action); }
.emt-tab .badge {
  position:absolute; top:8px; right:18%;
  min-width:18px; height:18px; border-radius:9px;
  background:var(--emt-action); color:#fff;
  font-family:var(--emt-mono); font-size:10px; font-weight:700;
  display:flex; align-items:center; justify-content:center;
  padding:0 5px;
}

/* ─── PAGE TITLES (bigger than desktop) ─── */
.emt-page-head { margin-bottom:18px; }
.emt-eyebrow { font-family:var(--emt-mono); font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:var(--emt-copper); margin-bottom:6px; }
.emt-title { font-family:var(--emt-display); font-size:32px; font-weight:500; letter-spacing:-0.025em; line-height:1.05; }
.emt-sub { font-size:14px; color:var(--emt-text-3); margin-top:6px; line-height:1.5; }

/* ─── BIG BUTTONS (the spine of this device) ─── */
.btn-big {
  display:flex; align-items:center; justify-content:center; gap:10px;
  width:100%; min-height:72px; padding:0 20px;
  background:var(--emt-bg-2); color:var(--emt-text);
  border:2px solid var(--emt-line);
  border-radius:var(--emt-radius);
  font-size:18px; font-weight:600;
  transition:transform .08s, background .12s, border-color .12s;
}
.btn-big:active { transform:scale(0.98); }
.btn-big:disabled { opacity:0.3; }
.btn-big.go { background:var(--emt-go); color:#fff; border-color:var(--emt-go); box-shadow:0 4px 14px rgba(16,185,129,0.35); }
.btn-big.action { background:var(--emt-action); color:#fff; border-color:var(--emt-action); box-shadow:0 4px 14px rgba(230,57,70,0.35); }
.btn-big.warn { background:var(--emt-warn); color:#000; border-color:var(--emt-warn); box-shadow:0 4px 14px rgba(245,184,0,0.35); }
.btn-big.info { background:var(--emt-info); color:#fff; border-color:var(--emt-info); }
.btn-big.copper { background:var(--emt-copper); color:#fff; border-color:var(--emt-copper); }
.btn-big.outline { background:transparent; border-color:var(--emt-line-strong); }

.btn-mid {
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  min-height:48px; padding:0 18px;
  background:var(--emt-bg-2); color:var(--emt-text);
  border:1.5px solid var(--emt-line);
  border-radius:10px;
  font-size:14px; font-weight:600;
  transition:transform .08s;
}
.btn-mid:active { transform:scale(0.97); }
.btn-mid.action { background:var(--emt-action); color:#fff; border-color:var(--emt-action); }
.btn-mid.go { background:var(--emt-go); color:#fff; border-color:var(--emt-go); }
.btn-mid.copper { background:var(--emt-copper); color:#fff; border-color:var(--emt-copper); }
.btn-mid.outline { background:transparent; }

/* ─── CARDS ─── */
.card {
  background:var(--emt-bg-1);
  border:1px solid var(--emt-line);
  border-radius:var(--emt-radius-lg);
  padding:18px;
  margin-bottom:16px;
}
.card.lift { box-shadow:var(--emt-shadow); }
.card.glow-action { border-color:var(--emt-action); box-shadow:0 0 0 1px var(--emt-action), var(--emt-shadow-lg); }
.card.glow-go { border-color:var(--emt-go); }
.card.glow-warn { border-color:var(--emt-warn); }

.card-head {
  display:flex; align-items:center; justify-content:space-between;
  padding-bottom:12px; margin-bottom:14px;
  border-bottom:1px solid var(--emt-line);
}
.card-title { font-family:var(--emt-display); font-size:18px; font-weight:600; letter-spacing:-0.015em; }
.card-meta { font-family:var(--emt-mono); font-size:11px; color:var(--emt-text-3); }

/* ─── LOGIN ─── */
.emt-login {
  min-height:100vh;
  background:radial-gradient(ellipse at 50% 30%, #1A0A0C 0%, #000 70%);
  display:flex; align-items:center; justify-content:center;
  padding:24px;
}
.emt-login-card {
  width:100%; max-width:480px;
  background:var(--emt-bg-1);
  border:1px solid var(--emt-line);
  border-radius:var(--emt-radius-xl);
  padding:36px 28px;
  box-shadow:var(--emt-shadow-lg);
}
.emt-login-mark {
  width:80px; height:80px; margin:0 auto 18px;
  background:var(--emt-action); color:#fff;
  border-radius:22px;
  display:flex; align-items:center; justify-content:center;
  font-family:var(--emt-display); font-weight:700; font-size:36px;
  box-shadow:0 8px 20px rgba(230,57,70,0.45);
}
.emt-login-title {
  text-align:center;
  font-family:var(--emt-display); font-size:30px; font-weight:500;
  letter-spacing:-0.025em; margin-bottom:6px;
}
.emt-login-sub {
  text-align:center; font-size:13px; color:var(--emt-text-3);
  margin-bottom:28px;
  font-family:var(--emt-mono); letter-spacing:0.06em;
}

.emt-field { margin-bottom:16px; }
.emt-label {
  display:block;
  font-family:var(--emt-mono); font-size:11px; font-weight:700;
  letter-spacing:0.16em; text-transform:uppercase;
  color:var(--emt-text-3);
  margin-bottom:8px;
}
.emt-input, .emt-select, .emt-textarea {
  width:100%; min-height:56px; padding:0 18px;
  background:var(--emt-bg-2);
  border:1.5px solid var(--emt-line);
  border-radius:12px;
  font-size:18px; color:var(--emt-text);
  outline:none;
  transition:border-color .12s;
}
.emt-textarea { padding:14px 18px; min-height:90px; resize:none; line-height:1.5; }
.emt-input:focus, .emt-select:focus, .emt-textarea:focus { border-color:var(--emt-action); }
.emt-select { appearance:none; background-image:linear-gradient(45deg, transparent 50%, var(--emt-text-3) 50%), linear-gradient(135deg, var(--emt-text-3) 50%, transparent 50%); background-position:calc(100% - 22px) center, calc(100% - 16px) center; background-size:6px 6px; background-repeat:no-repeat; padding-right:40px; }

.crew-pills { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.crew-pill {
  padding:14px;
  background:var(--emt-bg-2);
  border:2px solid var(--emt-line);
  border-radius:12px;
  text-align:left;
  transition:all .12s;
}
.crew-pill:active { transform:scale(0.98); }
.crew-pill.active { border-color:var(--emt-action); background:var(--emt-action-pale); }
.crew-pill .pill-name { font-size:15px; font-weight:600; color:var(--emt-text); }
.crew-pill .pill-role { font-family:var(--emt-mono); font-size:10px; color:var(--emt-text-3); margin-top:3px; letter-spacing:0.06em; }

/* ─── JOB INBOX ─── */
.job-card {
  background:var(--emt-bg-1);
  border:2px solid var(--emt-line);
  border-radius:var(--emt-radius-lg);
  padding:20px;
  margin-bottom:14px;
  position:relative; overflow:hidden;
}
.job-card.priority-critical { border-color:var(--emt-action); }
.job-card.priority-critical::before {
  content:''; position:absolute; left:0; top:0; bottom:0; width:6px;
  background:var(--emt-action);
}
.job-card.priority-high { border-color:var(--emt-warn); }
.job-card.priority-high::before {
  content:''; position:absolute; left:0; top:0; bottom:0; width:6px;
  background:var(--emt-warn);
}

.job-priority-row { display:flex; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap; }
.job-priority-pill {
  display:inline-flex; padding:5px 12px;
  border-radius:14px;
  font-family:var(--emt-mono); font-size:11px; font-weight:800;
  letter-spacing:0.1em; text-transform:uppercase;
}
.job-priority-pill.critical { background:var(--emt-action); color:#fff; }
.job-priority-pill.high { background:var(--emt-warn); color:#000; }
.job-priority-pill.routine { background:var(--emt-go); color:#fff; }
.job-id { font-family:var(--emt-mono); font-size:12px; color:var(--emt-text-3); margin-left:auto; }

.job-condition { font-family:var(--emt-display); font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.15; margin-bottom:4px; }
.job-pat { font-size:14px; color:var(--emt-text-3); margin-bottom:14px; }

.route-block {
  background:var(--emt-bg-2);
  border-radius:12px; padding:14px;
  margin-bottom:14px;
}
.route-row { display:flex; align-items:center; gap:12px; padding:6px 0; }
.route-icon {
  width:28px; height:28px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  font-size:12px; font-weight:700;
  flex-shrink:0;
}
.route-icon.from { background:var(--emt-action); color:#fff; }
.route-icon.to { background:var(--emt-go); color:#fff; }
.route-line {
  width:28px; height:24px;
  border-left:2px dashed var(--emt-line-strong);
  margin-left:13px;
}
.route-label { flex:1; min-width:0; }
.route-label .lbl { font-family:var(--emt-mono); font-size:10px; color:var(--emt-text-3); letter-spacing:0.1em; text-transform:uppercase; margin-bottom:2px; }
.route-label .val { font-size:15px; font-weight:600; line-height:1.25; }
.route-label .meta { font-family:var(--emt-mono); font-size:11px; color:var(--emt-text-3); margin-top:2px; }

.job-stats { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:14px; }
.job-stat {
  background:var(--emt-bg-2);
  border-radius:10px; padding:10px 12px;
  text-align:center;
}
.job-stat .v { font-family:var(--emt-display); font-size:20px; font-weight:600; color:var(--emt-text); line-height:1; }
.job-stat .l { font-family:var(--emt-mono); font-size:9.5px; color:var(--emt-text-3); letter-spacing:0.1em; text-transform:uppercase; margin-top:4px; }

.job-summary {
  background:var(--emt-bg-3);
  border-radius:10px; padding:12px;
  font-size:14px; color:var(--emt-text-2); line-height:1.5;
  margin-bottom:14px;
}

.job-actions { display:flex; gap:10px; }

/* ─── ACTIVE JOB / LIFECYCLE STEPPER ─── */
.lifecycle-card { padding:0; overflow:hidden; }
.lifecycle-track {
  display:flex; align-items:stretch;
  background:var(--emt-bg-2);
  padding:14px 12px;
  overflow-x:auto;
  gap:6px;
}
.lifecycle-track::-webkit-scrollbar { display:none; }
.lc-step {
  flex:1; min-width:90px;
  display:flex; flex-direction:column; align-items:center; gap:6px;
  padding:8px 6px;
  border-radius:10px;
  text-align:center;
}
.lc-dot {
  width:34px; height:34px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  font-family:var(--emt-mono); font-size:14px; font-weight:700;
  flex-shrink:0;
  border:2px solid var(--emt-line);
  background:var(--emt-bg-1); color:var(--emt-text-3);
}
.lc-dot.done { background:var(--emt-go); color:#fff; border-color:var(--emt-go); }
.lc-dot.current { background:var(--emt-action); color:#fff; border-color:var(--emt-action); box-shadow:0 0 0 4px var(--emt-action-pale); }
.lc-label { font-family:var(--emt-mono); font-size:10px; font-weight:600; letter-spacing:0.06em; line-height:1.15; }
.lc-step.done .lc-label { color:var(--emt-go); }
.lc-step.current .lc-label { color:var(--emt-action); }
.lc-step.pending .lc-label { color:var(--emt-text-4); }
.lc-ts { font-family:var(--emt-mono); font-size:9.5px; color:var(--emt-text-4); margin-top:1px; }

.lifecycle-action { padding:18px; }
.next-action-prompt { font-family:var(--emt-mono); font-size:11px; color:var(--emt-text-3); letter-spacing:0.14em; text-transform:uppercase; margin-bottom:10px; text-align:center; }

/* ─── VITALS ─── */
.vitals-grid { display:grid; grid-template-columns:1fr 1fr 1fr 1fr 1fr; gap:8px; margin-bottom:18px; }
@media (max-width:780px) { .vitals-grid { grid-template-columns:1fr 1fr; } }
.vital-tile {
  background:var(--emt-bg-2);
  border:2px solid var(--emt-line);
  border-radius:14px;
  padding:12px;
  text-align:center;
  min-height:100px;
  display:flex; flex-direction:column; justify-content:center; align-items:center;
}
.vital-tile.tier-normal { border-color:var(--tier-normal); background:rgba(16,185,129,0.08); }
.vital-tile.tier-borderline { border-color:var(--tier-borderline); background:rgba(245,184,0,0.08); }
.vital-tile.tier-abnormal { border-color:var(--tier-abnormal); background:rgba(217,128,58,0.08); }
.vital-tile.tier-critical { border-color:var(--tier-critical); background:rgba(230,57,70,0.12); }
.vital-name { font-family:var(--emt-mono); font-size:10px; font-weight:700; color:var(--emt-text-3); letter-spacing:0.12em; text-transform:uppercase; }
.vital-tile.tier-normal .vital-name { color:var(--tier-normal); }
.vital-tile.tier-borderline .vital-name { color:var(--tier-borderline); }
.vital-tile.tier-abnormal .vital-name { color:var(--tier-abnormal); }
.vital-tile.tier-critical .vital-name { color:var(--tier-critical); }
.vital-val { font-family:var(--emt-display); font-size:30px; font-weight:600; line-height:1; margin-top:6px; letter-spacing:-0.02em; }
.vital-tile.tier-normal .vital-val { color:var(--tier-normal); }
.vital-tile.tier-borderline .vital-val { color:var(--tier-borderline); }
.vital-tile.tier-abnormal .vital-val { color:var(--tier-abnormal); }
.vital-tile.tier-critical .vital-val { color:var(--tier-critical); }
.vital-unit { font-family:var(--emt-mono); font-size:10px; color:var(--emt-text-3); margin-top:4px; }
.vital-empty { color:var(--emt-text-4); font-family:var(--emt-display); font-size:30px; }

.vitals-history { padding:0; overflow:hidden; }
.vitals-row {
  display:grid;
  grid-template-columns:80px 1fr 1fr 1fr 1fr 1fr;
  gap:8px;
  padding:12px 14px;
  border-bottom:1px solid var(--emt-line);
  font-family:var(--emt-mono); font-size:14px;
  align-items:center;
}
.vitals-row:last-child { border-bottom:none; }
.vitals-row.head { background:var(--emt-bg-3); font-size:10px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:var(--emt-text-3); padding:10px 14px; }
.vitals-row .ts { color:var(--emt-text-3); }
.vitals-row .v { font-weight:700; text-align:center; }
.vitals-row .v.t-normal { color:var(--tier-normal); }
.vitals-row .v.t-borderline { color:var(--tier-borderline); }
.vitals-row .v.t-abnormal { color:var(--tier-abnormal); }
.vitals-row .v.t-critical { color:var(--tier-critical); }

/* ─── INTERVENTIONS ─── */
.interv-cat-tabs { display:flex; gap:8px; overflow-x:auto; padding-bottom:4px; margin-bottom:14px; }
.interv-cat-tabs::-webkit-scrollbar { display:none; }
.interv-cat-tab {
  flex-shrink:0;
  padding:10px 18px; min-height:42px;
  border-radius:21px;
  background:var(--emt-bg-2); border:1.5px solid var(--emt-line);
  font-size:14px; font-weight:600;
  color:var(--emt-text-2);
  white-space:nowrap;
}
.interv-cat-tab:active { transform:scale(0.96); }
.interv-cat-tab.active { background:var(--emt-action); color:#fff; border-color:var(--emt-action); }

.interv-grid { display:grid; grid-template-columns:repeat(2, 1fr); gap:10px; }
.interv-tile {
  background:var(--emt-bg-2);
  border:2px solid var(--emt-line);
  border-radius:14px;
  padding:14px;
  display:flex; align-items:center; gap:12px;
  min-height:64px;
  text-align:left;
  transition:all .12s;
}
.interv-tile:active { transform:scale(0.98); background:var(--emt-bg-3); }
.interv-tile .icon { font-size:22px; flex-shrink:0; }
.interv-tile .label { font-size:14px; font-weight:600; line-height:1.2; }

.interv-log {
  display:flex; flex-direction:column; padding:0;
}
.interv-entry {
  display:grid; grid-template-columns:80px 1fr;
  gap:14px;
  padding:14px 16px;
  border-bottom:1px solid var(--emt-line);
  align-items:center;
}
.interv-entry:last-child { border-bottom:none; }
.interv-entry .time { font-family:var(--emt-mono); font-size:12px; color:var(--emt-text-3); }
.interv-entry .what { font-size:14px; font-weight:500; }

/* ─── HANDOFF ─── */
.handoff-summary {
  background:var(--emt-bg-2);
  border-radius:14px; padding:18px;
  margin-bottom:14px;
}
.handoff-row { display:flex; justify-content:space-between; padding:6px 0; font-size:14px; gap:12px; }
.handoff-row .k { font-family:var(--emt-mono); font-size:11px; color:var(--emt-text-3); letter-spacing:0.1em; text-transform:uppercase; flex-shrink:0; }
.handoff-row .v { font-weight:600; text-align:right; }

.signature-pad {
  background:var(--emt-bg-2);
  border:2px dashed var(--emt-line-strong);
  border-radius:14px;
  padding:24px;
  text-align:center;
  margin-bottom:14px;
}
.signature-pad.signed {
  border-style:solid;
  border-color:var(--emt-go);
  background:rgba(16,185,129,0.08);
}
.signature-pad .sig-name { font-family:var(--emt-display); font-size:20px; font-style:italic; color:var(--emt-go); margin-bottom:4px; }
.signature-pad .sig-meta { font-family:var(--emt-mono); font-size:11px; color:var(--emt-text-3); }

/* ─── TOAST ─── */
.emt-toast-host {
  position:fixed; bottom:100px; left:50%; transform:translateX(-50%);
  z-index:200;
  display:flex; flex-direction:column; gap:8px;
  pointer-events:none;
  width:calc(100% - 32px); max-width:520px;
}
.emt-toast {
  background:var(--emt-bg-2);
  border:1.5px solid var(--emt-line);
  border-left-width:4px;
  border-radius:12px;
  padding:14px 18px;
  font-size:15px;
  font-weight:600;
  color:var(--emt-text);
  box-shadow:var(--emt-shadow);
  pointer-events:auto;
  animation:emt-toast-in .25s ease;
}
.emt-toast.success { border-left-color:var(--emt-go); }
.emt-toast.warn { border-left-color:var(--emt-warn); }
.emt-toast.error { border-left-color:var(--emt-action); }
.emt-toast.info { border-left-color:var(--emt-info); }
@keyframes emt-toast-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }

/* ─── MODAL ─── */
.emt-modal-overlay {
  position:fixed; inset:0; z-index:300;
  background:rgba(0,0,0,0.7);
  backdrop-filter:blur(8px);
  display:flex; align-items:flex-end; justify-content:center;
  animation:emt-fade .18s ease;
}
@media (min-width:780px) { .emt-modal-overlay { align-items:center; padding:24px; } }
@keyframes emt-fade { from { opacity:0; } to { opacity:1; } }
.emt-modal {
  width:100%; max-width:540px;
  max-height:92vh; overflow:hidden;
  background:var(--emt-bg-1);
  border:1px solid var(--emt-line);
  border-top-left-radius:24px;
  border-top-right-radius:24px;
  display:flex; flex-direction:column;
  animation:emt-slide-up .25s cubic-bezier(.34,1.4,.64,1);
}
@media (min-width:780px) { .emt-modal { border-radius:24px; } }
@keyframes emt-slide-up { from { transform:translateY(40px); } to { transform:translateY(0); } }
.emt-modal-grip {
  width:48px; height:5px; background:var(--emt-line-strong); border-radius:3px;
  margin:10px auto 0; flex-shrink:0;
}
.emt-modal-head {
  padding:14px 20px 16px;
  border-bottom:1px solid var(--emt-line);
}
.emt-modal-title { font-family:var(--emt-display); font-size:22px; font-weight:600; letter-spacing:-0.02em; }
.emt-modal-sub { font-family:var(--emt-mono); font-size:11px; color:var(--emt-text-3); margin-top:4px; }
.emt-modal-body { padding:20px; overflow-y:auto; flex:1; }
.emt-modal-foot { padding:14px 20px 18px; border-top:1px solid var(--emt-line); display:flex; gap:10px; }

.numpad { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-top:12px; }
.numpad-btn {
  min-height:64px;
  background:var(--emt-bg-2);
  border:1.5px solid var(--emt-line);
  border-radius:12px;
  font-family:var(--emt-mono); font-size:24px; font-weight:700;
  color:var(--emt-text);
}
.numpad-btn:active { background:var(--emt-bg-3); transform:scale(0.97); }
.numpad-btn.action { background:var(--emt-action); color:#fff; border-color:var(--emt-action); }
.numpad-btn.go { background:var(--emt-go); color:#fff; border-color:var(--emt-go); }

.bp-input-row { display:flex; align-items:center; gap:10px; }
.bp-input-row .emt-input { text-align:center; font-family:var(--emt-mono); font-size:28px; font-weight:700; }
.bp-input-row .sep { font-family:var(--emt-display); font-size:32px; color:var(--emt-text-3); }

/* ─── EMPTY STATES ─── */
.emt-empty {
  text-align:center;
  padding:60px 20px;
  color:var(--emt-text-3);
}
.emt-empty .em-icon { font-size:48px; margin-bottom:14px; opacity:0.4; }
.emt-empty .em-title { font-family:var(--emt-display); font-size:22px; font-weight:500; color:var(--emt-text-2); margin-bottom:6px; }
.emt-empty .em-sub { font-size:13px; color:var(--emt-text-4); }
`,$=t=>{const a=new Date;return a.setMinutes(a.getMinutes()-t),a},E=t=>t?t.toLocaleTimeString("en-GH",{hour:"2-digit",minute:"2-digit"}):"—",G=t=>t?t.toLocaleTimeString("en-GH",{hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—",ee=t=>{if(!t)return"—";const a=Math.floor((Date.now()-t.getTime())/6e4);return a<1?"just now":a<60?a+"m ago":Math.floor(a/60)+"h ago"},ke=t=>D.find(a=>a.id===t),te=t=>D.findIndex(a=>a.id===t),Se=t=>{const a=te(t);return a>=0&&a<D.length-1?D[a+1].id:null},Ae=()=>({id:"DSP-2026-3041",priority:"critical",type:"NECC bed-search route",neccRefId:"REF-2026-2041",condition:"Acute coronary syndrome",patientInitials:"KA",patientAge:59,patientSex:"M",patientCategory:"Adult",stability:"Critical",fromFacility:"Tema General Hospital",fromAddress:"Hospital Rd, Tema, Greater Accra",toFacility:"Korle-Bu Teaching Hospital",toAddress:"Guggisberg Ave, Accra, Greater Accra",toUnit:"Cardiac Cath Lab · Bay 2",distanceKm:26,etaInitial:28,initialVitals:{sbp:222,dbp:174,hr:135,rr:36,spo2:89,gcs:14},summary:"STEMI confirmed at Tema. ECG: ST elevation V2-V4. Troponin pending. GTN started, dual antiplatelet given. Pre-alerted KBTH cath lab.",receivedAt:$(2)}),Y=t=>[{ts:$(2),source:"pre-dispatch",sbp:t.sbp,dbp:t.dbp,hr:t.hr,rr:t.rr,spo2:t.spo2,gcs:t.gcs}],Ce=()=>{if(typeof document>"u"||document.getElementById("emt-fonts"))return;const t=document.createElement("link");t.id="emt-fonts",t.rel="stylesheet",t.href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter+Tight:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap",document.head.appendChild(t)};function _e(){const[t,a]=o.useState(!1),[i,l]=o.useState("emtA"),n=X[i],[c,s]=o.useState(Ae),[d,b]=o.useState(!1),[g,p]=o.useState("awaiting"),[u,f]=o.useState({awaiting:new Date,wheels_rolling:null,on_scene:null,patient_loaded:null,arrived_dest:null,cleared:null}),[h,z]=o.useState(()=>Y(c.initialVitals)),[H,N]=o.useState(null),[x,S]=o.useState([]),[T,k]=o.useState("access"),[m,F]=o.useState(!1),[_,V]=o.useState(!1),[O,P]=o.useState(!1),[ae,ie]=o.useState(null),[W,re]=o.useState(0),[I,R]=o.useState("job"),[ne,J]=o.useState([]),[le,se]=o.useState(new Date),[,oe]=o.useState(0);o.useEffect(()=>{Ce()},[]),o.useEffect(()=>{if(typeof document>"u"||document.getElementById("emt-styles"))return;const r=document.createElement("style");r.id="emt-styles",r.textContent=we,document.head.appendChild(r)},[]);const y=o.useCallback((r,v="success")=>{const j=Math.random().toString(36).slice(2);J(A=>[...A,{id:j,text:r,type:v}]),setTimeout(()=>J(A=>A.filter(he=>he.id!==j)),3e3)},[]),ce=()=>{a(!0),y("Welcome, "+n.name.split(" ")[0]+". Vehicle ready.","success")},de=()=>{a(!1),b(!1),p("awaiting"),P(!1),F(!1),V(!1),S([]),z(Y(c.initialVitals)),f({awaiting:new Date,wheels_rolling:null,on_scene:null,patient_loaded:null,arrived_dest:null,cleared:null}),R("job")};o.useEffect(()=>{const r=setInterval(()=>{se(new Date),oe(v=>v+1)},1e3);return()=>clearInterval(r)},[]),o.useEffect(()=>{if(!O)return;const r=()=>{ie(new Date),re(j=>j+1)};r();const v=setInterval(r,15e3);return()=>clearInterval(v)},[O]);const me=()=>{b(!0),y("Job accepted. Tap WHEELS ROLLING when ready.","success")},pe=r=>{r&&(p(r),f(v=>({...v,[r]:new Date})),r==="wheels_rolling"?(P(!0),y("🚑 Wheels rolling. GPS broadcasting.","success")):r==="on_scene"?y("On scene. Begin patient assessment.","info"):r==="patient_loaded"?y("Patient loaded. Begin transit.","info"):r==="arrived_dest"?y("Arrived at destination. Hand off when ready.","success"):r==="cleared"&&(P(!1),y("Job cleared. Ready for next dispatch.","success")))},xe=r=>{z(v=>[...v,{ts:new Date,source:"in-vehicle",...r}]),y("Vitals recorded","success")},ge=(r,v)=>{const j=Q.find(A=>A.id===r);j&&(S(A=>[...A,{ts:new Date,presetId:r,label:j.label,icon:j.icon,category:j.category,dose:v}]),y(j.label+" logged","success"))},fe=r=>{S(v=>v.filter((j,A)=>A!==r)),y("Removed from log","info")},K=()=>{V(!0),y("📡 Pre-arrival notification sent to "+c.toFacility,"success")},U=()=>{F(!0),y("Handoff signed. Run record sealed.","success")},q=h[h.length-1]||{};return t?e.jsx("div",{className:"emt",children:e.jsxs("div",{className:"emt-shell",children:[e.jsxs("div",{className:"emt-topbar",children:[e.jsx("div",{className:"emt-topbar-mark",children:"A"}),e.jsxs("div",{className:"emt-topbar-id",children:[e.jsx("div",{className:"emt-topbar-plate",children:C.plate}),e.jsxs("div",{className:"emt-topbar-meta",children:[n.initials," · ",C.station," · ",C.region]})]}),e.jsxs("div",{className:"emt-status-cluster",children:[O?e.jsxs("span",{className:"emt-pill broadcast",children:[e.jsx("span",{className:"dot"}),"GPS · ",W]}):e.jsxs("span",{className:"emt-pill",children:[e.jsx("span",{className:"dot"}),"STANDBY"]}),e.jsx("span",{className:"emt-clock",children:G(le)})]})]}),e.jsxs("div",{className:"emt-body",children:[I==="job"&&(d?e.jsx(Ie,{job:c,jobState:g,stateTimestamps:u,onAdvance:r=>pe(r),gpsActive:O,lastPing:ae,pingCount:W,onLogout:de,onSignOff:U,handoffSigned:m,destinationNotified:_,onNotifyDest:K,vitalsHistory:h,interventions:x,setTab:R}):e.jsx(ze,{job:c,onAccept:me})),I==="vitals"&&e.jsx(Ee,{job:c,vitalsHistory:h,onCapture:()=>N(!0),latestVitals:q}),I==="interv"&&e.jsx(Te,{interventions:x,category:T,setCategory:k,onAdd:ge,onRemove:fe}),I==="handoff"&&e.jsx(He,{job:c,jobState:g,stateTimestamps:u,vitalsHistory:h,interventions:x,destinationNotified:_,onNotifyDest:K,handoffSigned:m,onSign:U,crewLead:n})]}),d&&e.jsxs("div",{className:"emt-bottom-bar",children:[e.jsxs("button",{type:"button",className:"emt-tab "+(I==="job"?"active":""),onClick:()=>R("job"),style:{position:"relative"},children:[e.jsx("div",{className:"icon",children:"🚑"}),e.jsx("div",{children:"Job"})]}),e.jsxs("button",{type:"button",className:"emt-tab "+(I==="vitals"?"active":""),onClick:()=>R("vitals"),style:{position:"relative"},children:[e.jsx("div",{className:"icon",children:"💓"}),e.jsx("div",{children:"Vitals"}),h.length>0&&e.jsx("span",{className:"badge",children:h.length})]}),e.jsxs("button",{type:"button",className:"emt-tab "+(I==="interv"?"active":""),onClick:()=>R("interv"),style:{position:"relative"},children:[e.jsx("div",{className:"icon",children:"💊"}),e.jsx("div",{children:"Care"}),x.length>0&&e.jsx("span",{className:"badge",children:x.length})]}),e.jsxs("button",{type:"button",className:"emt-tab "+(I==="handoff"?"active":""),onClick:()=>R("handoff"),style:{position:"relative"},children:[e.jsx("div",{className:"icon",children:"📋"}),e.jsx("div",{children:"Handoff"})]})]}),e.jsx("div",{className:"emt-toast-host",children:ne.map(r=>e.jsx("div",{className:"emt-toast "+r.type,children:r.text},r.id))}),H&&e.jsx(Fe,{job:c,latestVitals:q,onClose:()=>N(null),onSave:r=>{xe(r),N(null)}})]})}):e.jsx("div",{className:"emt",children:e.jsx("div",{className:"emt-login",children:e.jsxs("div",{className:"emt-login-card",children:[e.jsx("div",{className:"emt-login-mark",children:"A"}),e.jsx("div",{className:"emt-login-title",children:"ARCS Crew"}),e.jsxs("div",{className:"emt-login-sub",children:["In-Vehicle Tablet · ",C.plate]}),e.jsxs("div",{className:"emt-field",children:[e.jsx("label",{className:"emt-label",children:"Crew lead on duty"}),e.jsx("div",{className:"crew-pills",children:Object.entries(X).map(([r,v])=>e.jsxs("button",{type:"button",className:"crew-pill "+(r===i?"active":""),onClick:()=>l(r),children:[e.jsx("div",{className:"pill-name",children:v.name}),e.jsx("div",{className:"pill-role",children:v.role})]},r))})]}),e.jsxs("div",{className:"emt-field",children:[e.jsx("label",{className:"emt-label",children:"Council #"}),e.jsx("input",{className:"emt-input",defaultValue:n.council,readOnly:!0})]}),e.jsxs("div",{className:"emt-field",children:[e.jsx("label",{className:"emt-label",children:"PIN"}),e.jsx("input",{className:"emt-input",type:"password",defaultValue:"●●●●"})]}),e.jsxs("button",{type:"button",className:"btn-big action",onClick:ce,style:{marginTop:18},children:[e.jsx("span",{children:"🚑"})," Begin shift"]}),e.jsxs("div",{style:{textAlign:"center",marginTop:20,fontFamily:"var(--emt-mono)",fontSize:11,color:"var(--emt-text-4)",letterSpacing:"0.1em"},children:[C.station.toUpperCase()," · ",C.region.toUpperCase()]})]})})})}function ze({job:t,onAccept:a}){return e.jsxs("div",{children:[e.jsxs("div",{className:"emt-page-head",children:[e.jsx("div",{className:"emt-eyebrow",children:"Incoming dispatch · From ARCS"}),e.jsx("h1",{className:"emt-title",children:"New Job"}),e.jsxs("p",{className:"emt-sub",children:["Received ",ee(t.receivedAt)," · ",t.type]})]}),e.jsxs("div",{className:"job-card priority-"+t.priority,children:[e.jsxs("div",{className:"job-priority-row",children:[e.jsx("span",{className:"job-priority-pill "+t.priority,children:t.priority==="critical"?"⚠ CRITICAL":t.priority==="high"?"HIGH":"ROUTINE"}),e.jsxs("span",{style:{fontFamily:"var(--emt-mono)",fontSize:11,color:"var(--emt-text-3)"},children:["NECC ref · ",t.neccRefId]}),e.jsx("span",{className:"job-id",children:t.id})]}),e.jsx("div",{className:"job-condition",children:t.condition}),e.jsxs("div",{className:"job-pat",children:[t.patientInitials," · ",t.patientAge,t.patientSex," · ",t.patientCategory," · ",t.stability]}),e.jsxs("div",{className:"route-block",children:[e.jsxs("div",{className:"route-row",children:[e.jsx("div",{className:"route-icon from",children:"A"}),e.jsxs("div",{className:"route-label",children:[e.jsx("div",{className:"lbl",children:"Pickup"}),e.jsx("div",{className:"val",children:t.fromFacility}),e.jsx("div",{className:"meta",children:t.fromAddress})]})]}),e.jsx("div",{className:"route-line"}),e.jsxs("div",{className:"route-row",children:[e.jsx("div",{className:"route-icon to",children:"B"}),e.jsxs("div",{className:"route-label",children:[e.jsx("div",{className:"lbl",children:"Destination"}),e.jsx("div",{className:"val",children:t.toFacility}),e.jsxs("div",{className:"meta",children:[t.toUnit," · ",t.toAddress]})]})]})]}),e.jsxs("div",{className:"job-stats",children:[e.jsxs("div",{className:"job-stat",children:[e.jsx("div",{className:"v",children:t.distanceKm}),e.jsx("div",{className:"l",children:"km"})]}),e.jsxs("div",{className:"job-stat",children:[e.jsx("div",{className:"v",children:t.etaInitial}),e.jsx("div",{className:"l",children:"min · ETA"})]}),e.jsxs("div",{className:"job-stat",children:[e.jsx("div",{className:"v",style:{fontSize:16,color:"var(--emt-action)"},children:"STEMI"}),e.jsx("div",{className:"l",children:"flag"})]})]}),e.jsxs("div",{className:"job-summary",children:[e.jsx("div",{style:{fontFamily:"var(--emt-mono)",fontSize:11,color:"var(--emt-text-3)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6},children:"Summary from referring facility"}),t.summary]}),e.jsx("div",{className:"job-actions",children:e.jsxs("button",{type:"button",className:"btn-big go",onClick:a,children:[e.jsx("span",{style:{fontSize:22},children:"✓"}),"Accept Job"]})})]}),e.jsxs("div",{style:{marginTop:20,padding:16,background:"var(--emt-bg-1)",border:"1px solid var(--emt-line)",borderRadius:14,fontSize:12,color:"var(--emt-text-3)",lineHeight:1.5},children:[e.jsx("div",{style:{fontFamily:"var(--emt-mono)",fontSize:10,fontWeight:700,letterSpacing:"0.14em",textTransform:"uppercase",color:"var(--emt-text-3)",marginBottom:6},children:"What happens after accept"}),"Accepting reports back to ARCS dispatch and moves the job to your active workspace. Tap ",e.jsx("b",{style:{color:"var(--emt-go)"},children:"WHEELS ROLLING"})," when you start the engine. GPS broadcasting will begin automatically."]})]})}function Ie({job:t,jobState:a,stateTimestamps:i,onAdvance:l,gpsActive:n,lastPing:c,pingCount:s,onLogout:d,onSignOff:b,handoffSigned:g,destinationNotified:p,onNotifyDest:u,vitalsHistory:f,interventions:h,setTab:z}){const H=te(a),N=Se(a);N&&ke(N);const x=a==="awaiting"?{label:"WHEELS ROLLING",sub:"Begin transit · GPS will activate",cls:"go",icon:"🚑"}:a==="wheels_rolling"?{label:"ON SCENE",sub:"Arrived at pickup",cls:"copper",icon:"📍"}:a==="on_scene"?{label:"PATIENT LOADED",sub:"Ready to depart for destination",cls:"warn",icon:"🚑"}:a==="patient_loaded"?{label:"ARRIVED DESTINATION",sub:"At receiving facility",cls:"go",icon:"🏥"}:a==="arrived_dest"?{label:"CLEAR JOB",sub:"Handoff complete · ready for next",cls:"action",icon:"✓"}:null;return e.jsxs("div",{children:[e.jsxs("div",{className:"emt-page-head",children:[e.jsxs("div",{className:"emt-eyebrow",children:[t.priority.toUpperCase()," · ",t.condition]}),e.jsx("h1",{className:"emt-title",children:"Active Job"}),e.jsxs("p",{className:"emt-sub",children:[t.fromFacility," → ",t.toFacility," · ",t.distanceKm," km"]})]}),e.jsx("div",{className:"card lift",children:e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:14},children:[e.jsxs("div",{children:[e.jsxs("div",{style:{fontFamily:"var(--emt-display)",fontSize:22,fontWeight:600},children:[t.patientInitials," · ",t.patientAge,t.patientSex]}),e.jsxs("div",{style:{fontSize:13,color:"var(--emt-text-3)",marginTop:4},children:[t.patientCategory," · ",t.stability]}),e.jsx("div",{style:{fontSize:14,fontWeight:600,color:"var(--emt-action)",marginTop:8},children:t.condition})]}),e.jsx("span",{className:"job-priority-pill "+t.priority,style:{flexShrink:0},children:t.priority==="critical"?"⚠ CRIT":t.priority.toUpperCase()})]})}),e.jsxs("div",{className:"card lifecycle-card",children:[e.jsx("div",{className:"lifecycle-track",children:D.map((S,T)=>{const k=T<H?"done":T===H?"current":"pending",m=i[S.id];return e.jsxs("div",{className:"lc-step "+k,children:[e.jsx("div",{className:"lc-dot "+k,children:T+1}),e.jsx("div",{className:"lc-label",children:S.short}),e.jsx("div",{className:"lc-ts",children:m?E(m):"—"})]},S.id)})}),x&&e.jsxs("div",{className:"lifecycle-action",children:[e.jsx("div",{className:"next-action-prompt",children:"Next step"}),e.jsxs("button",{type:"button",className:"btn-big "+x.cls,onClick:()=>l(N),children:[e.jsx("span",{style:{fontSize:22},children:x.icon}),e.jsxs("div",{style:{display:"flex",flexDirection:"column",alignItems:"flex-start",textAlign:"left"},children:[e.jsx("span",{style:{fontWeight:700,letterSpacing:"0.04em"},children:x.label}),e.jsx("span",{style:{fontSize:12,fontWeight:500,opacity:.85},children:x.sub})]})]})]}),a==="cleared"&&e.jsxs("div",{className:"lifecycle-action",children:[e.jsxs("div",{className:"emt-empty",style:{padding:20},children:[e.jsx("div",{className:"em-icon",children:"✓"}),e.jsx("div",{className:"em-title",children:"Job complete"}),e.jsx("div",{className:"em-sub",children:"Run record sealed · Vehicle returning to station"})]}),e.jsx("button",{type:"button",className:"btn-big outline",onClick:d,children:"End shift"})]})]}),n&&e.jsxs("div",{className:"card glow-go",children:[e.jsxs("div",{className:"card-head",style:{paddingBottom:0,marginBottom:0,borderBottom:"none"},children:[e.jsxs("div",{className:"card-title",style:{display:"flex",alignItems:"center",gap:10},children:[e.jsx("span",{style:{width:12,height:12,background:"var(--emt-go)",borderRadius:"50%",animation:"emt-pulse 1.4s ease-in-out infinite"}}),"GPS broadcasting"]}),e.jsxs("div",{className:"card-meta",children:[s," ping",s===1?"":"s"," · last ",G(c)]})]}),e.jsx("div",{style:{marginTop:10,fontSize:13,color:"var(--emt-text-3)"},children:"Position relayed to ARCS dispatch every 15 seconds. Receiving facility can see live ETA on their portal."})]}),e.jsx("div",{className:"card",children:e.jsxs("div",{className:"route-block",style:{background:"transparent",padding:0},children:[e.jsxs("div",{className:"route-row",children:[e.jsx("div",{className:"route-icon from",children:"A"}),e.jsxs("div",{className:"route-label",children:[e.jsx("div",{className:"lbl",children:"Pickup"}),e.jsx("div",{className:"val",children:t.fromFacility}),e.jsx("div",{className:"meta",children:t.fromAddress})]})]}),e.jsx("div",{className:"route-line"}),e.jsxs("div",{className:"route-row",children:[e.jsx("div",{className:"route-icon to",children:"B"}),e.jsxs("div",{className:"route-label",children:[e.jsxs("div",{className:"lbl",children:["Destination · ",t.toUnit]}),e.jsx("div",{className:"val",children:t.toFacility}),e.jsx("div",{className:"meta",children:t.toAddress})]})]})]})}),e.jsxs("div",{className:"job-stats",children:[e.jsxs("div",{className:"job-stat",children:[e.jsx("div",{className:"v",children:f.length}),e.jsx("div",{className:"l",children:"vitals logged"})]}),e.jsxs("div",{className:"job-stat",children:[e.jsx("div",{className:"v",children:h.length}),e.jsx("div",{className:"l",children:"interventions"})]}),e.jsxs("div",{className:"job-stat",children:[e.jsx("div",{className:"v",children:g?"✓":"–"}),e.jsx("div",{className:"l",children:"handoff"})]})]}),(a==="patient_loaded"||a==="en_route_dest")&&!p&&e.jsxs("div",{className:"card glow-warn",children:[e.jsx("div",{style:{fontFamily:"var(--emt-mono)",fontSize:11,color:"var(--emt-warn)",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:8},children:"Pre-arrival notification"}),e.jsxs("div",{style:{fontSize:14,color:"var(--emt-text-2)",marginBottom:14,lineHeight:1.5},children:["Send latest vitals + ETA to ",t.toFacility," so the receiving team can prepare before you arrive."]}),e.jsxs("button",{type:"button",className:"btn-big warn",onClick:u,children:[e.jsx("span",{style:{fontSize:20},children:"📡"}),"Notify destination"]})]})]})}function Ee({job:t,vitalsHistory:a,onCapture:i,latestVitals:l}){const n=o.useMemo(()=>l.sbp?L(l,t.patientAge,t.patientCategory):null,[l,t]),c=d=>n&&n.perVital[d]?n.perVital[d].tier:null,s=({name:d,val:b,unit:g,tierKey:p})=>{const u=c(p);return e.jsxs("div",{className:"vital-tile "+(u?"tier-"+u:""),children:[e.jsx("div",{className:"vital-name",children:d}),b!=null?e.jsx("div",{className:"vital-val",children:b}):e.jsx("div",{className:"vital-empty",children:"—"}),e.jsx("div",{className:"vital-unit",children:g})]})};return e.jsxs("div",{children:[e.jsxs("div",{className:"emt-page-head",children:[e.jsxs("div",{className:"emt-eyebrow",children:["Patient · ",t.patientInitials," · ",t.patientAge,t.patientSex]}),e.jsx("h1",{className:"emt-title",children:"Vitals"}),e.jsxs("p",{className:"emt-sub",children:[a.length," reading",a.length===1?"":"s"," logged · Last ",a.length>0?ee(a[a.length-1].ts):"—"]})]}),e.jsx("div",{style:{fontFamily:"var(--emt-mono)",fontSize:11,fontWeight:700,letterSpacing:"0.14em",textTransform:"uppercase",color:"var(--emt-text-3)",marginBottom:10},children:"Current readings · engine-assessed"}),e.jsxs("div",{className:"vitals-grid",children:[e.jsx(s,{name:"BP",val:l.sbp!=null?l.sbp+"/"+l.dbp:null,unit:"mmHg",tierKey:"sbp"}),e.jsx(s,{name:"HR",val:l.hr,unit:"bpm",tierKey:"hr"}),e.jsx(s,{name:"RR",val:l.rr,unit:"/min",tierKey:"rr"}),e.jsx(s,{name:"SpO₂",val:l.spo2,unit:"%",tierKey:"spo2"}),e.jsx(s,{name:"GCS",val:l.gcs,unit:"/15",tierKey:"gcs"})]}),e.jsxs("button",{type:"button",className:"btn-big action",onClick:i,style:{marginBottom:18},children:[e.jsx("span",{style:{fontSize:22},children:"+"}),"Record new vitals"]}),a.length>0&&e.jsxs("div",{className:"card vitals-history",children:[e.jsxs("div",{className:"vitals-row head",children:[e.jsx("div",{children:"Time"}),e.jsx("div",{className:"v",children:"BP"}),e.jsx("div",{className:"v",children:"HR"}),e.jsx("div",{className:"v",children:"RR"}),e.jsx("div",{className:"v",children:"SpO₂"}),e.jsx("div",{className:"v",children:"GCS"})]}),[...a].reverse().map((d,b)=>{const g=L(d,t.patientAge,t.patientCategory),p=u=>g&&g.perVital[u]?"t-"+g.perVital[u].tier:"";return e.jsxs("div",{className:"vitals-row",children:[e.jsx("div",{className:"ts",children:E(d.ts)}),e.jsx("div",{className:"v "+p("sbp"),children:d.sbp!=null?d.sbp+"/"+d.dbp:"—"}),e.jsx("div",{className:"v "+p("hr"),children:d.hr??"—"}),e.jsx("div",{className:"v "+p("rr"),children:d.rr??"—"}),e.jsx("div",{className:"v "+p("spo2"),children:d.spo2??"—"}),e.jsx("div",{className:"v "+p("gcs"),children:d.gcs??"—"})]},b)})]})]})}function Te({interventions:t,category:a,setCategory:i,onAdd:l,onRemove:n}){const c=Q.filter(s=>s.category===a);return e.jsxs("div",{children:[e.jsxs("div",{className:"emt-page-head",children:[e.jsx("div",{className:"emt-eyebrow",children:"In-vehicle care log"}),e.jsx("h1",{className:"emt-title",children:"Interventions"}),e.jsx("p",{className:"emt-sub",children:"Tap to add. Each entry is timestamped and signed by you. Builds the e-PCR for handoff."})]}),e.jsx("div",{className:"interv-cat-tabs",children:be.map(s=>e.jsx("button",{type:"button",className:"interv-cat-tab "+(a===s.id?"active":""),onClick:()=>i(s.id),children:s.label},s.id))}),e.jsx("div",{className:"interv-grid",style:{marginBottom:22},children:c.map(s=>e.jsxs("button",{type:"button",className:"interv-tile",onClick:()=>l(s.id),children:[e.jsx("div",{className:"icon",children:s.icon}),e.jsx("div",{className:"label",children:s.label})]},s.id))}),e.jsxs("div",{style:{fontFamily:"var(--emt-mono)",fontSize:11,fontWeight:700,letterSpacing:"0.14em",textTransform:"uppercase",color:"var(--emt-text-3)",marginBottom:10},children:["Care log · ",t.length," entr",t.length===1?"y":"ies"]}),t.length===0?e.jsxs("div",{className:"emt-empty",children:[e.jsx("div",{className:"em-icon",children:"💊"}),e.jsx("div",{className:"em-title",children:"No interventions yet"}),e.jsx("div",{className:"em-sub",children:"Tap any tile above to log it"})]}):e.jsx("div",{className:"card interv-log",children:[...t].reverse().map((s,d)=>{const b=t.length-1-d;return e.jsxs("div",{className:"interv-entry",children:[e.jsx("div",{className:"time",children:E(s.ts)}),e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:10},children:[e.jsx("span",{style:{fontSize:22},children:s.icon}),e.jsx("div",{className:"what",children:s.label})]}),e.jsx("button",{type:"button",onClick:()=>n(b),style:{minWidth:44,minHeight:44,color:"var(--emt-text-3)",fontSize:16},"aria-label":"Remove",children:"✕"})]})]},b)})})]})}function He({job:t,jobState:a,stateTimestamps:i,vitalsHistory:l,interventions:n,destinationNotified:c,onNotifyDest:s,handoffSigned:d,onSign:b,crewLead:g}){const p=(()=>{const f=i.wheels_rolling,h=i.arrived_dest||new Date;return f?Math.round((h-f)/6e4):null})(),u=(()=>{const f=i.on_scene,h=i.patient_loaded;return!f||!h?null:Math.round((h-f)/6e4)})();return e.jsxs("div",{children:[e.jsxs("div",{className:"emt-page-head",children:[e.jsx("div",{className:"emt-eyebrow",children:"Handoff · e-PCR · MoH-grade"}),e.jsx("h1",{className:"emt-title",children:"Patient Handoff"}),e.jsx("p",{className:"emt-sub",children:"Pre-arrival notification, run summary, and signed handoff to receiving facility."})]}),c?e.jsxs("div",{className:"card glow-go",children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"},children:[e.jsx("div",{className:"card-title",style:{color:"var(--emt-go)"},children:"✓ Pre-arrival sent"}),e.jsxs("span",{className:"emt-pill broadcast",children:[e.jsx("span",{className:"dot"}),"DELIVERED"]})]}),e.jsxs("div",{style:{fontSize:13,color:"var(--emt-text-3)",marginTop:8},children:["Latest vitals + ETA shared with ",t.toFacility,". Receiving team alerted."]})]}):e.jsxs("div",{className:"card glow-warn",children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10},children:[e.jsx("div",{className:"card-title",children:"📡 Pre-arrival notification"}),e.jsx("span",{className:"emt-pill",children:"PENDING"})]}),e.jsxs("div",{style:{fontSize:14,color:"var(--emt-text-2)",marginBottom:14,lineHeight:1.5},children:["Send latest vitals and ETA to ",t.toFacility,". The receiving team prepares the cath lab before you arrive — saves 5–10 minutes door-to-balloon."]}),e.jsxs("button",{type:"button",className:"btn-big warn",onClick:s,children:[e.jsx("span",{style:{fontSize:20},children:"📡"})," Notify ",t.toFacility.split(" ").slice(0,2).join(" ")]})]}),e.jsxs("div",{className:"card",children:[e.jsxs("div",{className:"card-head",children:[e.jsx("div",{className:"card-title",children:"Run Summary"}),e.jsx("div",{className:"card-meta",children:t.id})]}),e.jsxs("div",{className:"handoff-summary",style:{background:"transparent",padding:0},children:[e.jsxs("div",{className:"handoff-row",children:[e.jsx("span",{className:"k",children:"Patient"}),e.jsxs("span",{className:"v",children:[t.patientInitials," · ",t.patientAge,t.patientSex," · ",t.patientCategory]})]}),e.jsxs("div",{className:"handoff-row",children:[e.jsx("span",{className:"k",children:"Condition"}),e.jsx("span",{className:"v",style:{color:"var(--emt-action)"},children:t.condition})]}),e.jsxs("div",{className:"handoff-row",children:[e.jsx("span",{className:"k",children:"Stability"}),e.jsx("span",{className:"v",children:t.stability})]}),e.jsxs("div",{className:"handoff-row",children:[e.jsx("span",{className:"k",children:"From"}),e.jsx("span",{className:"v",style:{fontSize:13},children:t.fromFacility})]}),e.jsxs("div",{className:"handoff-row",children:[e.jsx("span",{className:"k",children:"To"}),e.jsx("span",{className:"v",style:{fontSize:13},children:t.toFacility})]}),e.jsxs("div",{className:"handoff-row",children:[e.jsx("span",{className:"k",children:"Vehicle"}),e.jsxs("span",{className:"v",children:[C.plate," · ",C.type]})]}),e.jsxs("div",{className:"handoff-row",children:[e.jsx("span",{className:"k",children:"Crew"}),e.jsx("span",{className:"v",children:g.name})]}),i.wheels_rolling&&e.jsxs("div",{className:"handoff-row",children:[e.jsx("span",{className:"k",children:"Departed"}),e.jsx("span",{className:"v",children:E(i.wheels_rolling)})]}),i.on_scene&&e.jsxs("div",{className:"handoff-row",children:[e.jsx("span",{className:"k",children:"On scene"}),e.jsx("span",{className:"v",children:E(i.on_scene)})]}),i.patient_loaded&&e.jsxs("div",{className:"handoff-row",children:[e.jsx("span",{className:"k",children:"Loaded"}),e.jsx("span",{className:"v",children:E(i.patient_loaded)})]}),i.arrived_dest&&e.jsxs("div",{className:"handoff-row",children:[e.jsx("span",{className:"k",children:"Arrived"}),e.jsx("span",{className:"v",children:E(i.arrived_dest)})]}),p!=null&&e.jsxs("div",{className:"handoff-row",children:[e.jsx("span",{className:"k",children:"Total time"}),e.jsxs("span",{className:"v",style:{color:"var(--emt-go)"},children:[p," min"]})]}),u!=null&&e.jsxs("div",{className:"handoff-row",children:[e.jsx("span",{className:"k",children:"On-scene time"}),e.jsxs("span",{className:"v",children:[u," min"]})]}),e.jsxs("div",{className:"handoff-row",children:[e.jsx("span",{className:"k",children:"Vitals captured"}),e.jsxs("span",{className:"v",children:[l.length," reading",l.length===1?"":"s"]})]}),e.jsxs("div",{className:"handoff-row",children:[e.jsx("span",{className:"k",children:"Interventions"}),e.jsx("span",{className:"v",children:n.length})]})]})]}),n.length>0&&e.jsxs("div",{className:"card",children:[e.jsxs("div",{className:"card-head",children:[e.jsx("div",{className:"card-title",children:"Interventions delivered"}),e.jsxs("div",{className:"card-meta",children:[n.length," entr",n.length===1?"y":"ies"]})]}),e.jsx("div",{style:{display:"flex",flexDirection:"column",gap:6},children:n.map((f,h)=>e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:h<n.length-1?"1px solid var(--emt-line)":"none",fontSize:14},children:[e.jsxs("span",{style:{display:"flex",alignItems:"center",gap:10},children:[e.jsx("span",{style:{fontSize:18},children:f.icon}),e.jsx("span",{style:{fontWeight:500},children:f.label})]}),e.jsx("span",{style:{fontFamily:"var(--emt-mono)",fontSize:12,color:"var(--emt-text-3)"},children:E(f.ts)})]},h))})]}),e.jsxs("div",{className:"card",children:[e.jsxs("div",{className:"card-head",children:[e.jsx("div",{className:"card-title",children:"Crew sign-off"}),e.jsx("div",{className:"card-meta",children:d?"SEALED":"PENDING"})]}),e.jsx("div",{className:"signature-pad "+(d?"signed":""),children:d?e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"sig-name",children:g.name}),e.jsxs("div",{className:"sig-meta",children:[g.role," · ",g.council]}),e.jsxs("div",{className:"sig-meta",style:{marginTop:4},children:["Signed ",G(new Date)," · Vehicle ",C.plate]})]}):e.jsxs(e.Fragment,{children:[e.jsx("div",{style:{fontSize:14,color:"var(--emt-text-3)",marginBottom:10},children:"Tap to sign and seal the run record."}),e.jsxs("div",{style:{fontFamily:"var(--emt-mono)",fontSize:11,color:"var(--emt-text-4)",letterSpacing:"0.1em"},children:[g.name.toUpperCase()," · ",g.council]})]})}),!d&&e.jsxs("button",{type:"button",className:"btn-big go",onClick:b,disabled:a!=="arrived_dest"&&a!=="cleared",children:[e.jsx("span",{style:{fontSize:22},children:"✍"}),a==="arrived_dest"||a==="cleared"?"Sign &amp; seal handoff":"Available after arrival"]}),d&&e.jsx("div",{style:{fontSize:13,color:"var(--emt-go)",textAlign:"center",marginTop:6},children:"✓ Run record replicated to NECC · Available in receiving portal"})]})]})}function Fe({job:t,latestVitals:a,onClose:i,onSave:l}){const[n,c]=o.useState(a.sbp?String(a.sbp):""),[s,d]=o.useState(a.dbp?String(a.dbp):""),[b,g]=o.useState(a.hr?String(a.hr):""),[p,u]=o.useState(a.rr?String(a.rr):""),[f,h]=o.useState(a.spo2?String(a.spo2):""),[z,H]=o.useState(a.gcs?String(a.gcs):""),N={sbp:parseFloat(n),dbp:parseFloat(s),hr:parseFloat(b),rr:parseFloat(p),spo2:parseFloat(f),gcs:parseFloat(z)},x=o.useMemo(()=>N.sbp?L(N,t.patientAge,t.patientCategory):null,[N,t]),S=m=>x&&x.perVital[m]?x.perVital[m].tier:null,T=()=>{const m={sbp:n?parseInt(n):null,dbp:s?parseInt(s):null,hr:b?parseInt(b):null,rr:p?parseInt(p):null,spo2:f?parseInt(f):null,gcs:z?parseInt(z):null};l(m)},k=m=>{const F=S(m);if(!F)return{};const _={normal:"var(--tier-normal)",borderline:"var(--tier-borderline)",abnormal:"var(--tier-abnormal)",critical:"var(--tier-critical)"};return{borderColor:_[F],color:_[F]}};return e.jsx("div",{className:"emt-modal-overlay",onClick:i,children:e.jsxs("div",{className:"emt-modal",onClick:m=>m.stopPropagation(),children:[e.jsx("div",{className:"emt-modal-grip"}),e.jsxs("div",{className:"emt-modal-head",children:[e.jsx("div",{className:"emt-modal-title",children:"Record vitals"}),e.jsxs("div",{className:"emt-modal-sub",children:[t.patientInitials," · ",t.patientAge,t.patientSex," · ",t.patientCategory," · live engine assessment"]})]}),e.jsxs("div",{className:"emt-modal-body",children:[e.jsxs("div",{className:"emt-field",children:[e.jsx("label",{className:"emt-label",children:"Blood pressure (mmHg)"}),e.jsxs("div",{className:"bp-input-row",children:[e.jsx("input",{className:"emt-input",type:"number",inputMode:"numeric",placeholder:"120",value:n,onChange:m=>c(m.target.value),style:k("sbp")}),e.jsx("span",{className:"sep",children:"/"}),e.jsx("input",{className:"emt-input",type:"number",inputMode:"numeric",placeholder:"80",value:s,onChange:m=>d(m.target.value)})]})]}),e.jsxs("div",{className:"emt-field",children:[e.jsx("label",{className:"emt-label",children:"Heart rate (bpm)"}),e.jsx("input",{className:"emt-input",type:"number",inputMode:"numeric",placeholder:"80",value:b,onChange:m=>g(m.target.value),style:{...k("hr"),textAlign:"center",fontFamily:"var(--emt-mono)",fontSize:28,fontWeight:700}})]}),e.jsxs("div",{className:"emt-field",children:[e.jsx("label",{className:"emt-label",children:"Respiratory rate (/min)"}),e.jsx("input",{className:"emt-input",type:"number",inputMode:"numeric",placeholder:"16",value:p,onChange:m=>u(m.target.value),style:{...k("rr"),textAlign:"center",fontFamily:"var(--emt-mono)",fontSize:28,fontWeight:700}})]}),e.jsxs("div",{className:"emt-field",children:[e.jsx("label",{className:"emt-label",children:"SpO₂ (%)"}),e.jsx("input",{className:"emt-input",type:"number",inputMode:"numeric",placeholder:"98",value:f,onChange:m=>h(m.target.value),style:{...k("spo2"),textAlign:"center",fontFamily:"var(--emt-mono)",fontSize:28,fontWeight:700}})]}),e.jsxs("div",{className:"emt-field",children:[e.jsx("label",{className:"emt-label",children:"GCS (/15)"}),e.jsx("input",{className:"emt-input",type:"number",inputMode:"numeric",placeholder:"15",value:z,onChange:m=>H(m.target.value),style:{...k("gcs"),textAlign:"center",fontFamily:"var(--emt-mono)",fontSize:28,fontWeight:700}})]}),x&&x.criticalCount>0&&e.jsxs("div",{style:{marginTop:14,padding:14,background:"rgba(230,57,70,0.12)",border:"1.5px solid var(--tier-critical)",borderRadius:10,fontSize:13,color:"var(--tier-critical)",fontWeight:600},children:["⚠ ",x.criticalCount," critical vital",x.criticalCount>1?"s":""," detected · score ",x.totalScore]})]}),e.jsxs("div",{className:"emt-modal-foot",children:[e.jsx("button",{type:"button",className:"btn-mid outline",onClick:i,style:{flex:1},children:"Cancel"}),e.jsxs("button",{type:"button",className:"btn-mid action",onClick:T,style:{flex:2},children:[e.jsx("span",{children:"✓"})," Save reading"]})]})]})})}export{_e as default};
//# sourceMappingURL=EmtDevice-D02JchzB.js.map
