import { showPagination } from '../../utils/fieldValidation';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { avatarColor, initials } from './QuotesPoliciesLandingShell';
import { quotesPoliciesApi } from '../../api/quotesPolicies';
import { authApi } from '../../api/auth';
import BulkUploadModal from './BulkUploadModal';
import { ColPanel } from './GridHelpers';
import type { NbQuoteListItemDto, NbQuotesKpiDto } from '../../types/Policy';
import type { MyProfile } from '../../types/CurrentUser';
import { useSessionState } from '../../hooks/useSessionState';
import { useColumnOrder } from '../../hooks/useColumnOrder';

// ── Column definitions (for Modify Columns Display) ───────────────────────────
const COL_DEFS = [
  { key: 'id',              label: 'Quote Number',    always: false },
  { key: 'insuredName',     label: 'Insured Name',    always: false },
  { key: 'lob',             label: 'LOB',             always: false },
  { key: 'effectiveDate',   label: 'Effective Date',  always: false },
  { key: 'premiumEstimate', label: 'Premium Estimate',always: false },
  { key: 'createdAt',       label: 'Creation Date',   always: false },
  { key: 'approvalStatus',  label: 'Approval Status', always: false },
  { key: 'lastUpdated',     label: 'Last Updated',    always: false },
  { key: 'status',          label: 'Status',          always: false },
  { key: 'state',           label: 'State',           always: false },
] as const;

type ColKey = typeof COL_DEFS[number]['key'];
type ColVisibility = Record<ColKey, boolean>;

// ── Interfaces ────────────────────────────────────────────────────────────────
type Quote = NbQuoteListItemDto;
type Kpis = NbQuotesKpiDto;
interface SortState { col: string; dir: 'asc' | 'desc'; }
const DATE_COLUMNS = new Set(['effectiveDate', 'createdAt', 'lastUpdated']);

// Filter types
type CondOp =
  | '(not set)' | 'equals' | 'does not equal'
  | 'contains' | 'does not contain'
  | 'starts with' | 'ends with'
  | 'is empty' | 'is not empty';

interface ConditionFilter {
  kind: 'condition';
  op1: CondOp; val1: string;
  logic: 'and' | 'or';
  op2: CondOp; val2: string;
}
interface ValueFilter { kind: 'value'; values: string[]; }
type ColFilter = ConditionFilter | ValueFilter;
type AppliedFilters = Record<string, ColFilter>;

// ── Condition operator evaluator ──────────────────────────────────────────────
function evalOp(op: CondOp, cell: string, val: string): boolean {
  const c = cell.toLowerCase(), v = val.toLowerCase();
  switch (op) {
    case '(not set)':       return true;
    case 'equals':          return c === v;
    case 'does not equal':  return c !== v;
    case 'contains':        return c.includes(v);
    case 'does not contain':return !c.includes(v);
    case 'starts with':     return c.startsWith(v);
    case 'ends with':       return c.endsWith(v);
    case 'is empty':        return c === '';
    case 'is not empty':    return c !== '';
    default:                return true;
  }
}

// ── KPI Stat Card ─────────────────────────────────────────────────────────────
function KpiStat({ label, value, color, icon, active, onClick }: {
  label: string; value: number; color: string;
  icon: React.ReactNode; active: boolean; onClick: () => void;
}) {
  return (
    <div className={`kpi-stat-card${active ? ' kpi-stat-active' : ''}`} onClick={onClick}>
      <div className="kpi-stat-body">
        <div className="kpi-stat-label">{label}</div>
        <div className="kpi-stat-value" style={{ color }}>{value.toLocaleString()}</div>
      </div>
      <div className="kpi-stat-icon" style={{ color }}>{icon}</div>
    </div>
  );
}

type QuoteKpiIconKind = 'uploaded' | 'approved' | 'notApproved' | 'expired';

