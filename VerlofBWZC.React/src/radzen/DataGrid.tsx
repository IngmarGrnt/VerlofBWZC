import { useMemo, useState, type ReactNode } from 'react'
import { parseStyle } from './core'

// RadzenDataGrid + RadzenDataGridColumn + RadzenPager (Radzen.Blazor 8), enkel wat de website gebruikt:
// kolommen met Property/Template/Width/Sortable, sorteren (oplopend → aflopend → niet), pagineren en EmptyText.
export interface DataGridColumn<T> {
  // Waarde voor weergave, tooltip (title) en sorteren (zoals Property="..." in Blazor)
  property?: (item: T) => unknown
  title: string
  width?: string
  sortable?: boolean
  // Eigen inhoud (Template); dan geen title-tooltip in de cel
  template?: (item: T) => ReactNode
}

// Zoals de weergave van een Property-waarde in een cel (ToString van .NET)
function display(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  return String(value)
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return String(a).localeCompare(String(b))
}

type SortOrder = 'asc' | 'desc' | null

export function DataGrid<T>({
  data,
  columns,
  allowSorting = false,
  allowPaging = false,
  pageSize = 10,
  emptyText = 'No records to display.',
  attributes,
  style,
}: {
  data: readonly T[] | null | undefined
  columns: DataGridColumn<T>[]
  allowSorting?: boolean
  allowPaging?: boolean
  pageSize?: number
  emptyText?: string
  // Onbekende parameters die Blazor als HTML-attribuut in de pagina zet (bv. ShowPagination="false")
  attributes?: Record<string, string>
  style?: string
}) {
  const [sort, setSort] = useState<{ index: number; order: SortOrder }>({ index: -1, order: null })
  const [page, setPage] = useState(0)

  const rows = useMemo(() => {
    const list = [...(data ?? [])]
    const col = sort.index >= 0 ? columns[sort.index] : undefined
    if (col?.property && sort.order) {
      const get = col.property
      // Stabiel sorteren (zoals LINQ OrderBy)
      const indexed = list.map((item, i) => ({ item, i }))
      indexed.sort((x, y) => compare(get(x.item), get(y.item)) * (sort.order === 'asc' ? 1 : -1) || x.i - y.i)
      return indexed.map(x => x.item)
    }
    return list
  }, [data, columns, sort])

  const count = rows.length
  const size = pageSize > 0 ? pageSize : 10
  const numberOfPages = Math.max(1, Math.ceil(count / size))
  const currentPage = Math.min(page, numberOfPages - 1)
  const visibleRows = allowPaging ? rows.slice(currentPage * size, currentPage * size + size) : rows

  const onSort = (index: number) => {
    const col = columns[index]
    if (!allowSorting || !(col.sortable ?? true) || !col.property) return
    setSort(s => {
      const current = s.index === index ? s.order : null
      const next: SortOrder = current === null ? 'asc' : current === 'asc' ? 'desc' : null
      return { index, order: next }
    })
  }

  const colStyle = (c: DataGridColumn<T>) => (c.width ? { width: c.width } : undefined)

  return (
    <div {...attributes} style={parseStyle(style)} className="rz-data-grid rz-has-pager rz-datatable rz-datatable-scrollable" tabIndex={0}>
      <div className="rz-data-grid-data" tabIndex={-1}>
        <table className="rz-grid-table rz-grid-table-fixed rz-grid-table-striped ">
          <colgroup>
            {columns.map((c, i) => (
              <col key={i} style={colStyle(c) ?? {}} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c, i) => {
                const sortable = allowSorting && (c.sortable ?? true)
                const order = sort.index === i ? sort.order : null
                return (
                  <th
                    key={i}
                    rowSpan={1}
                    colSpan={1}
                    className={`rz-unselectable-text ${sortable ? 'rz-sortable-column' : ''} rz-text-align-left`.replace(/\s+/g, ' ')}
                    scope="col"
                    style={colStyle(c) ?? {}}
                  >
                    <div onClick={() => onSort(i)}>
                      <span className="rz-column-title" title={c.title}>
                        <span className="rz-column-title-content rz-text-truncate">{c.title}</span>
                        {sortable &&
                          (order === 'asc' ? (
                            <span className="notranslate rz-sortable-column-icon rzi-grid-sort rzi-sort rzi-sort-asc" />
                          ) : order === 'desc' ? (
                            <span className="notranslate rz-sortable-column-icon rzi-grid-sort rzi-sort rzi-sort-desc" />
                          ) : (
                            <span className="notranslate rz-sortable-column-icon rzi-grid-sort rzi-sort" />
                          ))}
                      </span>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {count > 0 ? (
              visibleRows.map((item, r) => (
                <tr key={r} className="rz-data-row ">
                  {columns.map((c, i) => (
                    <td key={i} style={colStyle(c)}>
                      {c.template ? (
                        <span className="rz-cell-data rz-text-truncate">{c.template(item)}</span>
                      ) : (
                        <span className="rz-cell-data rz-text-truncate" title={display(c.property?.(item))}>
                          {display(c.property?.(item))}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr className=" rz-datatable-emptymessage-row">
                <td className="rz-datatable-emptymessage" colSpan={columns.length}>
                  <span style={{ whiteSpace: 'normal' }}>{emptyText}</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {allowPaging && count > size && <Pager count={count} pageSize={size} currentPage={currentPage} numberOfPages={numberOfPages} onPage={setPage} />}
    </div>
  )
}

// RadzenPager (HorizontalAlign Justify, 5 paginanummers, Engelse standaardteksten van Radzen)
function Pager({ count, pageSize, currentPage, numberOfPages, onPage }: { count: number; pageSize: number; currentPage: number; numberOfPages: number; onPage: (p: number) => void }) {
  const pageNumbersCount = 5
  void count
  void pageSize
  const visiblePages = Math.min(pageNumbersCount, numberOfPages)
  let startPage = Math.max(0, Math.ceil(currentPage - Math.floor(visiblePages / 2)))
  const endPage = Math.min(numberOfPages - 1, startPage + visiblePages - 1)
  const delta = pageNumbersCount - (endPage - startPage + 1)
  startPage = Math.max(0, startPage - delta)
  const pages: number[] = []
  for (let i = startPage; i < startPage + Math.min(endPage + 1, pageNumbersCount); i++) pages.push(i)
  const first = currentPage <= 0
  const last = currentPage >= numberOfPages - 1
  const go = (p: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    onPage(Math.min(Math.max(p, 0), numberOfPages - 1))
  }
  return (
    <div className="rz-pager rz-unselectable-text rz-helper-clearfix rz-align-justify" tabIndex={0}>
      <a className={`rz-pager-first rz-pager-element ${first ? 'rz-state-disabled' : ''} `} onClick={go(0)} aria-label="Go to first page." role="button" title="First page" {...(first ? { disabled: true } : {})}>
        <span className="notranslate rz-pager-icon rzi rzi-step-backward" />
      </a>
      <a className={`rz-pager-prev rz-pager-element ${first ? 'rz-state-disabled' : ''} `} onClick={go(currentPage - 1)} aria-label="Go to previous page." role="button" title="Previous page" {...(first ? { disabled: true } : {})}>
        <span className="notranslate rz-pager-icon rzi rzi-caret-left" />
      </a>
      <span className="rz-pager-pages">
        {pages.map(i => (
          <a
            key={i}
            className={`rz-pager-page rz-pager-element ${i === currentPage ? 'rz-state-active' : ''} `}
            onClick={go(i)}
            aria-current={i === currentPage ? 'page' : undefined}
            aria-label={`Go to page ${i + 1}.`}
            role="button"
            title={`Page ${i + 1}`}
          >
            {i + 1}
          </a>
        ))}
      </span>
      <a className={`rz-pager-next rz-pager-element ${!last ? '' : 'rz-state-disabled'} `} onClick={go(currentPage + 1)} aria-label="Go to next page." role="button" title="Next page" {...(last ? { disabled: true } : {})}>
        <span className="notranslate rz-pager-icon rzi rzi-caret-right" />
      </a>
      <a className={`rz-pager-last rz-pager-element  ${!last ? '' : 'rz-state-disabled'} `} onClick={go(numberOfPages - 1)} aria-label="Go to last page." role="button" title="Last page" {...(last ? { disabled: true } : {})}>
        <span className="notranslate rz-pager-icon rzi rzi-step-forward" />
      </a>
    </div>
  )
}
