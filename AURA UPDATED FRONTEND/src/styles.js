export const AVATAR_COLORS = ["#4C6FFF", "#FB7185", "#8B7CF6", "#2DD4BF", "#FBBF24"];

export const DARK_VARS = {
  "--bg": "#0A0C11", "--sidebar-bg": "#0B0D13", "--surface": "#12151C", "--surface-2": "#171B24",
  "--border": "#22262F", "--ink": "#F1F2F5", "--ink-soft": "#9AA0AC", "--ink-faint": "#5C626D",
  "--primary": "#5B7FFF", "--primary-dark": "#3E5CE0", "--teal": "#2DD4BF", "--teal-rgb": "45,212,191",
  "--violet": "#8B7CF6",
  "--danger": "#FB7185", "--danger-bg": "rgba(251,113,133,0.14)",
  "--warn": "#FBBF24", "--warn-bg": "rgba(251,191,36,0.14)",
  "--success": "#34D399", "--success-bg": "rgba(52,211,153,0.14)",
  "--shadow": "0 20px 50px rgba(0,0,0,0.45)",
  "--topbar-scroll-bg": "rgba(10,12,17,0.72)",
};
export const LIGHT_VARS = {
  "--bg": "#F5F6FA", "--sidebar-bg": "#FFFFFF", "--surface": "#FFFFFF", "--surface-2": "#F1F2F7",
  "--border": "#E3E5EE", "--ink": "#161821", "--ink-soft": "#5B6072", "--ink-faint": "#9498A8",
  "--primary": "#4A4FE0", "--primary-dark": "#3638B0", "--teal": "#0D9488", "--teal-rgb": "13,148,136",
  "--violet": "#7C6FF0",
  "--danger": "#E11D48", "--danger-bg": "rgba(225,29,72,0.08)",
  "--warn": "#D97706", "--warn-bg": "rgba(217,119,6,0.09)",
  "--success": "#0E9F6E", "--success-bg": "rgba(14,159,110,0.09)",
  "--shadow": "0 20px 50px rgba(30,32,60,0.12)",
  "--topbar-scroll-bg": "rgba(245,246,250,0.72)",
};

export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

*{box-sizing:border-box;}
.app-shell{min-height:100vh; background:var(--bg); color:var(--ink); font-family:'Inter',sans-serif; display:flex; transition:background .2s ease, color .2s ease; position:relative;}
button{font-family:inherit; cursor:pointer;}
h1,h2,h3,h4{font-family:'Fraunces',serif; margin:0; font-weight:600; letter-spacing:-0.01em; color:var(--ink);}
p{margin:0; line-height:1.55;}
input,select,textarea{font-family:'Inter',sans-serif; color:var(--ink);}
.muted{color:var(--ink-soft);}
.muted.small{font-size:12px;}

/* ambient background */
.ambient-blobs{position:fixed; inset:0; overflow:hidden; pointer-events:none; z-index:0;}
.blob{position:absolute; border-radius:50%; filter:blur(75px); opacity:.16;}
.blob.b1{width:420px; height:420px; background:var(--primary); top:-140px; left:260px; animation:drift 26s ease-in-out infinite alternate;}
.blob.b2{width:360px; height:360px; background:var(--teal); top:100px; right:-110px; animation:drift 21s ease-in-out infinite alternate; animation-delay:-6s;}
.blob.b3{width:300px; height:300px; background:var(--violet); bottom:-150px; left:38%; animation:drift 24s ease-in-out infinite alternate; animation-delay:-12s;}
@keyframes drift{0%{transform:translate(0,0) scale(1);} 50%{transform:translate(34px,-24px) scale(1.08);} 100%{transform:translate(-22px,16px) scale(0.95);}}