function QuoteKpiIcon({ kind }: { kind: QuoteKpiIconKind }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 40"
      width="38"
      height="38"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.5 4.5h12l7 7v21h-19z" />
      <path d="M21.5 4.5v7h7" />

      {kind === 'uploaded' && (
        <>
          <path d="M19 26V15" />
          <path d="m14.5 19.5 4.5-4.5 4.5 4.5" />
          <path d="m23.5 28 3 3 5-5" />
        </>
      )}

      {kind === 'approved' && <path d="m21.5 27.5 3.5 3.5 6-7" />}

      {kind === 'notApproved' && (
        <>
          <path d="m22.5 24 8 8" />
          <path d="m30.5 24-8 8" />
        </>
      )}

      {kind === 'expired' && (
        <>
          <circle cx="26" cy="27" r="5.5" />
          <path d="M26 23.5V27l2.5 1.5" />
        </>
      )}
    </svg>
  );
}

// ── Two-Tab Filter Popup ──────────────────────────────────────────────────────
const COND_OPS: CondOp[] = [
  '(not set)', 'equals', 'does not equal',
  'contains', 'does not contain',
  'starts with', 'ends with',
  'is empty', 'is not empty',
];

interface FilterPopupProps {
  colKey: string;
  colLabel: string;
  options: string[];
  current: ColFilter | null;
  anchor: { top: number; left: number };
  onApply: (f: ColFilter | null) => void;
  onClose: () => void;
}

