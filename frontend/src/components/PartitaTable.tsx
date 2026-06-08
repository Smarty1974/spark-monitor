import { useState, useEffect, useRef, ReactNode, Fragment } from 'react'

export interface ColumnConfig<T> {
  key: string
  label: string
  width?: number
  flex?: number
  align?: 'left' | 'right'
  render: (row: T) => ReactNode
  sortValue?: (row: T) => string | number | null | undefined
}

interface Props<T> {
  rows: T[]
  columns: ColumnConfig<T>[]
  getRowId: (row: T) => string
  renderDetail?: (row: T) => ReactNode
  emptyMessage?: string
  focusId?: string | null
}

export function PartitaTable<T>({
  rows, columns, getRowId, renderDetail,
  emptyMessage = 'Nessun risultato.', focusId,
}: Props<T>) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey]   = useState<string | null>(null)
  const [sortDir, setSortDir]   = useState<'asc' | 'desc' | null>(null)
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})

  useEffect(() => {
    if (!focusId) return
    setExpanded(e => new Set([...e, focusId]))
    setTimeout(() => {
      rowRefs.current[focusId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
  }, [focusId])

  const sorted = [...rows].sort((a, b) => {
    if (!sortKey || !sortDir) return 0
    const col = columns.find(c => c.key === sortKey)
    if (!col?.sortValue) return 0
    const va = col.sortValue(a) ?? ''
    const vb = col.sortValue(b) ?? ''
    const cmp = va < vb ? -1 : va > vb ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  function toggleSort(key: string) {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc') }
    else if (sortDir === 'asc') setSortDir('desc')
    else { setSortKey(null); setSortDir(null) }
  }

  function toggleRow(id: string) {
    setExpanded(e => {
      const n = new Set(e)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const hasDetail = !!renderDetail
  const colSpan   = columns.length + (hasDetail ? 1 : 0)

  return (
    <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e0e0e0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0e0e0' }}>
            {hasDetail && <th style={{ width: 28 }} />}
            {columns.map(col => (
              <th key={col.key}
                onClick={() => col.sortValue && toggleSort(col.key)}
                style={{
                  padding: '8px 10px', textAlign: col.align ?? 'left', fontSize: 10,
                  fontWeight: 700, letterSpacing: '0.06em', color: '#555',
                  textTransform: 'uppercase', whiteSpace: 'nowrap',
                  cursor: col.sortValue ? 'pointer' : 'default', userSelect: 'none',
                }}>
                {col.label}
                {col.sortValue && (
                  <span style={{ marginLeft: 3, color: sortKey === col.key ? 'var(--color-accent,#1565c0)' : '#bbb' }}>
                    {sortKey === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={colSpan}
                style={{ textAlign: 'center', padding: 32, color: '#aaa', fontStyle: 'italic' }}>
                {emptyMessage}
              </td>
            </tr>
          )}
          {sorted.map(row => {
            const id   = getRowId(row)
            const isEx = expanded.has(id)
            return (
              <Fragment key={id}>
                <tr
                  ref={(el: HTMLTableRowElement | null) => { rowRefs.current[id] = el }}
                  style={{
                    borderBottom: '1px solid #f0f0f0',
                    background: focusId === id ? '#e3f2fd' : isEx ? '#fafafa' : undefined,
                  }}>
                  {hasDetail && (
                    <td style={{ padding: '6px 8px 6px 10px', width: 28 }}>
                      <button onClick={() => toggleRow(id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 12, color: '#aaa', padding: 2 }}>
                        {isEx ? '▼' : '▶'}
                      </button>
                    </td>
                  )}
                  {columns.map(col => (
                    <td key={col.key}
                      style={{ padding: '6px 10px', textAlign: col.align ?? 'left', maxWidth: col.width }}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
                {isEx && renderDetail && (
                  <tr style={{ background: '#fafafa', borderBottom: '1px solid #e8e8e8' }}>
                    <td colSpan={colSpan} style={{ padding: '12px 20px 16px 28px' }}>
                      {renderDetail(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