/* sidebar */
.sidebar{width:252px; flex-shrink:0; background:var(--sidebar-bg); border-right:1px solid var(--border); display:flex; flex-direction:column; height:100vh; position:sticky; top:0; padding:20px 14px; z-index:2; animation:slideInLeft .5s cubic-bezier(.22,1,.36,1) both;}
@keyframes slideInLeft{from{opacity:0; transform:translateX(-14px);} to{opacity:1; transform:translateX(0);}}
.sidebar-brand{display:flex; align-items:center; gap:10px; padding:6px 8px 22px; border-radius:12px; transition:background .2s ease;}
.sidebar-brand:hover{background:var(--surface-2);}
.sidebar-brand:hover .aura-mark-glow{opacity:.95; animation-duration:1.6s;}
.brand-word{font-family:'Fraunces',serif; font-size:17px; font-weight:600; color:var(--ink);}
.brand-sub{font-size:11px; color:var(--ink-faint);}
.side-block{margin-bottom:18px;}
.side-label{display:block; font-size:10.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-faint); padding:8px 10px 4px; font-family:'IBM Plex Mono',monospace;}
.side-section{position:relative; display:flex; flex-direction:column; gap:2px;}
.side-indicator{position:absolute; left:0; right:0; background:var(--surface-2); border-radius:10px; z-index:0; transition:top .3s cubic-bezier(.22,1,.36,1), height .3s cubic-bezier(.22,1,.36,1);}
.side-link{position:relative; z-index:1; display:flex; align-items:center; gap:10px; background:none; border:none; padding:9px 10px; border-radius:10px; color:var(--ink-soft); font-size:13.5px; font-weight:500; text-align:left; transition:color .15s ease, background .15s ease;}
.side-link:hover{background:var(--surface-2); color:var(--ink);}
.side-link.is-active{color:var(--primary);}
.side-link .count{margin-left:auto; background:var(--surface-2); color:var(--ink-faint); font-size:11px; padding:1px 7px; border-radius:999px; font-family:'IBM Plex Mono',monospace;}
.side-link.is-active .count{color:var(--primary);}
.sidebar-bottom{margin-top:auto; display:flex; flex-direction:column; gap:4px; border-top:1px solid var(--border); padding-top:12px;}
.profile-card{display:flex; align-items:center; gap:10px; background:none; border:none; padding:8px 10px; border-radius:10px; text-align:left; transition:background .15s ease;}
.profile-card:hover{background:var(--surface-2);}
.profile-name{font-size:13px; font-weight:600; color:var(--ink);}
.profile-role{font-size:11.5px; color:var(--ink-faint);}
.disclaimer-mini{font-size:10.5px; color:var(--ink-faint); padding:6px 10px 0; line-height:1.4;}

