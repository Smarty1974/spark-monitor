import React from 'react'

// ── Tipi ────────────────────────────────────────────────────────────────────
export type Tone = 'blue'|'teal'|'orange'|'gray'|'purple'|'red'|'green'|'amber'
export type BatchState = 'FILE_RECEIVED'|'SPARK_SUBMITTED'|'COMPLETED'|'FAILED'

export const STATE_CONFIG: Record<BatchState,{label:string;tone:Tone;icon:string}> = {
  FILE_RECEIVED:   {label:'File Ricevuto', tone:'blue',   icon:'📥'},
  SPARK_SUBMITTED: {label:'Spark Avviato', tone:'orange', icon:'⚡'},
  COMPLETED:       {label:'Completato',    tone:'green',  icon:'✅'},
  FAILED:          {label:'Fallito',       tone:'red',    icon:'❌'},
}

// ── PvBadge ─────────────────────────────────────────────────────────────────
const TONES: Record<Tone,{bg:string;color:string;border:string}> = {
  blue:   {bg:'#e3f2fd',color:'#1565c0',border:'#90caf9'},
  teal:   {bg:'#e0f2f1',color:'#00695c',border:'#80cbc4'},
  orange: {bg:'#fff3e0',color:'#e65100',border:'#ffcc80'},
  gray:   {bg:'#f5f5f5',color:'#555',   border:'#ccc'},
  purple: {bg:'#f3e5f5',color:'#6a1b9a',border:'#ce93d8'},
  red:    {bg:'#ffebee',color:'#b71c1c',border:'#ef9a9a'},
  green:  {bg:'#e8f5e9',color:'#1b5e20',border:'#a5d6a7'},
  amber:  {bg:'#fffde7',color:'#f57f17',border:'#ffe082'},
}

export function PvBadge({tone='gray',children}:{tone?:Tone;children:React.ReactNode}) {
  const s = TONES[tone]
  return (
    <span style={{display:'inline-block',padding:'2px 8px',borderRadius:4,
      fontSize:11,fontWeight:600,letterSpacing:'0.02em',whiteSpace:'nowrap',
      background:s.bg,color:s.color,border:`1px solid ${s.border}`}}>
      {children}
    </span>
  )
}

export function StateBadge({state}:{state:string}) {
  const cfg = STATE_CONFIG[state as BatchState]
  if (!cfg) return <PvBadge tone="gray">{state}</PvBadge>
  return <PvBadge tone={cfg.tone}>{cfg.icon} {cfg.label}</PvBadge>
}

// ── MetricTile ───────────────────────────────────────────────────────────────
const TILE_PALETTE: Record<string,{accent:string;bg:string}> = {
  blue:   {accent:'#1565c0',bg:'#e3f2fd'},
  green:  {accent:'#1b5e20',bg:'#e8f5e9'},
  red:    {accent:'#b71c1c',bg:'#ffebee'},
  orange: {accent:'#e65100',bg:'#fff3e0'},
  gray:   {accent:'#555',   bg:'#f5f5f5'},
}

export function MetricTile({label,value,sub,tone='blue'}:
  {label:string;value:string|number;sub?:string;tone?:string}) {
  const t = TILE_PALETTE[tone]??TILE_PALETTE.blue
  return (
    <div style={{background:'#fff',border:'1px solid #e0e0e0',borderRadius:8,
      padding:'16px 20px',borderTop:`3px solid ${t.accent}`}}>
      <div style={{fontSize:11,color:'#888',textTransform:'uppercase',
        letterSpacing:'0.06em',marginBottom:4}}>{label}</div>
      <div style={{fontSize:30,fontWeight:700,color:t.accent,lineHeight:1.1}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:'#aaa',marginTop:4}}>{sub}</div>}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export function fmtN(v?:number|null):string {
  if(v==null) return '—'
  return new Intl.NumberFormat('it-IT').format(v)
}
export function fmtPct(v?:number|null):string {
  if(v==null) return '—'
  return v.toFixed(1)+'%'
}
export function fmtDate(v?:string|null):string {
  if(!v) return '—'
  try { return new Date(v).toLocaleString('it-IT',{dateStyle:'short',timeStyle:'short'}) }
  catch { return v }
}

// ── Drawer ───────────────────────────────────────────────────────────────────
export function Drawer({title,onClose,children}:
  {title:string;onClose:()=>void;children:React.ReactNode}) {
  return (
    <div style={{position:'fixed',inset:0,zIndex:1300,display:'flex'}}>
      <div style={{flex:1,background:'rgba(0,0,0,.35)'}} onClick={onClose}/>
      <div style={{width:520,background:'#fff',height:'100%',overflowY:'auto',
        boxShadow:'-4px 0 24px rgba(0,0,0,.15)',display:'flex',flexDirection:'column'}}>
        <div style={{padding:'20px 24px',borderBottom:'1px solid #eee',
          display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <strong style={{fontSize:15}}>{title}</strong>
          <button onClick={onClose} style={{background:'none',border:'none',
            cursor:'pointer',fontSize:22,color:'#888',lineHeight:1}}>×</button>
        </div>
        <div style={{padding:'20px 24px',flex:1}}>{children}</div>
      </div>
    </div>
  )
}

// ── DetailRow ─────────────────────────────────────────────────────────────────
export function DetailRow({label,value,mono}:
  {label:string;value?:React.ReactNode;mono?:boolean}) {
  return (
    <div style={{display:'flex',gap:12,padding:'6px 0',
      borderBottom:'1px solid #f5f5f5',alignItems:'baseline'}}>
      <span style={{fontSize:11,color:'#888',minWidth:180,
        textTransform:'uppercase',letterSpacing:'0.04em',flexShrink:0}}>{label}</span>
      <span style={{fontSize:13,color:'#222',
        fontFamily:mono?'monospace':undefined,wordBreak:'break-all'}}>{value??'—'}</span>
    </div>
  )
}

// ── Field ─────────────────────────────────────────────────────────────────────
export function Field({label,value,wide}:
  {label:string;value?:React.ReactNode;wide?:boolean}) {
  return (
    <div className={`partitaField${wide?' wide':''}`}>
      <span className="pfLabel">{label}</span>
      <span className="pfValue">{value??'—'}</span>
    </div>
  )
}
