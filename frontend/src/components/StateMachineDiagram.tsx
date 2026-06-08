import { useState } from 'react'
import type { BatchState } from './DesignSystem'

const NODES = [
  {id:'FILE_RECEIVED'  ,x:60 ,y:140,label:'File Ricevuto'  ,icon:'📥',color:'#1565c0'},
  {id:'SPARK_SUBMITTED',x:310,y:140,label:'Spark Avviato'  ,icon:'⚡',color:'#e65100'},
  {id:'COMPLETED'      ,x:560,y:70 ,label:'Completato'     ,icon:'✅',color:'#1b5e20'},
  {id:'FAILED'         ,x:560,y:220,label:'Fallito'        ,icon:'❌',color:'#b71c1c'},
] as const

const EDGES = [
  {f:'FILE_RECEIVED'  ,t:'SPARK_SUBMITTED',lbl:'Submit Spark'    ,trigger:'Trigger GCS/S3/Manuale',dash:false},
  {f:'SPARK_SUBMITTED',t:'COMPLETED'      ,lbl:'GCP: SUCCEEDED'  ,trigger:'Scheduler 30s',dash:false},
  {f:'SPARK_SUBMITTED',t:'FAILED'         ,lbl:'GCP: FAILED/CANC',trigger:'Scheduler 30s',dash:false},
  {f:'SPARK_SUBMITTED',t:'FAILED'         ,lbl:'Timeout 2h'      ,trigger:'Circuit Breaker',dash:true},
  {f:'FAILED'         ,t:'FILE_RECEIVED'  ,lbl:'Resubmit'        ,trigger:'Manuale',dash:true},
]

const NW=120, NH=60

function nodeCenter(id:string){
  const n = NODES.find(n=>n.id===id)!
  return {cx:n.x+NW/2, cy:n.y+NH/2}
}

function edgePts(from:string,to:string){
  const {cx:fx,cy:fy}=nodeCenter(from)
  const {cx:tx,cy:ty}=nodeCenter(to)
  const dx=tx-fx, dy=ty-fy, len=Math.sqrt(dx*dx+dy*dy)||1
  return {
    x1:fx+(dx/len)*(NW/2+4), y1:fy+(dy/len)*(NH/2+4),
    x2:tx-(dx/len)*(NW/2+14),y2:ty-(dy/len)*(NH/2+14),
  }
}

interface Props { activeState?:BatchState|null; onStateClick?:(s:BatchState)=>void }

export function StateMachineDiagram({activeState,onStateClick}:Props) {
  const [hov,setHov] = useState<string|null>(null)

  return (
    <div style={{background:'#fafafa',borderRadius:8,border:'1px solid #e0e0e0',padding:16}}>
      <div style={{fontSize:11,fontWeight:700,color:'#888',letterSpacing:'0.06em',
        textTransform:'uppercase',marginBottom:8}}>State Machine — ciclo di vita batch</div>
      <svg width="740" height="310" style={{maxWidth:'100%',display:'block'}}>
        <defs>
          {['#555','#e65100'].map(c=>(
            <marker key={c} id={`arr${c.replace('#','')}`}
              markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill={c}/>
            </marker>
          ))}
        </defs>

        {EDGES.map((e,i)=>{
          const {x1,y1,x2,y2}=edgePts(e.f,e.t)
          const col=e.dash?'#e65100':'#555'
          const mx=(x1+x2)/2, my=(y1+y2)/2
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={col} strokeWidth={1.5}
                strokeDasharray={e.dash?'5,4':undefined}
                markerEnd={`url(#arr${col.replace('#','')})`}/>
              <text x={mx} y={my-5} textAnchor="middle"
                fontSize={9} fill={col} fontWeight={600}>{e.lbl}</text>
            </g>
          )
        })}

        {NODES.map(n=>{
          const active=activeState===n.id, hover=hov===n.id
          return (
            <g key={n.id} style={{cursor:onStateClick?'pointer':'default'}}
              onClick={()=>onStateClick?.(n.id as BatchState)}
              onMouseEnter={()=>setHov(n.id)} onMouseLeave={()=>setHov(null)}>
              <rect x={n.x} y={n.y} width={NW} height={NH} rx={8}
                fill={active?n.color:'#fff'} stroke={n.color}
                strokeWidth={active||hover?3:1.5}/>
              <text x={n.x+NW/2} y={n.y+22} textAnchor="middle" fontSize={16}>{n.icon}</text>
              <text x={n.x+NW/2} y={n.y+44} textAnchor="middle"
                fontSize={10} fontWeight={600} fill={active?'#fff':n.color}>{n.label}</text>
            </g>
          )
        })}

        <g transform="translate(20,280)">
          <line x1={0} y1={8} x2={28} y2={8} stroke="#555" strokeWidth={1.5}/>
          <text x={33} y={12} fontSize={9} fill="#555">Automatica</text>
          <line x1={110} y1={8} x2={138} y2={8} stroke="#e65100" strokeWidth={1.5} strokeDasharray="5,4"/>
          <text x={143} y={12} fontSize={9} fill="#e65100">Timeout / Manuale</text>
        </g>
      </svg>

      <div style={{marginTop:8,display:'flex',gap:8,flexWrap:'wrap'}}>
        {EDGES.map((e,i)=>(
          <span key={i} style={{fontSize:10,color:'#888',background:'#f5f5f5',
            padding:'2px 8px',borderRadius:4}}>
            <strong style={{color:e.dash?'#e65100':'#555'}}>{e.lbl}</strong>
            {' → '}<span style={{color:'#aaa'}}>{e.trigger}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