/* aura mark */
.aura-mark{position:relative; display:flex; align-items:center; justify-content:center; flex-shrink:0; border-radius:11px;}
.aura-mark-glow{position:absolute; inset:-40%; border-radius:14px; background:conic-gradient(from 180deg, var(--teal), var(--primary), var(--teal)); filter:blur(12px); opacity:.6; animation:auraPulse 4s ease-in-out infinite; transition:opacity .3s ease;}
.aura-mark-active .aura-mark-glow{animation-duration:1.1s; opacity:.9;}
.aura-mark-core{position:relative; width:100%; height:100%; border-radius:11px; background:linear-gradient(135deg, var(--teal), var(--primary)); display:flex; align-items:center; justify-content:center; color:#fff;}
@keyframes auraPulse{0%,100%{transform:scale(1); opacity:.5;} 50%{transform:scale(1.15); opacity:.85;}}

/* topbar */
.main-col{flex:1; min-width:0; display:flex; flex-direction:column; position:relative; z-index:1;}
.topbar{position:sticky; top:0; z-index:15; display:flex; align-items:center; gap:16px; padding:16px 28px; background:transparent; border-bottom:1px solid transparent; box-shadow:none; backdrop-filter:blur(0px); transition:background .3s ease, border-color .3s ease, box-shadow .3s ease, backdrop-filter .3s ease; animation:fadeDown .5s cubic-bezier(.22,1,.36,1) both; animation-delay:.06s;}
.topbar.is-scrolled{background:var(--topbar-scroll-bg); backdrop-filter:blur(12px); border-bottom:1px solid var(--border); box-shadow:0 10px 26px rgba(0,0,0,0.10);}
@keyframes fadeDown{from{opacity:0; transform:translateY(-10px);} to{opacity:1; transform:translateY(0);}}
.search-bar{flex:1; max-width:520px; display:flex; align-items:center; gap:10px; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:10px 14px; color:var(--ink-faint); transition:border-color .2s ease, box-shadow .2s ease;}
.search-bar:focus-within{border-color:var(--primary); box-shadow:0 0 0 3px rgba(91,127,255,0.14);}
.search-bar input{flex:1; background:none; border:none; outline:none; font-size:13.5px; color:var(--ink);}
.search-bar input::placeholder{color:var(--ink-faint);}
.kbd{font-family:'IBM Plex Mono',monospace; font-size:11px; background:var(--surface-2); padding:2px 6px; border-radius:5px;}
.topbar-right{display:flex; align-items:center; gap:10px; margin-left:auto;}
.icon-btn{position:relative; background:var(--surface); border:1px solid var(--border); border-radius:10px; width:38px; height:38px; display:flex; align-items:center; justify-content:center; color:var(--ink-soft); transition:border-color .2s ease, color .2s ease, transform .15s cubic-bezier(.22,1,.36,1);}
.icon-btn:hover{border-color:var(--primary); color:var(--primary); transform:translateY(-1px);}
.notif-dot{position:absolute; top:8px; right:9px; width:6px; height:6px; border-radius:50%; background:var(--danger);}
.notif-dot::after{content:''; position:absolute; inset:0; border-radius:50%; background:var(--danger); animation:ping 1.8s cubic-bezier(0,0,.2,1) infinite;}
@keyframes ping{0%{transform:scale(1); opacity:.7;} 75%,100%{transform:scale(2.4); opacity:0;}}
.notif-wrap{position:relative;}
.notif-panel{position:absolute; right:0; top:46px; width:280px; background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:14px; box-shadow:var(--shadow); z-index:30; animation:modalIn .22s cubic-bezier(.22,1,.36,1) both; transform-origin:top right;}
.notif-panel h4{font-size:13px; margin-bottom:10px;}
.notif-item{display:flex; flex-direction:column; gap:2px; padding:8px 0; border-top:1px solid var(--border); font-size:12.5px; color:var(--ink);}
.notif-item:first-of-type{border-top:none;}
.notif-time{font-size:11px; color:var(--ink-faint);}
.tour-btn{background:var(--surface); border:1px solid var(--border); border-radius:10px; width:38px; height:38px; display:flex; align-items:center; justify-content:center; color:var(--ink-soft); transition:border-color .2s ease, color .2s ease, transform .15s cubic-bezier(.22,1,.36,1);}
.tour-btn:hover{color:var(--primary); border-color:var(--primary); transform:translateY(-1px);}

/* buttons */
.btn-primary{position:relative; overflow:hidden; display:inline-flex; align-items:center; gap:8px; background:linear-gradient(135deg, var(--primary), var(--primary-dark)); color:#fff; border:none; padding:10px 16px; border-radius:11px; font-size:13.5px; font-weight:600; box-shadow:0 6px 16px rgba(74,79,224,0.25); white-space:nowrap; transition:transform .18s cubic-bezier(.22,1,.36,1), box-shadow .2s ease;}
.btn-primary::before{content:''; position:absolute; top:0; left:-60%; width:40%; height:100%; background:linear-gradient(120deg, transparent, rgba(255,255,255,.35), transparent); transform:skewX(-18deg); transition:left .6s ease;}
.btn-primary:hover::before{left:130%;}
.btn-primary:hover{transform:translateY(-1px); box-shadow:0 10px 22px rgba(74,79,224,0.32);}
.btn-primary:active{transform:translateY(0) scale(.97);}
.btn-primary:disabled{opacity:.4; box-shadow:none; cursor:not-allowed; transform:none;}
.btn-primary:disabled::before{display:none;}
.btn-primary.lg{padding:13px 20px; font-size:14.5px;}
.btn-primary.sm{padding:7px 11px; font-size:12.5px;}
.btn-ghost{display:inline-flex; align-items:center; gap:6px; background:var(--surface); border:1px solid var(--border); color:var(--ink); padding:10px 16px; border-radius:11px; font-size:13.5px; font-weight:500; transition:border-color .2s ease, color .2s ease, transform .15s cubic-bezier(.22,1,.36,1);}
.btn-ghost.sm{padding:7px 11px; font-size:12.5px;}
.btn-ghost:hover{border-color:var(--primary); color:var(--primary); transform:translateY(-1px);}
.btn-ghost:active{transform:translateY(0) scale(.97);}
.btn-ghost:disabled{opacity:.4; cursor:not-allowed; transform:none;}
.back-btn{margin-bottom:18px;}

/* content */
.content{flex:1; padding:4px 28px 40px;}
.view-fade{animation:viewIn .4s cubic-bezier(.22,1,.36,1) both;}
@keyframes viewIn{from{opacity:0; transform:translateY(10px);} to{opacity:1; transform:translateY(0);}}
.section-head{display:flex; justify-content:space-between; align-items:flex-end; margin:22px 0 18px;}
.section-head h2{font-size:21px; margin-bottom:4px;}

/* stats */
.dash-grid{display:grid; grid-template-columns:1fr 340px; gap:24px; align-items:start;}
.stat-row{display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:6px;}
.stat-card{display:flex; align-items:center; gap:10px; background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:14px 16px; color:var(--teal); animation:cardIn .45s cubic-bezier(.22,1,.36,1) both; transition:transform .2s cubic-bezier(.22,1,.36,1), border-color .2s ease;}
.stat-card:hover{transform:translateY(-2px); border-color:var(--teal);}
.stat-num{font-family:'Fraunces',serif; font-size:19px; font-weight:600; color:var(--ink);}
.stat-label{font-size:11.5px; color:var(--ink-soft);}
@keyframes cardIn{from{opacity:0; transform:translateY(14px);} to{opacity:1; transform:translateY(0);}}

/* case cards */
.case-grid{display:grid; grid-template-columns:1fr 1fr; gap:14px;}
.case-grid.wide{grid-template-columns:1fr 1fr 1fr;}
.case-card{text-align:left; background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:18px; display:flex; flex-direction:column; gap:12px; animation:cardIn .5s cubic-bezier(.22,1,.36,1) both; transition:border-color .2s ease, transform .25s cubic-bezier(.22,1,.36,1), box-shadow .25s cubic-bezier(.22,1,.36,1);}
.case-card:hover{border-color:var(--primary); transform:translateY(-3px); box-shadow:0 16px 32px rgba(0,0,0,0.16);}
.case-top{display:flex; align-items:flex-start; justify-content:space-between; gap:10px;}
.case-who{display:flex; align-items:center; gap:10px;}
.case-who h3{font-size:15px; font-family:'Inter',sans-serif; font-weight:600;}
.case-sub{font-size:12px; color:var(--ink-faint); font-family:'IBM Plex Mono',monospace;}
.avatar{width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:13px; font-weight:700; flex-shrink:0;}
.avatar.lg{width:52px; height:52px; font-size:16px;}
.case-complaint{font-size:13.5px; color:var(--ink-soft); min-height:36px;}
.dx-row{display:flex; align-items:center; justify-content:space-between; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:9px 12px;}
.dx-name{display:flex; align-items:center; gap:7px; font-size:13px; font-weight:600; color:var(--primary);}
.dx-conf{font-family:'IBM Plex Mono',monospace; font-size:13px; font-weight:600; color:var(--ink);}
.progress-row{display:flex; gap:3px;}
.seg{flex:1; height:5px; border-radius:3px; background:var(--border); transition:background .4s ease;}
.seg-done{background:var(--success);}
.seg-active{background:var(--primary);}
.status-row{display:flex; align-items:center; justify-content:space-between;}
.status-pill{display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:500; color:var(--ink-soft);}
.dot{width:6px; height:6px; border-radius:50%; display:inline-block;}
.dot-success{background:var(--success);} .dot-primary{background:var(--primary);} .dot-warn{background:var(--warn);}
.time-stamp{display:flex; align-items:center; gap:4px; font-size:11.5px; color:var(--ink-faint);}

/* pills / badges */
.pill{font-size:11px; font-weight:600; padding:4px 10px; border-radius:999px; white-space:nowrap; font-family:'IBM Plex Mono',monospace;}
.badge-danger{background:var(--danger-bg); color:var(--danger);}
.badge-warn{background:var(--warn-bg); color:var(--warn);}
.badge-flat{background:var(--surface-2); color:var(--ink-soft);}
.badge-conf{background:var(--success-bg); color:var(--success);}
.badge-success{background:var(--success-bg); color:var(--success);}

/* AI insights + activity */
.dash-side{display:flex; flex-direction:column; gap:18px;}
.insights-panel, .activity-panel{background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:18px;}
.panel-head{display:flex; align-items:flex-start; gap:10px; color:var(--violet); margin-bottom:14px;}
.panel-head h3{font-size:15px; color:var(--ink);}
.insight-card{display:flex; gap:10px; padding:12px; border-radius:12px; border-left:3px solid; margin-bottom:10px; background:var(--surface-2); animation:cardIn .5s cubic-bezier(.22,1,.36,1) both; transition:transform .2s cubic-bezier(.22,1,.36,1);}
.insight-card:hover{transform:translateX(2px);}
.insight-card:last-child{margin-bottom:0;}
.insight-card h4{font-size:13px; margin-bottom:4px; font-family:'Inter',sans-serif; color:var(--ink);}
.insight-card p{font-size:12.5px; color:var(--ink-soft);}
.tone-danger,.tone-critical{border-color:var(--danger); color:var(--danger);}
.tone-warn,.tone-warning{border-color:var(--warn); color:var(--warn);}
.tone-success{border-color:var(--success); color:var(--success);}
.tone-info,.tone-suggestion{border-color:var(--primary); color:var(--primary);}
.activity-panel h3{font-size:15px; margin-bottom:2px;}
.activity-row{display:flex; justify-content:space-between; gap:10px; padding:10px 0; border-top:1px solid var(--border); font-size:12.5px; color:var(--ink);}
.activity-row:first-of-type{border-top:none; margin-top:10px;}

/* intake */
.intake-wrap{display:flex; justify-content:center; padding:30px 0;}
.intake-card{width:100%; max-width:620px; background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:30px; animation:cardIn .45s cubic-bezier(.22,1,.36,1) both;}
.eyebrow{display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:600; color:var(--primary); background:var(--surface-2); padding:5px 10px; border-radius:999px; margin-bottom:14px; text-transform:uppercase; letter-spacing:.04em; font-family:'IBM Plex Mono',monospace;}
.intake-card h2{font-size:23px; margin-bottom:18px;}
.intake-fields{display:grid; grid-template-columns:1fr 90px 110px; gap:10px; margin-bottom:14px;}
.field{display:flex; flex-direction:column; gap:5px; font-size:11.5px; color:var(--ink-faint); font-weight:600; text-transform:uppercase; letter-spacing:.03em;}
.field input, .field select, .field textarea{border:1px solid var(--border); border-radius:10px; padding:9px 11px; font-size:13.5px; background:var(--surface-2); color:var(--ink); transition:border-color .2s ease, box-shadow .2s ease; font-family:'Inter',sans-serif; text-transform:none; letter-spacing:normal; font-weight:400;}
.symptom-input{width:100%; border:1px solid var(--border); border-radius:12px; padding:14px; font-family:'Inter',sans-serif; font-size:14px; resize:vertical; background:var(--surface-2); margin-bottom:14px; color:var(--ink); transition:border-color .2s ease, box-shadow .2s ease;}
.symptom-input:focus, .field input:focus, .field select:focus, .field textarea:focus{outline:none; border-color:var(--primary); box-shadow:0 0 0 3px rgba(91,127,255,0.14);}
.chip-row{display:flex; flex-wrap:wrap; gap:8px; margin-bottom:22px;}
.chip{display:inline-flex; align-items:center; gap:4px; border:1px solid var(--border); background:var(--surface-2); color:var(--ink-soft); padding:7px 12px; border-radius:999px; font-size:12.5px; font-weight:500; transition:border-color .15s ease, color .15s ease, transform .15s cubic-bezier(.22,1,.36,1);}
.chip:hover{transform:translateY(-1px);}
.chip-active{border-color:var(--primary); color:var(--primary); background:var(--danger-bg);}

/* analyzing overlay */
.analyzing-card{background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:40px; display:flex; flex-direction:column; align-items:center; gap:20px; box-shadow:var(--shadow); animation:modalIn .3s cubic-bezier(.22,1,.36,1) both;}
.ring-wrap{position:relative; width:110px; height:110px; display:flex; align-items:center; justify-content:center;}
.ring{position:absolute; inset:0; border-radius:50%; border:1.5px solid var(--primary); opacity:0; animation:ringExpand 2.4s ease-out infinite;}
.ring.r2{animation-delay:.8s;} .ring.r3{animation-delay:1.6s;}
@keyframes ringExpand{0%{transform:scale(.45); opacity:.65;} 100%{transform:scale(1.45); opacity:0;}}
.analyzing-text{font-family:'IBM Plex Mono',monospace; font-size:12.5px; color:var(--ink-soft); animation:fadeCycle .35s ease both;}
@keyframes fadeCycle{from{opacity:0; transform:translateY(4px);} to{opacity:1; transform:translateY(0);}}

/* case detail */
.case-detail{max-width:1080px; margin:0 auto; padding-top:20px;}
.case-detail-head{display:flex; align-items:center; gap:14px; background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:18px 20px; margin-bottom:16px; animation:cardIn .4s cubic-bezier(.22,1,.36,1) both; flex-wrap:wrap;}
.case-detail-info{flex:1; min-width:200px;}
.case-detail-info h2{font-size:19px;}
.case-vitals-row{display:flex; flex-wrap:wrap; gap:8px; width:100%;}
.vital-chip{font-size:11.5px; background:var(--surface-2); border:1px solid var(--border); color:var(--ink-soft); padding:4px 10px; border-radius:8px; font-family:'IBM Plex Mono',monospace;}
.result-list{display:flex; flex-direction:column; gap:12px; margin-bottom:28px;}
.result-card{background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:18px; animation:cardIn .45s cubic-bezier(.22,1,.36,1) both; transition:border-color .2s ease, transform .2s cubic-bezier(.22,1,.36,1);}
.result-card:hover{border-color:var(--primary); transform:translateY(-2px);}
.result-card-top{display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:8px; flex-wrap:wrap;}
.result-card-top h3{font-size:15.5px;}
.result-blurb{font-size:13.5px; color:var(--ink-soft); margin-bottom:10px;}
.tag-row{display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;}
.tag{font-size:11px; background:var(--surface-2); color:var(--ink-soft); padding:4px 9px; border-radius:6px; font-family:'IBM Plex Mono',monospace;}
.result-next{font-size:13px; color:var(--ink);}
.refine-block{background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:20px; animation:cardIn .5s cubic-bezier(.22,1,.36,1) both;}
.refine-block h3{font-size:15px; margin-bottom:12px;}
.refine-log{display:flex; flex-direction:column; gap:8px; margin-bottom:14px; max-height:320px; overflow-y:auto;}
.refine-msg{font-size:13px; padding:9px 12px; border-radius:10px; max-width:80%; animation:cardIn .3s cubic-bezier(.22,1,.36,1) both;}
.from-user{align-self:flex-end; background:var(--surface-2); color:var(--ink);}
.from-aura{align-self:flex-start; background:var(--danger-bg); color:var(--ink-soft);}
.from-doctor{align-self:flex-end; background:var(--surface-2); color:var(--ink);}
.from-system{align-self:center; background:none; color:var(--ink-faint); font-style:italic; font-size:12px;}
.refine-row{display:flex; gap:8px;}
.refine-row input{flex:1; border:1px solid var(--border); border-radius:11px; padding:11px 13px; font-size:13.5px; background:var(--surface-2); color:var(--ink); transition:border-color .2s ease, box-shadow .2s ease;}
.refine-row input:focus{outline:none; border-color:var(--primary); box-shadow:0 0 0 3px rgba(91,127,255,0.14);}

/* case tabs */
.case-layout{display:grid; grid-template-columns:1fr 300px; gap:20px; align-items:start;}
.case-layout.no-assistant{grid-template-columns:1fr;}
.case-main{min-width:0;}
.tab-bar{display:flex; flex-wrap:wrap; gap:4px; background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:5px; margin-bottom:18px;}
.tab-btn{flex:1; min-width:110px; text-align:center; background:none; border:none; padding:9px 10px; border-radius:10px; font-size:12.5px; font-weight:600; color:var(--ink-soft); transition:background .15s ease, color .15s ease;}
.tab-btn:hover{color:var(--ink); background:var(--surface-2);}
.tab-btn.is-active{color:#fff; background:linear-gradient(135deg, var(--primary), var(--primary-dark));}
.tab-panel{animation:viewIn .3s cubic-bezier(.22,1,.36,1) both;}

/* generic cards used across lifecycle tabs */
.lc-card{background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:16px 18px; margin-bottom:12px; animation:cardIn .4s cubic-bezier(.22,1,.36,1) both;}
.lc-card-head{display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px; flex-wrap:wrap;}
.lc-card-head h4{font-size:14.5px;}
.lc-row{display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:10px;}
.lc-field{flex:1; min-width:140px; display:flex; flex-direction:column; gap:4px;}
.lc-field label{font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink-faint); font-weight:600;}
.lc-field input, .lc-field select, .lc-field textarea{border:1px solid var(--border); border-radius:9px; padding:7px 9px; font-size:13px; background:var(--surface-2); color:var(--ink);}
.section-title{font-size:16px; margin:22px 0 12px;}
.section-title:first-child{margin-top:0;}
.empty-hint{font-size:13px; color:var(--ink-faint); padding:14px 0;}

/* key/value grid (vitals, history) */
.kv-grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; margin-bottom:16px;}
.kv-cell{background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:9px 11px;}
.kv-cell .kv-label{font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink-faint); font-weight:600; margin-bottom:2px;}
.kv-cell .kv-value{font-size:13.5px; color:var(--ink); font-family:'IBM Plex Mono',monospace;}

