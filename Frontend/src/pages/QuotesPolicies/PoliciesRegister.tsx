import { showPagination } from '../../utils/fieldValidation';
import { policyStatusLabel } from '../../utils/policyStatus';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { avatarColor, initials } from './QuotesPoliciesLandingShell';
import {
  KpiStat, FilterPopup, ColPanel, FunnelIcon, EyeIcon, RefreshIcon,
  evalOp, type AppliedFilters, type ColFilter, type SortState,
} from './GridHelpers';
import { quotesPoliciesApi } from '../../api/quotesPolicies';
import type { PolicyListItemDto, PoliciesKpiDto } from '../../types/Policy';
import { useSessionState } from '../../hooks/useSessionState';
import { useColumnOrder } from '../../hooks/useColumnOrder';

type Policy = PolicyListItemDto;
type Kpis = PoliciesKpiDto;

const COL_DEFS = [
  { key: 'id',             label: 'Policy Number' },
  { key: 'insuredName',    label: 'Insured Name' },
  { key: 'lob',            label: 'Line of Business' },
  { key: 'effectiveDate',  label: 'Effective Date' },
  { key: 'status',         label: 'Status' },
  { key: 'expirationDate', label: 'Expiration Date' },
  { key: 'premiumAmount',  label: 'Premium Amount' },
  { key: 'lastUpdated',    label: 'Last Updated' },
  { key: 'state',          label: 'State' },
] as const;

const ALL_LABELS: Record<string, string> = Object.fromEntries(COL_DEFS.map(c => [c.key, c.label]));

type PolicyKpiIconKind = 'total' | 'active' | 'bound' | 'cancelled' | 'doNotRenew';