function FilterPopup({ options, current, anchor, onApply, onClose }: FilterPopupProps) {
  const [tab, setTab] = useState<'condition' | 'value'>(
    current?.kind === 'condition' ? 'condition' : 'value'
  );

  // Condition tab state
  const initCond = current?.kind === 'condition' ? current : null;
  const [op1,   setOp1]   = useState<CondOp>(initCond?.op1   ?? '(not set)');
  const [val1,  setVal1]  = useState(initCond?.val1  ?? '');
  const [logic, setLogic] = useState<'and' | 'or'>(initCond?.logic ?? 'and');
  const [op2,   setOp2]   = useState<CondOp>(initCond?.op2   ?? '(not set)');
  const [val2,  setVal2]  = useState(initCond?.val2  ?? '');

  // Value tab state
  const initVals = current?.kind === 'value' ? current.values : [];
  const [valSearch, setValSearch] = useState('');
  const [checked, setChecked]     = useState<string[]>(initVals);

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      const h = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) onClose();
      };
      document.addEventListener('mousedown', h);
      return () => document.removeEventListener('mousedown', h);
    }, 80);
    return () => clearTimeout(id);
  }, [onClose]);

  // Filtered options for value search
  const visibleOptions = options.filter(o =>
    !valSearch || o.toLowerCase().includes(valSearch.toLowerCase())
  );
  const allChecked = visibleOptions.length > 0 && visibleOptions.every(o => checked.includes(o));

  function toggleAll() {
    if (allChecked) setChecked(p => p.filter(v => !visibleOptions.includes(v)));
    else setChecked(p => [...new Set([...p, ...visibleOptions])]);
  }
  function toggleOne(v: string) {
    setChecked(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]);
  }

  function handleApply() {
    if (tab === 'condition') {
      if (op1 === '(not set)' && op2 === '(not set)') { onApply(null); }
      else { onApply({ kind: 'condition', op1, val1, logic, op2, val2 }); }
    } else {
      onApply(checked.length > 0 ? { kind: 'value', values: checked } : null);
    }
    onClose();
  }
  function handleClear() { onApply(null); onClose(); }

  // Adjust left so popup never overflows viewport right edge
  const safeLeft = Math.min(anchor.left, window.innerWidth - 310);

  return (
    <div
      ref={ref}
      className="fpopup"
      style={{ position: 'fixed', top: anchor.top, left: safeLeft, zIndex: 9999 }}
    >
      {/* Tabs */}
      <div className="fpopup-tabs">
        <button
          className={`fpopup-tab${tab === 'condition' ? ' active' : ''}`}
          onClick={() => setTab('condition')}
        >Filter by Condition</button>
        <button
          className={`fpopup-tab${tab === 'value' ? ' active' : ''}`}
          onClick={() => setTab('value')}
        >Filter by Value</button>
      </div>

      {/* Condition tab */}
      {tab === 'condition' && (
        <div className="fpopup-body">
          <div className="fpopup-cond-label">Show items where the value</div>
          <div className="fpopup-cond-row">
            <select className="fpopup-op-select" value={op1} onChange={e => setOp1(e.target.value as CondOp)}>
              {COND_OPS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {op1 !== '(not set)' && op1 !== 'is empty' && op1 !== 'is not empty' && (
              <input className="fpopup-val-input" value={val1} onChange={e => setVal1(e.target.value)} placeholder="Value…" />
            )}
          </div>
          <div className="fpopup-logic-row">
            <label className="fpopup-logic-item">
              <input type="radio" name="logic" value="and" checked={logic === 'and'} onChange={() => setLogic('and')} />
              And
            </label>
            <label className="fpopup-logic-item">
              <input type="radio" name="logic" value="or" checked={logic === 'or'} onChange={() => setLogic('or')} />
              Or
            </label>
          </div>
          <div className="fpopup-cond-row">
            <select className="fpopup-op-select" value={op2} onChange={e => setOp2(e.target.value as CondOp)}>
              {COND_OPS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {op2 !== '(not set)' && op2 !== 'is empty' && op2 !== 'is not empty' && (
              <input className="fpopup-val-input" value={val2} onChange={e => setVal2(e.target.value)} placeholder="Value…" />
            )}
          </div>
        </div>
      )}

      {/* Value tab */}
      {tab === 'value' && (
        <div className="fpopup-body">
          <div className="fpopup-search-wrap">
            <span className="fpopup-search-icon">&#128269;</span>
            <input
              className="fpopup-search"
              placeholder="Search values…"
              value={valSearch}
              onChange={e => setValSearch(e.target.value)}
            />
          </div>
          <div className="fpopup-value-list">
            <label className="fpopup-value-item fpopup-select-all">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              <span>Select All</span>
            </label>
            {visibleOptions.length === 0 && (
              <div className="fpopup-empty">No matching values</div>
            )}
            {visibleOptions.map(opt => (
              <label key={opt} className="fpopup-value-item">
                <input type="checkbox" checked={checked.includes(opt)} onChange={() => toggleOne(opt)} />
                <span>{opt || <em style={{ color: '#9ca3af' }}>(empty)</em>}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="fpopup-footer">
        <button className="fpopup-btn-clear" onClick={handleClear}>Clear</button>
        <button className="fpopup-btn-cancel" onClick={onClose}>Cancel</button>
        <button className="fpopup-btn-apply" onClick={handleApply}>Apply</button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function NBQuotesRegister({ insuredType }: { insuredType: string }) {
  const [allQuotes, setAllQuotes]   = useState<Quote[]>([]);
  const [kpis, setKpis]             = useState<Kpis | null>(null);
  const [loading, setLoading]       = useState(false);
  const [gridMsg, setGridMsg]       = useState('');
  const [search, setSearch]         = useState('');
  const [sort, setSort]             = useState<SortState | null>(null);
  const [filters, setFilters] = useSessionState<AppliedFilters>('grid-filters:quotes:new-business', {});

  // Column visibility
  const defaultCols = Object.fromEntries(COL_DEFS.map(c => [c.key, true])) as ColVisibility;
  const [visibleCols, setVisibleCols] = useState<ColVisibility>(defaultCols);
  const { order: colOrder, dragging: draggingCol, headerProps } = useColumnOrder<ColKey>(COL_DEFS.map(c => c.key));
  const [colPanelAnchor, setColPanelAnchor] = useState<{ top: number; left: number } | null>(null);
  const colTriggerRef = useRef<HTMLDivElement>(null);

  function toggleCol(key: ColKey) {
    setVisibleCols(p => ({ ...p, [key]: !p[key] }));
  }
  const [filterOpen, setFilterOpen] = useState<{ col: string; label: string; anchor: { top: number; left: number } } | null>(null);
  const [kpiFilter, setKpiFilter]   = useState<string | null>(null);
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(10);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const navigate = useNavigate();
  const label = insuredType === 'all' ? '' : insuredType === 'individual' ? 'Individual' : 'Business';

  // Load user profile to check if Producer
  useEffect(() => {
    authApi.getMyProfile().then(setProfile).catch(err => console.error('Failed to load profile:', err));
  }, []);

  // Check if current user is a Producer
  const isProducer = profile?.roleName === 'Producer';

  // ── Fetch all records ──────────────────────────────────────────────────────
  function fetchQuotes() {
    setLoading(true);
    return Promise.all([
      quotesPoliciesApi.getNbQuotes(insuredType, { pageSize: 9999 }),
      quotesPoliciesApi.getNbQuotesKpis(insuredType),
    ]).then(([qRes, kRes]) => {
      setAllQuotes(qRes.data);
      setKpis(kRes);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => {
    setFilters({}); setKpiFilter(null); setSearch(''); setSort(null); setPage(1);
    fetchQuotes();
  }, [insuredType]);

  // ── Scroll-to-top detection ────────────────────────────────────────────────
  useEffect(() => {
    const el = document.querySelector('.main') as HTMLElement | null;
    if (!el) return;
    const h = () => setShowScrollTop(el.scrollTop > 300);
    el.addEventListener('scroll', h);
    return () => el.removeEventListener('scroll', h);
  }, []);

  // ── Reset to page 1 when filters/sort change ──────────────────────────────
  useEffect(() => { setPage(1); }, [search, kpiFilter, filters, sort]);

  // ── Apply all filters + sort ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    let r = allQuotes;

    // Keyword search
    if (search) {
      const s = search.toLowerCase();
      r = r.filter(q =>
        q.insuredName.toLowerCase().includes(s) ||
        q.id.includes(s) ||
        (q.lob || '').toLowerCase().includes(s) ||
        (q.state || '').toLowerCase().includes(s)
      );
    }

    // KPI quick-filter
    if (kpiFilter === 'approved')    r = r.filter(q => q.approvalStatus === 'Approved');
    if (kpiFilter === 'notApproved') r = r.filter(q => q.approvalStatus === 'Not Approved');
    if (kpiFilter === 'expired')     r = r.filter(q => q.status === 'Expired');

    // Column filters
    for (const [col, f] of Object.entries(filters)) {
      if (f.kind === 'value') {
        if (f.values.length > 0)
          r = r.filter(q => f.values.includes(String(q[col as keyof Quote] ?? '')));
      } else {
        r = r.filter(q => {
          const cell = String(q[col as keyof Quote] ?? '');
          const m1 = evalOp(f.op1, cell, f.val1);
          if (f.op2 === '(not set)') return m1;
          const m2 = evalOp(f.op2, cell, f.val2);
          return f.logic === 'and' ? m1 && m2 : m1 || m2;
        });
      }
    }

    // Sort
    if (sort) {
      const { col, dir } = sort;
      const d = dir === 'asc' ? 1 : -1;
      r = [...r].sort((a, b) => {
        const av = a[col as keyof Quote], bv = b[col as keyof Quote];
        if (DATE_COLUMNS.has(col)) {
          const at = av ? Date.parse(String(av)) : Number.NEGATIVE_INFINITY;
          const bt = bv ? Date.parse(String(bv)) : Number.NEGATIVE_INFINITY;
          return d * (at - bt);
        }
        if (typeof av === 'number' && typeof bv === 'number')
          return d * ((av ?? -1) - (bv ?? -1));
        return d * String(av ?? '').localeCompare(String(bv ?? ''));
      });
    }

    return r;
  }, [allQuotes, search, kpiFilter, filters, sort]);

  // ── Pagination ─────────────────────────────────────────────────────────────
  const total      = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start      = (page - 1) * pageSize;
  const paged      = filtered.slice(start, start + pageSize);

  function pageNums(): (number | '…')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const nums: (number | '…')[] = [1];
    if (page > 3) nums.push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) nums.push(i);
    if (page < totalPages - 2) nums.push('…');
    nums.push(totalPages);
    return nums;
  }

  // ── Unique column values (for filter value list) ───────────────────────────
  function uniq(col: keyof Quote): string[] {
    return [...new Set(allQuotes.map(q => String(q[col] ?? '')).filter(Boolean))].sort();
  }

  // ── Sort handler ───────────────────────────────────────────────────────────
  function toggleSort(col: string) {
    setGridMsg('Your data is being loaded to the grid.');
    setTimeout(() => setGridMsg(''), 800);
    setSort(p => p?.col === col ? { col, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  }

  // ── Open filter popup ──────────────────────────────────────────────────────
  function openFilter(e: React.MouseEvent, col: string, lbl: string) {
    e.stopPropagation();
    if (filterOpen?.col === col) { setFilterOpen(null); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setFilterOpen({ col, label: lbl, anchor: { top: rect.bottom + 6, left: rect.left - 4 } });
  }

  // ── Apply / clear a column filter ─────────────────────────────────────────
  function applyFilter(col: string, f: ColFilter | null) {
    setFilters(prev => {
      const next = { ...prev };
      if (f === null) delete next[col];
      else next[col] = f;
      return next;
    });
  }

  // ── Active filter count ────────────────────────────────────────────────────
  const activeFilterCount = Object.keys(filters).length;

  // ── Sortable + filterable TH ───────────────────────────────────────────────
  function Th({ col, lbl }: { col: string; lbl: string }) {
    const hasFilter = col in filters;
    const isOpen    = filterOpen?.col === col;
    const sortDir   = sort?.col === col ? sort.dir : null;
    return (
      <th {...headerProps(col as ColKey)} className={`${hasFilter ? 'th-filtered ' : ''}${draggingCol === col ? 'column-dragging' : ''}`.trim()}>
        <div className="th-inner">
          <span
            className="th-sortable"
            style={{ color: hasFilter ? '#1a3b6b' : undefined }}
            onClick={() => toggleSort(col)}
          >
            {lbl}
            <span className={`sort-arrow${sortDir ? ' sort-active' : ''}`}>
              {sortDir === 'asc' ? '▲' : sortDir === 'desc' ? '▼' : ''}
            </span>
          </span>
          <span
            className={`col-filter-icon${hasFilter ? ' filter-on' : ''}${isOpen ? ' filter-open' : ''}`}
            title={`Filter ${lbl}`}
            onClick={e => openFilter(e, col, lbl)}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
              <path d="M4.25 5.61C6.27 8.2 10 13 10 13v6c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-6s3.72-4.8 5.74-7.39A.998.998 0 0 0 18.95 4H5.04a1 1 0 0 0-.79 1.61z"/>
            </svg>
          </span>
        </div>
      </th>
    );
  }

  const orderedVisibleCols = colOrder.filter(key => visibleCols[key]);

  function renderQuoteCell(quote: Quote, col: ColKey) {
    switch (col) {
      case 'id': return <td key={col} className="mono">{quote.id}</td>;
      case 'insuredName': return <td key={col}><div className="insured-cell"><div className="insured-avatar" style={{ background: avatarColor(quote.insuredName) }}>{initials(quote.insuredName)}</div><span className="insured-name">{quote.insuredName}</span></div></td>;
      case 'lob': return <td key={col}>{quote.lob}</td>;
      case 'effectiveDate': return <td key={col}>{quote.effectiveDate}</td>;
      case 'premiumEstimate': return <td key={col}>{quote.premiumEstimate != null ? `$${quote.premiumEstimate.toLocaleString()}` : <span style={{ color: '#9ca3af' }}>—</span>}</td>;
      case 'createdAt': return <td key={col}>{quote.createdAt}</td>;
      case 'approvalStatus': return <td key={col}>{quote.approvalStatus === 'Approved' && <span className="approval-approved">● Approved</span>}{quote.approvalStatus === 'Not Approved' && <span className="approval-not-approved">● Not Approved</span>}</td>;
      case 'lastUpdated': return <td key={col}>{quote.lastUpdated}</td>;
      case 'status': return <td key={col}><span className={`badge badge-${(quote.status || 'draft').toLowerCase().replace(/\s+/g, '-')}`}><span className="badge-dot" />{quote.status}</span></td>;
      case 'state': return <td key={col}>{quote.state}</td>;
    }
  }

  return (
    <div className="page-content">
      <div className="page-title">{label ? `${label} — ` : ''}New Business Quotes</div>

      {/* ── KPI Stats Row ── */}
      <div className="kpi-stats-row">
        <KpiStat label="Uploaded" value={kpis?.uploaded ?? 0} color="#0097d7" active={kpiFilter === null}
          onClick={() => { setKpiFilter(null); setFilters({}); }}
          icon={<QuoteKpiIcon kind="uploaded" />}
        />
        <KpiStat label="Approved" value={kpis?.approved ?? 0} color="#45ad00" active={kpiFilter === 'approved'}
          onClick={() => setKpiFilter(p => p === 'approved' ? null : 'approved')}
          icon={<QuoteKpiIcon kind="approved" />}
        />
        <KpiStat label="Not Approved" value={kpis?.notApproved ?? 0} color="#b0003a" active={kpiFilter === 'notApproved'}
          onClick={() => setKpiFilter(p => p === 'notApproved' ? null : 'notApproved')}
          icon={<QuoteKpiIcon kind="notApproved" />}
        />
        <KpiStat label="Expired" value={kpis?.expired ?? 0} color="#b0003a" active={kpiFilter === 'expired'}
          onClick={() => setKpiFilter(p => p === 'expired' ? null : 'expired')}
          icon={<QuoteKpiIcon kind="expired" />}
        />
      </div>

      {/* ── Data Grid Card ── */}
      <div className="register-card">
        <div className="register-toolbar">
          <div className="search-input-reg">
            <span className="search-icon">&#128269;</span>
            <input
              placeholder="Search by Keyword"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="toolbar-spacer" />
          {isProducer && (
            <>
              <button
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '8px 16px' }}
                onClick={() => setShowBulkUpload(true)}
              >
                Bulk Upload
              </button>
              <button
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '8px 16px' }}
                onClick={() => navigate(`/quotes-policies/submissions/new?landing=1&insuredType=${insuredType === 'business' ? 'business' : 'individual'}`)}
              >
                New Submission
              </button>
            </>
          )}
        </div>

        {/* ── Applied Filters Bar ── */}
        {(activeFilterCount > 0 || kpiFilter) && (
          <div className="applied-filters-bar">
            <span className="applied-filters-label">Applied Filter(s):</span>
            <div className="applied-filter-chips">
              {kpiFilter && (
                <span className="applied-filter-chip">
                  {kpiFilter === 'approved' ? 'Approved' : kpiFilter === 'notApproved' ? 'Not Approved' : 'Expired'}
                  <button onClick={() => setKpiFilter(null)} title="Remove">×</button>
                </span>
              )}
              {Object.entries(filters).map(([col, f]) => {
                const colDef = COL_DEFS.find(c => c.key === col);
                const lbl = colDef?.label ?? col;
                const count = f.kind === 'value' ? `(${(f as ValueFilter).values.length})` : '(cond)';
                return (
                  <span key={col} className="applied-filter-chip">
                    {lbl} {count}
                    <button onClick={() => applyFilter(col, null)} title="Remove">×</button>
                  </span>
                );
              })}
            </div>
            <button
              className="clear-all-filters-btn"
              onClick={() => { setFilters({}); setKpiFilter(null); }}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style={{ flexShrink: 0 }}>
                <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
              </svg>
              Clear All
            </button>
          </div>
        )}

        {/* Grid loading / sort message */}
        {(loading || gridMsg) && (
          <div className="table-loading">
            {loading && <div className="spinner" />}
            <span>{loading ? 'Loading quotes…' : gridMsg}</span>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <div
                    ref={colTriggerRef}
                    className={`th-inner col-panel-trigger${colPanelAnchor ? ' col-panel-open' : ''}`}
                    title="Modify columns display"
                    onMouseDown={e => {
                      e.stopPropagation();
                      e.preventDefault();
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setColPanelAnchor(p => p ? null : { top: rect.bottom + 6, left: rect.left });
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
                  </div>
                </th>
                <th style={{ width: 28 }}><input type="checkbox" /></th>
                <th style={{ width: 52 }}><div className="th-inner">Action</div></th>
                {orderedVisibleCols.map(col => <Th key={col} col={col} lbl={COL_DEFS.find(def => def.key === col)!.label} />)}
              </tr>
            </thead>
            <tbody>
              {!loading && paged.length === 0 && (
                <tr><td colSpan={20} className="no-data">No Data Available</td></tr>
              )}
              {paged.map((q, i) => (
                <tr key={q.id} className="data-row" onClick={() => navigate(`/quotes-policies/submissions/${q.id}`)}>
                  <td className="row-num">{start + i + 1}</td>
                  <td><input type="checkbox" onClick={e => e.stopPropagation()} /></td>
                  <td>
                    <div className="action-cell">
                      <button
                        className="action-btn" title="View"
                        onClick={e => { e.stopPropagation(); navigate(`/quotes-policies/submissions/${q.id}`); }}
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                          <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                  {orderedVisibleCols.map(col => renderQuoteCell(q, col))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Footer ── */}
        {showPagination(total) && <div className="table-footer">
          <div className="footer-info">
            Showing&nbsp;
            <select
              className="page-size-select" value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            &nbsp;records from&nbsp;<strong>{total.toLocaleString()}</strong>&nbsp;Results
          </div>
          <div className="pagination">
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
            {pageNums().map((n, idx) =>
              n === '…'
                ? <span key={`e${idx}`} className="page-ellipsis">…</span>
                : <button key={n} className={`page-btn${page === n ? ' active' : ''}`} onClick={() => setPage(n as number)}>{n}</button>
            )}
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
          </div>
        </div>}
      </div>

      {/* ── Filter popup rendered at document level (bypasses all overflow) ── */}
      {filterOpen && (
        <FilterPopup
          colKey={filterOpen.col}
          colLabel={filterOpen.label}
          options={uniq(filterOpen.col as keyof Quote)}
          current={filters[filterOpen.col] ?? null}
          anchor={filterOpen.anchor}
          onApply={f => applyFilter(filterOpen.col, f)}
          onClose={() => setFilterOpen(null)}
        />
      )}

      {/* ── Column visibility panel at document level ── */}
      {colPanelAnchor && (
        <ColPanel
          visibleCols={visibleCols}
          colDefs={COL_DEFS}
          onToggle={key => toggleCol(key as ColKey)}
          onClose={() => setColPanelAnchor(null)}
          anchor={colPanelAnchor}
          anchorEl={colTriggerRef.current}
        />
      )}
      {showBulkUpload && <BulkUploadModal onClose={() => { setShowBulkUpload(false); fetchQuotes(); }} />}

      {/* ── Back to top ── */}
      {showScrollTop && (
        <button
          className="back-to-top"
          onClick={() => document.querySelector('.main')?.scrollTo({ top: 0, behavior: 'smooth' })}
          title="Top"
        >↑</button>
      )}
    </div>
  );
}