/* progress stepper */
.stepper{display:flex; flex-wrap:wrap; gap:6px; margin-bottom:18px;}
.step-pill{display:flex; align-items:center; gap:6px; font-size:11.5px; padding:6px 11px; border-radius:999px; background:var(--surface-2); color:var(--ink-faint); border:1px solid var(--border);}
.step-pill.step-done{background:var(--success-bg); color:var(--success); border-color:transparent;}
.step-pill.step-active{background:var(--primary); color:#fff; border-color:transparent;}

/* audit table */
.audit-table{width:100%; border-collapse:collapse; font-size:12.5px;}
.audit-table th{text-align:left; padding:8px 10px; color:var(--ink-faint); font-weight:600; text-transform:uppercase; font-size:10.5px; letter-spacing:.03em; border-bottom:1px solid var(--border);}
.audit-table td{padding:9px 10px; border-bottom:1px solid var(--border); color:var(--ink); vertical-align:top;}

/* error banner + loading */
.error-banner{display:flex; align-items:flex-start; gap:10px; background:var(--danger-bg); border:1px solid var(--danger); color:var(--danger); border-radius:12px; padding:12px 14px; margin-bottom:14px; font-size:13px;}
.error-banner button{margin-left:auto; background:none; border:none; color:inherit; flex-shrink:0;}
.loading-hint{font-size:12.5px; color:var(--ink-faint); font-family:'IBM Plex Mono',monospace;}
.skeleton-grid{display:grid; grid-template-columns:1fr 1fr; gap:14px;}
.skeleton-card{height:150px; border-radius:16px; background:linear-gradient(90deg, var(--surface) 25%, var(--surface-2) 37%, var(--surface) 63%); background-size:400% 100%; animation:shimmer 1.4s ease infinite;}
@keyframes shimmer{0%{background-position:100% 0;} 100%{background-position:0 0;}}

/* login */
.login-shell{min-height:100vh; display:flex; align-items:center; justify-content:center; background:var(--bg); color:var(--ink); font-family:'Inter',sans-serif; position:relative;}
.login-card{width:100%; max-width:380px; background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:34px; animation:cardIn .45s cubic-bezier(.22,1,.36,1) both; position:relative; z-index:1;}
.login-card h2{font-size:22px; margin:14px 0 4px;}
.login-card .muted{margin-bottom:22px; display:block;}
.login-fields{display:flex; flex-direction:column; gap:14px; margin-bottom:18px;}

/* knowledge / faq */
.knowledge-view, .settings-view{max-width:680px; margin:0 auto; padding-top:24px;}
.knowledge-view h2, .settings-view h2{font-size:24px; margin-bottom:6px;}
.faq-list{display:flex; flex-direction:column; gap:10px;}
.faq-item{border:1px solid var(--border); border-radius:12px; background:var(--surface); overflow:hidden; animation:cardIn .4s cubic-bezier(.22,1,.36,1) both;}
.faq-q{width:100%; display:flex; align-items:center; gap:10px; background:none; border:none; padding:15px 16px; text-align:left; font-size:13.5px; font-weight:600; color:var(--ink);}
.faq-q .chev{margin-left:auto; transition:transform .25s cubic-bezier(.22,1,.36,1); color:var(--ink-faint);}
.faq-item.is-open .chev{transform:rotate(90deg); color:var(--primary);}
.faq-a-wrap{display:grid; grid-template-rows:0fr; transition:grid-template-rows .32s cubic-bezier(.22,1,.36,1);}
.faq-item.is-open .faq-a-wrap{grid-template-rows:1fr;}
.faq-a-inner{overflow:hidden;}
.faq-a{padding:0 16px 16px; font-size:13.5px; color:var(--ink-soft);}

.settings-card{background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:8px 20px;}
.settings-row{display:flex; align-items:center; gap:12px; padding:14px 0; border-top:1px solid var(--border); color:var(--primary);}
.settings-row:first-child{border-top:none;}
.settings-label{font-size:13.5px; font-weight:600; color:var(--ink);}

/* modal */
.modal-backdrop{position:fixed; inset:0; background:rgba(5,6,10,0.6); backdrop-filter:blur(2px); display:flex; align-items:center; justify-content:center; z-index:60; padding:20px; animation:backdropIn .25s ease both;}
@keyframes backdropIn{from{opacity:0;} to{opacity:1;}}
.modal-card{background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:30px; max-width:380px; text-align:center; display:flex; flex-direction:column; align-items:center; gap:12px; box-shadow:var(--shadow); animation:modalIn .3s cubic-bezier(.22,1,.36,1) both;}
@keyframes modalIn{from{opacity:0; transform:scale(.94) translateY(8px);} to{opacity:1; transform:scale(1) translateY(0);}}
.modal-card h3{font-size:20px;}
.modal-card p{font-size:14px; color:var(--ink-soft);}
.modal-actions{display:flex; gap:10px; margin-top:8px;}

/* tour */
.tour-block{position:fixed; inset:0; z-index:70; background:transparent;}
.tour-spot{position:fixed; z-index:71; border-radius:14px; border:2px solid var(--teal); transition:top .35s cubic-bezier(.22,1,.36,1), left .35s cubic-bezier(.22,1,.36,1), width .35s cubic-bezier(.22,1,.36,1), height .35s cubic-bezier(.22,1,.36,1); pointer-events:none; animation:spotGlow 1.8s ease-in-out infinite;}
@keyframes spotGlow{0%,100%{box-shadow:0 0 0 9999px rgba(4,5,9,0.78), 0 0 0 0 rgba(var(--teal-rgb),.55);} 50%{box-shadow:0 0 0 9999px rgba(4,5,9,0.78), 0 0 20px 4px rgba(var(--teal-rgb),.5);}}
.tour-tip{position:fixed; z-index:72; width:320px; background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:18px; box-shadow:var(--shadow); transition:top .35s cubic-bezier(.22,1,.36,1), left .35s cubic-bezier(.22,1,.36,1); animation:tipIn .28s cubic-bezier(.22,1,.36,1) both;}
@keyframes tipIn{from{opacity:0; transform:scale(.96) translateY(4px);} to{opacity:1; transform:scale(1) translateY(0);}}
.tour-tip-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;}
.tour-step-count{font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--ink-faint); text-transform:uppercase; letter-spacing:.04em;}
.tour-close{background:none; border:none; color:var(--ink-faint); padding:2px;}
.tour-tip h4{font-size:16px; margin-bottom:6px;}
.tour-tip p{font-size:13px; color:var(--ink-soft); margin-bottom:16px;}
.tour-tip-foot{display:flex; align-items:center; justify-content:space-between; gap:10px;}
.tour-dots{display:flex; gap:5px;}
.dot-i{width:5px; height:5px; border-radius:50%; background:var(--border); transition:width .2s ease, background .2s ease;}
.dot-i-active{background:var(--primary); width:14px; border-radius:3px;}
.tour-nav-btns{display:flex; gap:6px;}