function PolicyKpiIcon({ kind }: { kind: PolicyKpiIconKind }) {
  const isDoNotRenew = kind === 'doNotRenew';
  return (
    <svg className="policy-kpi-icon" viewBox="0 0 32 32" width="36" height="36" fill="none" aria-hidden="true">
      <path d={isDoNotRenew ? 'M7 2.5h10l5.5 5.5v21H7z' : 'M6.5 3.5h12l6 6v18h-18z'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d={isDoNotRenew ? 'M17 2.5V8h5.5' : 'M18.5 3.5v6h6'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />

      {kind === 'total' && (
        <path d="M19.5 16.2 25 14l5.5 2.2v4.1c0 3.7-2.2 6.5-5.5 8.2-3.3-1.7-5.5-4.5-5.5-8.2z" fill="#f7fbff" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      )}
      {kind === 'active' && (
        <>
          <circle cx="25" cy="19.5" r="4.2" fill="#f7fffb" stroke="currentColor" strokeWidth="1.8" />
          <path d="M22.8 23.1v5.2l2.2-1.5 2.2 1.5v-5.2" fill="#f7fffb" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </>
      )}
      {kind === 'bound' && (
        <>
          <path d="M21.3 18.2h-1.1a3.4 3.4 0 0 0 0 6.8h3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M25.2 16.4h1.1a3.4 3.4 0 0 1 0 6.8h-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M22 20.7h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      {kind === 'cancelled' && (
        <>
          <circle cx="25" cy="22" r="6" fill="#fff8f8" stroke="currentColor" strokeWidth="1.8" />
          <path d="m20.8 17.8 8.4 8.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      {kind === 'doNotRenew' && (
        <g transform="translate(13.2 10.2) scale(.7)" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 4.5V4a2 2 0 0 0-2.41-1.96" />
          <path d="M13.9 8.4a2 2 0 0 0-1.26-1.3" />
          <path d="M21.7 16.2A8 8 0 0 0 22 14v-3a2 2 0 1 0-4 0v-1a2 2 0 0 0-3.63-1.16" />
          <path d="m7 15-1.8-1.8a2 2 0 0 0-2.79 2.86L6 19.7A7.74 7.74 0 0 0 12 22h2a8 8 0 0 0 5.66-2.34" />
          <path d="M6 6v8" />
          <path d="m2 2 20 20" />
        </g>
      )}
    </svg>
  );
}


type ColKey = typeof COL_DEFS[number]['key'];
type ColVisibility = Record<ColKey, boolean>;
const DEFAULT_VIS = Object.fromEntries(COL_DEFS.map(c => [c.key, true])) as ColVisibility;
const PAGE_SIZES = [10, 25, 50] as const;

function Th({ col, label, sort, onSort, filters, onFilterClick, filterPopup, dragProps }: {
  col: string; label: string; sort: SortState | null;
  onSort: (col: string) => void; filters: AppliedFilters;
  onFilterClick: (col: string, e: React.MouseEvent) => void;
  filterPopup: { col: string } | null;
  dragProps?: React.ThHTMLAttributes<HTMLTableCellElement>;
}) {
  const has = !!filters[col];
  const isSort = sort?.col === col;
  return (
    <th {...dragProps} className={`${has ? 'th-filtered ' : ''}${dragProps?.className ?? ''}`.trim()}>
      <div className="th-inner">
        <span className="th-label" style={{ color: has ? '#1a3b6b' : undefined, cursor: 'pointer' }} onClick={() => onSort(col)}>
          {label}{isSort && <span className="sort-arrow">{sort!.dir === 'asc' ? ' ↑' : ' ↓'}</span>}
        </span>
        <button className={`filter-icon${has ? ' filter-on' : ''}${filterPopup?.col === col ? ' filter-open' : ''}`} onClick={e => onFilterClick(col, e)}>
          <FunnelIcon />
        </button>
      </div>
    </th>
  );
}

export default function PoliciesRegister({ insuredType }: { insuredType: string }) {
  const label = insuredType === 'individual' ? 'Individual' : 'Business';
  const navigate = useNavigate();
  const [rows, setRows]         = useState<Policy[]>([]);
  const [kpis, setKpis]         = useState<Kpis | null>(null);
  const [search, setSearch]     = useState('');
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);
  const [filters, setFilters] = useSessionState<AppliedFilters>('grid-filters:quotes:policies', {});
  const [sort, setSort]         = useState<SortState | null>(null);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [visibleCols, setVisibleCols] = useState<ColVisibility>(DEFAULT_VIS);
  const [filterPopup, setFilterPopup] = useState<{ col: string; anchor: { top: number; left: number } } | null>(null);
  const [colPanelOpen, setColPanelOpen]     = useState(false);
  const [colPanelAnchor, setColPanelAnchor] = useState({ top: 0, left: 0 });
  const colBtnRef = useRef<HTMLButtonElement>(null);
  const { order: colOrder, dragging: draggingCol, headerProps } = useColumnOrder<ColKey>(COL_DEFS.map(c => c.key));

  useEffect(() => {
    quotesPoliciesApi.getPoliciesKpis(insuredType).then(setKpis).catch(() => setKpis(null));
  }, [insuredType]);

  useEffect(() => {
    quotesPoliciesApi.getPolicies(insuredType).then(data => setRows(data)).catch(() => setRows([]));
  }, [insuredType]);

  useEffect(() => { setPage(1); }, [search, kpiFilter, filters, sort]);

  const filtered = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter(row => Object.values(row).some(v => String(v).toLowerCase().includes(s)));
    }
    if (kpiFilter && kpiFilter !== 'total') {
      r = r.filter(row => (row.status || '').toLowerCase().replace(/\s+/g, '') === kpiFilter);
    }
    for (const [col, f] of Object.entries(filters)) {
      r = r.filter(row => {
        const cell = String((row as unknown as Record<string, unknown>)[col] ?? '');
        if (f.kind === 'value') return f.values.includes(cell);
        const p1 = evalOp(f.op1, cell, f.val1);
        const p2 = evalOp(f.op2, cell, f.val2);
        return f.logic === 'and' ? p1 && p2 : p1 || p2;
      });
    }
    return r;
  }, [rows, search, kpiFilter, filters]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    return [...filtered].sort((a, b) => {
      const av = String((a as unknown as Record<string, unknown>)[sort.col] ?? '');
      const bv = String((b as unknown as Record<string, unknown>)[sort.col] ?? '');
      return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows   = sorted.slice((page - 1) * pageSize, page * pageSize);
  const activeFilters = Object.keys(filters).length;

  function handleSort(col: string) {
    setSort(s => s?.col === col && s.dir === 'asc' ? { col, dir: 'desc' } : { col, dir: 'asc' });
  }
  function openFilter(col: string, e: React.MouseEvent) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setFilterPopup(p => p?.col === col ? null : { col, anchor: { top: rect.bottom + 4, left: rect.left } });
  }
  function applyFilter(col: string, f: ColFilter | null) {
    setFilters(prev => { const n = { ...prev }; if (f == null) delete n[col]; else n[col] = f; return n; });
  }
  function toggleKpi(key: string) {
    setKpiFilter(prev => prev === key ? null : key);
  }
  function getOptions(col: string) {
    return [...new Set(rows.map(r => String((r as unknown as Record<string, unknown>)[col] ?? '')))].sort();
  }
  function renderPages() {
    const delta = 2;
    const nums: number[] = [];
    for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) nums.push(i);
    return nums.map(n => <button key={n} className={`page-btn${n === page ? ' active' : ''}`} onClick={() => setPage(n)}>{n}</button>);
  }
  function fmtCurrency(n: number | null) { return n == null ? '-' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  const orderedVisibleCols = colOrder.filter(key => visibleCols[key]);

  function renderPolicyCell(policy: Policy, col: ColKey) {
    switch (col) {
      case 'id': return <td key={col} className="mono" style={{ color: '#1a3b6b' }}>{policy.id}</td>;
      case 'insuredName': return <td key={col}><div className="insured-cell"><div className="insured-avatar" style={{ background: avatarColor(policy.insuredName) }}>{initials(policy.insuredName)}</div><span className="insured-name">{policy.insuredName}</span></div></td>;
      case 'lob': return <td key={col}>{policy.lob}</td>;
      case 'effectiveDate': return <td key={col}>{policy.effectiveDate}</td>;
      case 'status': return <td key={col}><span className={`badge badge-${(policy.status || '').toLowerCase().replace(/\s+/g, '-')}`}><span className="badge-dot" />{policyStatusLabel(policy.status)}</span></td>;
      case 'expirationDate': return <td key={col}>{policy.expirationDate}</td>;
      case 'premiumAmount': return <td key={col} style={{ textAlign: 'right' }}>{fmtCurrency(policy.premiumAmount)}</td>;
      case 'lastUpdated': return <td key={col}>{policy.lastUpdated}</td>;
      case 'state': return <td key={col}>{policy.state}</td>;
    }
  }

  return (
    <div className="page-content">
      <div className="page-title">{label} — Policies</div>

      {kpis && (
        <div className="kpi-row">
          <KpiStat label="Total"     value={kpis.total}     color="#0067b1" icon={<PolicyKpiIcon kind="total" />} active={kpiFilter === 'total'}     onClick={() => toggleKpi('total')} />
          <KpiStat label="Active"    value={kpis.active}    color="#00945e" icon={<PolicyKpiIcon kind="active" />} active={kpiFilter === 'active'}    onClick={() => toggleKpi('active')} />
          <KpiStat label="Bound"     value={kpis.bound}     color="#a000f2" icon={<PolicyKpiIcon kind="bound" />} active={kpiFilter === 'bound'}     onClick={() => toggleKpi('bound')} />
          <KpiStat label="Cancelled" value={kpis.cancelled} color="#ef2b2d" icon={<PolicyKpiIcon kind="cancelled" />} active={kpiFilter === 'cancelled'} onClick={() => toggleKpi('cancelled')} />
          <KpiStat label="Do Not Renew" value={kpis.doNotRenew} color="#4b5355" icon={<PolicyKpiIcon kind="doNotRenew" />} active={kpiFilter === 'donotrenew'} onClick={() => toggleKpi('donotrenew')} />
        </div>
      )}

      <div className="register-card">
        <div className="register-toolbar">
          <div className="search-input-reg">
            <span className="search-icon">&#128269;</span>
            <input placeholder="Search by Keyword" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="toolbar-spacer" />
          <div className="split-btn">
            <button className="btn btn-outline btn-left" style={{ fontSize: 11 }}>Download</button>
            <button className="btn btn-outline btn-right" style={{ fontSize: 11 }}>&#8964;</button>
          </div>
        </div>

        {(activeFilters > 0 || kpiFilter) && (
          <div className="applied-filters-bar">
            <span className="applied-filters-label">Applied Filter(s):</span>
            <div className="applied-filter-chips">
              {kpiFilter && (
                <span className="applied-filter-chip">KPI: {kpiFilter}<button onClick={() => setKpiFilter(null)}>×</button></span>
              )}
              {Object.entries(filters).map(([col, f]) => (
                <span key={col} className="applied-filter-chip">
                  {ALL_LABELS[col] ?? col} {f.kind === 'value' ? `(${f.values.length})` : '(cond)'}
                  <button onClick={() => applyFilter(col, null)}>×</button>
                </span>
              ))}
            </div>
            <button className="clear-all-filters-btn" onClick={() => { setFilters({}); setKpiFilter(null); }}>
              <RefreshIcon /> Clear All
            </button>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <button
                    ref={colBtnRef}
                    className={`col-panel-trigger${colPanelOpen ? ' col-panel-open' : ''}`}
                    onMouseDown={e => {
                      e.stopPropagation(); e.preventDefault();
                      if (!colPanelOpen && colBtnRef.current) {
                        const r = colBtnRef.current.getBoundingClientRect();
                        setColPanelAnchor({ top: r.bottom + 4, left: r.left });
                      }
                      setColPanelOpen(p => !p);
                    }}
                  >&#9776;</button>
                </th>
                <th>Action</th>
                {orderedVisibleCols.map(col => <Th key={col} col={col} label={ALL_LABELS[col]} sort={sort} onSort={handleSort} filters={filters} onFilterClick={openFilter} filterPopup={filterPopup} dragProps={{ ...headerProps(col), className: draggingCol === col ? 'column-dragging' : '' }} />)}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && <tr><td colSpan={11} className="no-data">No Data Available</td></tr>}
              {pageRows.map((p, i) => (
                <tr key={p.id} className="data-row" onClick={() => navigate('/quotes-policies/policies/' + p.id + '?insuredType=' + insuredType)}>
                  <td className="row-num">{(page - 1) * pageSize + i + 1}</td>
                  <td><div className="action-cell"><button className="action-btn" title="View Policy Summary" onClick={e => { e.stopPropagation(); navigate('/quotes-policies/policies/' + p.id + '?insuredType=' + insuredType); }}><EyeIcon /></button></div></td>
                  {orderedVisibleCols.map(col => renderPolicyCell(p, col))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showPagination(sorted.length) && <div className="table-footer">
          <span>
            Showing&nbsp;
            <select className="page-size-select" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            &nbsp;records · {sorted.length.toLocaleString()} results
          </span>
          <div className="pagination">
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>&#8249;</button>
            {renderPages()}
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>&#8250;</button>
          </div>
        </div>}
      </div>

      {filterPopup && (
        <FilterPopup
          colKey={filterPopup.col}
          colLabel={ALL_LABELS[filterPopup.col] ?? filterPopup.col}
          options={getOptions(filterPopup.col)}
          current={filters[filterPopup.col] ?? null}
          anchor={filterPopup.anchor}
          onApply={f => applyFilter(filterPopup.col, f)}
          onClose={() => setFilterPopup(null)}
        />
      )}

      {colPanelOpen && (
        <ColPanel
          colDefs={COL_DEFS}
          visibleCols={visibleCols as Record<string, boolean>}
          onToggle={key => setVisibleCols(v => ({ ...v, [key]: !v[key as ColKey] }))}
          onClose={() => setColPanelOpen(false)}
          anchor={colPanelAnchor}
          anchorEl={colBtnRef.current}
        />
      )}
    </div>
  );
}
