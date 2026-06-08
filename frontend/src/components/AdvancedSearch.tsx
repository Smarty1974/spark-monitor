import { useState } from 'react'

export type FieldType = 'text'|'select'|'number'|'date'
export interface SelectOption { value:string; label:string }
export interface FieldDef {
  key:string; label:string; type:FieldType
  options?:SelectOption[]; placeholder?:string
}
export type Criteria = Record<string,{op:string;v:string;v2?:string}>

export function matchAdvanced(row:Record<string,unknown>, criteria:Criteria):boolean {
  for(const [key,crit] of Object.entries(criteria)) {
    if(!crit.v) continue
    const val = row[key]!=null ? String(row[key]) : ''
    const cv  = crit.v.toLowerCase()
    if(crit.op==='eq'       && val.toLowerCase()!==cv)             return false
    if(crit.op==='contains' && !val.toLowerCase().includes(cv))    return false
    if(crit.op==='gte'      && !(parseFloat(val)>=parseFloat(cv))) return false
    if(crit.op==='lte'      && !(parseFloat(val)<=parseFloat(cv))) return false
    if(crit.op==='da'&&crit.v2 && !(val>=crit.v&&val<=crit.v2))   return false
  }
  return true
}

export function activeCount(c:Criteria):number {
  return Object.values(c).filter(x=>x.v).length
}

interface Props {
  fields:FieldDef[]; value:Criteria; onChange:(n:Criteria)=>void
  totalCount?:number; filteredCount?:number; defaultOpen?:boolean; title?:string
}

const OPS_TEXT = [{v:'contains',l:'contiene'},{v:'eq',l:'='}]
const OPS_NUM  = [{v:'eq',l:'='},{v:'gte',l:'≥'},{v:'lte',l:'≤'}]
const OPS_DATE = [{v:'eq',l:'='},{v:'gte',l:'≥'},{v:'lte',l:'≤'},{v:'da',l:'da…a'}]

export function AdvancedSearch({fields,value,onChange,totalCount,filteredCount,
  defaultOpen=false,title='Ricerca avanzata'}:Props) {
  const [open,setOpen] = useState(defaultOpen)
  const active = activeCount(value)

  function set(key:string, patch:Partial<{op:string;v:string;v2:string}>) {
    const cur = value[key]??{op:'contains',v:'',v2:''}
    onChange({...value,[key]:{...cur,...patch}})
  }

  return (
    <div style={{background:'#f9f9f9',border:'1px solid #e0e0e0',borderRadius:8,marginBottom:16}}>
      <div style={{padding:'10px 16px',display:'flex',alignItems:'center',
        justifyContent:'space-between',cursor:'pointer'}} onClick={()=>setOpen(o=>!o)}>
        <span style={{fontWeight:600,fontSize:13}}>
          {title}
          {active>0&&<span style={{marginLeft:8,background:'var(--color-accent,#1565c0)',
            color:'#fff',borderRadius:10,padding:'1px 8px',fontSize:11}}>{active} filtri</span>}
        </span>
        <div style={{display:'flex',gap:12,alignItems:'center'}}>
          {totalCount!=null&&<span style={{fontSize:12,color:'#888'}}>
            {filteredCount??totalCount} / {totalCount}</span>}
          {active>0&&<button onClick={e=>{e.stopPropagation();onChange({})}}
            style={{fontSize:11,color:'#b71c1c',background:'none',border:'none',cursor:'pointer'}}>
            Pulisci</button>}
          <span style={{fontSize:16,color:'#aaa'}}>{open?'▲':'▼'}</span>
        </div>
      </div>
      {open&&(
        <div style={{padding:'12px 16px 16px',borderTop:'1px solid #e8e8e8',
          display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:12}}>
          {fields.map(f=>{
            const cur = value[f.key]??{op:f.type==='number'?'gte':'contains',v:'',v2:''}
            const ops = f.type==='number'?OPS_NUM:f.type==='date'?OPS_DATE:OPS_TEXT
            return (
              <div key={f.key}>
                <label style={{fontSize:11,color:'#666',display:'block',marginBottom:3,
                  fontWeight:600,letterSpacing:'0.04em'}}>{f.label}</label>
                <div style={{display:'flex',gap:4}}>
                  {f.type!=='select'&&(
                    <select value={cur.op} onChange={e=>set(f.key,{op:e.target.value})}
                      style={{fontSize:12,border:'1px solid #ccc',borderRadius:4,
                        padding:'3px 4px',background:'#fff',width:80}}>
                      {ops.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  )}
                  {f.type==='select'?(
                    <select value={cur.v} onChange={e=>set(f.key,{op:'eq',v:e.target.value})}
                      style={{fontSize:12,border:'1px solid #ccc',borderRadius:4,
                        padding:'3px 6px',flex:1,background:'#fff'}}>
                      <option value="">— tutti —</option>
                      {(f.options??[]).map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ):(
                    <input type={f.type==='number'?'number':f.type==='date'?'date':'text'}
                      value={cur.v} placeholder={f.placeholder}
                      onChange={e=>set(f.key,{v:e.target.value})}
                      style={{fontSize:12,border:'1px solid #ccc',borderRadius:4,
                        padding:'3px 6px',flex:1,minWidth:0}}/>
                  )}
                  {cur.op==='da'&&(
                    <input type="date" value={cur.v2??''} onChange={e=>set(f.key,{v2:e.target.value})}
                      style={{fontSize:12,border:'1px solid #ccc',borderRadius:4,
                        padding:'3px 6px',width:110}}/>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