@media (max-width: 900px){
  .sidebar{display:none;}
  .dash-grid{grid-template-columns:1fr;}
  .case-grid, .case-grid.wide{grid-template-columns:1fr;}
  .stat-row{grid-template-columns:1fr 1fr;}
  .intake-fields{grid-template-columns:1fr;}
  .tour-tip{width:calc(100vw - 32px);}
  .case-layout{grid-template-columns:1fr;}
}

/* --------------------------------------------------------------------------
   Product navigation: a horizontal, clinical-product header.  This replaces
   the old vertical dashboard rail while keeping every existing destination.
   -------------------------------------------------------------------------- */
.app-shell{display:block; overflow-x:hidden;}
.sidebar{
  width:100%; height:76px; min-height:76px; padding:0 clamp(18px,4vw,64px);
  position:sticky; top:0; z-index:40; flex-direction:row; align-items:center;
  gap:8px; background:color-mix(in srgb, var(--sidebar-bg) 87%, transparent);
  border-right:0; border-bottom:1px solid var(--border); box-shadow:0 1px 0 rgba(255,255,255,.04);
  backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px);
  animation:headerIn .7s cubic-bezier(.22,1,.36,1) both;
}
@keyframes headerIn{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}
.sidebar::after{content:''; position:absolute; inset:auto 0 0; height:1px; background:linear-gradient(90deg,transparent,var(--primary),var(--teal),transparent); opacity:.42;}
.sidebar-brand{flex:0 0 auto; padding:0 30px 0 0; gap:10px; background:none!important;}
.sidebar-brand .brand-word{font-size:20px; letter-spacing:-.035em;}
.sidebar-brand .brand-sub{display:none;}
.side-block{display:contents; margin:0;}
.side-label{display:none;}
.side-section{flex:0 0 auto; flex-direction:row; align-items:center; gap:3px;}
.side-indicator{display:none;}
.side-link{padding:9px 11px; border-radius:999px; gap:7px; white-space:nowrap; font-size:13px; color:var(--ink-soft);}
.side-link:hover{background:var(--surface-2); color:var(--ink); transform:translateY(-1px);}
.side-link.is-active{color:var(--ink); background:var(--surface-2); box-shadow:inset 0 0 0 1px var(--border);}
.side-link.is-active::after{content:''; width:4px; height:4px; border-radius:50%; background:var(--teal); box-shadow:0 0 10px var(--teal);}
.side-link .count{margin-left:1px; padding:1px 6px; color:var(--primary); background:var(--danger-bg);}
.sidebar-bottom{margin:0 0 0 auto; padding:0; border:0; flex:0 0 auto; flex-direction:row; align-items:center; gap:4px;}
.sidebar-bottom .side-link{padding:9px 10px;}
.sidebar-bottom .profile-card,.sidebar-bottom .disclaimer-mini{display:none;}
.mobile-nav-trigger{display:none;}
.main-col{display:block; width:100%;}
.topbar{max-width:1440px; margin:0 auto; padding:18px clamp(18px,4vw,64px) 10px; gap:16px;}
.topbar.is-scrolled{background:color-mix(in srgb, var(--bg) 84%, transparent); border-color:var(--border); box-shadow:none;}
.content{max-width:1440px; margin:0 auto; padding:4px clamp(18px,4vw,64px) 48px;}
.search-bar{max-width:460px; background:color-mix(in srgb,var(--surface) 84%,transparent);}
.topbar-right{gap:8px;}
.btn-primary{border-radius:999px; padding:10px 17px;}
.icon-btn,.tour-btn{border-radius:999px; background:color-mix(in srgb,var(--surface) 84%,transparent);}
.ambient-blobs{opacity:.82;}
.case-card,.stat-card,.insights-panel,.activity-panel,.intake-card,.result-card,.refine-block,.login-card,.lc-card{backdrop-filter:blur(10px);}

@media (max-width: 1120px){
  .sidebar{padding-inline:24px; gap:2px;}
  .sidebar-brand{padding-right:14px;}
  .side-link{padding-inline:8px; font-size:12px;}
  .topbar{padding-inline:24px;}
  .content{padding-inline:24px;}
  .search-bar{max-width:340px;}
}
@media (max-width: 900px){
  .sidebar{display:flex; height:64px; min-height:64px; overflow:visible; padding:0 16px; gap:5px; transition:height .28s cubic-bezier(.22,1,.36,1);}
  .sidebar-brand{padding-right:8px;}
  .sidebar-brand .aura-mark{width:30px!important; height:30px!important;}
  .sidebar .side-block{display:none; position:absolute; left:12px; right:12px; z-index:4;}
  .sidebar.mobile-open{height:206px; align-items:flex-start; padding-top:15px;}
  .sidebar.mobile-open .side-block{display:block;}
  .sidebar.mobile-open .side-block:nth-of-type(2){top:63px;}
  .sidebar.mobile-open .side-block:nth-of-type(3){top:146px;}
  .sidebar.mobile-open .side-section{display:flex; flex-direction:row; flex-wrap:wrap; align-items:center; gap:4px;}
  .sidebar.mobile-open .side-link{padding:8px 10px; font-size:12px; background:var(--surface); border:1px solid var(--border); box-shadow:0 8px 20px rgba(0,0,0,.12);}
  .sidebar-bottom{display:none;}
  .mobile-nav-trigger{display:flex; align-items:center; justify-content:center; margin-left:auto; width:36px; height:36px; border:1px solid var(--border); border-radius:50%; color:var(--ink); background:var(--surface);}
  .dash-grid{grid-template-columns:1fr;}
  .case-grid,.case-grid.wide{grid-template-columns:1fr;}
  .topbar{padding:14px 16px 8px;}
  .content{padding:4px 16px 36px;}
}
@media (max-width: 620px){
  .sidebar{min-height:62px; height:62px;}
  .sidebar-brand{padding-right:4px;}
  .sidebar-brand .brand-word{font-size:18px;}
  .sidebar.mobile-open{height:206px;}
  .topbar{flex-wrap:wrap; gap:9px;}
  .search-bar{order:2; flex-basis:100%; max-width:none; padding:9px 12px;}
  .topbar-right{margin-left:0;}
  .header-case-btn{padding-inline:13px;}
  .stat-row{grid-template-columns:1fr 1fr;}
  .section-head{margin-top:16px;}
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important; animation-iteration-count:1!important; scroll-behavior:auto!important; transition-duration:.01ms!important;}
}
`;
