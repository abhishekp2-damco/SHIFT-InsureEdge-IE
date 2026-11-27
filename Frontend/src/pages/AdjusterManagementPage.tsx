import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adjustersApi } from '../api/adjusters';
import PaginationBar from '../components/PaginationBar';
import type { TempAdjusterDto } from '../types/Adjuster';
import { useSessionState } from '../hooks/useSessionState';
import { formatPhoneView } from '../utils/fieldValidation';
import { useColumnOrder } from '../hooks/useColumnOrder';

// ─── Types ────────────────────────────────────────────────────────────────────

type ColKey =
  | 'userCode' | 'fullName' | 'adjusterType' | 'status' | 'telephoneNumber'
  | 'emailId' | 'territoriesAssigned' | 'currentCaseLoad' | 'caseCompleted'
  | 'licenseExpirationDate' | 'backgroundStatusCheck';

interface ConditionFilter {
  cond1: string; val1: string;
  logic: 'And' | 'Or';
  cond2: string; val2: string;
}
interface AppliedFilters {
  value?: string[];       // value-checkbox filter
  condition?: ConditionFilter;
}

// ─── Column definitions ───────────────────────────────────────────────────────

const ALL_COLS: { key: ColKey; label: string }[] = [
  { key: 'userCode',             label: 'Adjuster ID' },
  { key: 'fullName',             label: 'Adjuster Name' },
  { key: 'adjusterType',         label: 'Adjuster Type' },
  { key: 'status',               label: 'Status' },
  { key: 'telephoneNumber',      label: 'Telephone Number' },
  { key: 'emailId',              label: 'Email ID' },
  { key: 'territoriesAssigned',  label: 'Territories Assigned' },
  { key: 'currentCaseLoad',      label: 'Current Case Load' },
  { key: 'caseCompleted',        label: 'Case Completed' },
  { key: 'licenseExpirationDate',label: 'License Expiration Date' },
  { key: 'backgroundStatusCheck',label: 'Background Status Check' },
];

const CONDITION_OPS = [
  '(not set)', 'Contains', 'Does Not Contain', 'Starts With',
  'Ends With', 'Equal', 'Not Equal', 'Is Empty', 'Is Not Empty',
];

// ─── Row helpers ──────────────────────────────────────────────────────────────

function getRowInitials(row: TempAdjusterDto) {
  return `${row.firstName?.[0] ?? ''}${row.lastName?.[0] ?? ''}`.toUpperCase() || 'AD';
}
function getRowFullName(row: TempAdjusterDto) {
  return [row.firstName, row.middleName, row.lastName].filter(Boolean).join(' ') || '-';
}
function getEarliestExpiry(row: TempAdjusterDto): string {
  const dates = (row.licenses ?? []).map(l => l.licenseExpirationDate).filter(Boolean) as string[];
  return dates.length ? dates.sort()[0] : '-';
}
function getCellValue(row: TempAdjusterDto, key: ColKey): string {
  switch (key) {
    case 'userCode':              return row.userCode ?? '-';
    case 'fullName':              return getRowFullName(row);
    case 'adjusterType':          return row.adjusterType ?? '-';
    case 'status':                return row.status ?? 'Active';
    case 'telephoneNumber':       return formatPhoneView(row.telephoneNumber) || '-';
    case 'emailId':               return row.emailId ?? '-';
    case 'territoriesAssigned':   return row.territoriesAssigned ?? '-';
    case 'currentCaseLoad':       return '0';
    case 'caseCompleted':         return '0';
    case 'licenseExpirationDate': return getEarliestExpiry(row);
    case 'backgroundStatusCheck': return row.complianceFlag ?? '-';
    default:                      return '-';
  }
}

// ─── Filter logic ─────────────────────────────────────────────────────────────

function applyCondOp(op: string, cellVal: string, testVal: string): boolean {
  const c = cellVal.toLowerCase();
  const t = testVal.toLowerCase();
  switch (op) {
    case 'Contains':         return c.includes(t);
    case 'Does Not Contain': return !c.includes(t);
    case 'Starts With':      return c.startsWith(t);
    case 'Ends With':        return c.endsWith(t);
    case 'Equal':            return c === t;
    case 'Not Equal':        return c !== t;
    case 'Is Empty':         return cellVal === '' || cellVal === '-';
    case 'Is Not Empty':     return cellVal !== '' && cellVal !== '-';
    default:                 return true;
  }
}

function matchesConditionFilter(cellVal: string, f: ConditionFilter): boolean {
  const r1 = f.cond1 === '(not set)' || !f.cond1 ? true : applyCondOp(f.cond1, cellVal, f.val1);
  const r2 = f.cond2 === '(not set)' || !f.cond2 ? true : applyCondOp(f.cond2, cellVal, f.val2);
  if ((!f.cond1 || f.cond1 === '(not set)') && (!f.cond2 || f.cond2 === '(not set)')) return true;
  if ((!f.cond1 || f.cond1 === '(not set)')) return r2;
  if ((!f.cond2 || f.cond2 === '(not set)')) return r1;
  return f.logic === 'And' ? r1 && r2 : r1 || r2;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function SearchIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
}
function FilterArrow({ active }: { active?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? '#0B5AA0' : '#9ca3af'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16l-6 7v5l-4 2v-7L4 5z" />
    </svg>
  );
}
function EyeIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
}
function AdjusterIcon({ tone, variant }: { tone: string; variant: 'total' | 'active' | 'inactive' }) {
  if (variant === 'total') {
    return (
      <svg width="43" height="42" viewBox="0 0 43 42" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M16.084 21C14.8809 21 13.7188 21.1572 12.5977 21.4717C11.4766 21.7861 10.4307 22.2236 9.45996 22.7842C8.48926 23.3447 7.60742 24.0283 6.81445 24.835C6.02148 25.6416 5.33789 26.5303 4.76367 27.501C4.18945 28.4717 3.74512 29.5176 3.43066 30.6387C3.11621 31.7598 2.95898 32.9219 2.95898 34.125H0.333984C0.333984 32.498 0.573242 30.9258 1.05176 29.4082C1.53027 27.8906 2.2207 26.4824 3.12305 25.1836C4.02539 23.8848 5.0918 22.7432 6.32227 21.7588C7.55273 20.7744 8.94727 19.9883 10.5059 19.4004C8.93359 18.375 7.72363 17.1035 6.87598 15.5859C6.02832 14.0684 5.59766 12.373 5.58398 10.5C5.58398 9.05078 5.85742 7.69043 6.4043 6.41895C6.95117 5.14746 7.69629 4.0332 8.63965 3.07617C9.58301 2.11914 10.6973 1.36719 11.9824 0.820312C13.2676 0.273438 14.6348 0 16.084 0C17.5332 0 18.8936 0.273438 20.165 0.820312C21.4365 1.36719 22.5508 2.1123 23.5078 3.05566C24.4648 3.99902 25.2168 5.11328 25.7637 6.39844C26.3105 7.68359 26.584 9.05078 26.584 10.5C26.584 11.4023 26.4746 12.2842 26.2559 13.1455C26.0371 14.0068 25.709 14.8203 25.2715 15.5859C24.834 16.3516 24.3213 17.0557 23.7334 17.6982C23.1455 18.3408 22.4551 18.9082 21.6621 19.4004C22.4141 19.6875 23.1318 20.0361 23.8154 20.4463C24.499 20.8564 25.1621 21.3145 25.8047 21.8203C24.8613 22.1484 23.9521 22.5723 23.0771 23.0918C22.667 22.7637 22.1748 22.4697 21.6006 22.21C21.0264 21.9502 20.4111 21.7314 19.7549 21.5537C19.0986 21.376 18.4492 21.2393 17.8066 21.1436C17.1641 21.0479 16.5898 21 16.084 21ZM16.084 18.375C17.1777 18.375 18.2031 18.1699 19.1602 17.7598C20.1172 17.3496 20.9512 16.7891 21.6621 16.0781C22.373 15.3672 22.9336 14.5332 23.3438 13.5762C23.7539 12.6191 23.959 11.5938 23.959 10.5C23.959 9.41992 23.7539 8.40137 23.3438 7.44434C22.9336 6.4873 22.373 5.65332 21.6621 4.94238C20.9512 4.23145 20.1104 3.66406 19.1396 3.24023C18.1689 2.81641 17.1504 2.61133 16.084 2.625C14.9902 2.625 13.9648 2.83008 13.0078 3.24023C12.0508 3.65039 11.2168 4.21094 10.5059 4.92188C9.79492 5.63281 9.23438 6.4668 8.82422 7.42383C8.41406 8.38086 8.20898 9.40625 8.20898 10.5C8.20898 11.5938 8.41406 12.6191 8.82422 13.5762C9.23438 14.5332 9.79492 15.3672 10.5059 16.0781C11.2168 16.7891 12.0508 17.3496 13.0078 17.7598C13.9648 18.1699 14.9902 18.375 16.084 18.375ZM39.9346 27.8906L34.0693 33.7559C34.3291 34.3164 34.459 34.877 34.459 35.4375C34.459 35.9844 34.3564 36.4971 34.1514 36.9756C33.9463 37.4541 33.666 37.8711 33.3105 38.2266C32.9551 38.582 32.5381 38.8623 32.0596 39.0674C31.5811 39.2725 31.0684 39.375 30.5215 39.375C29.9746 39.375 29.4619 39.2725 28.9834 39.0674C28.5049 38.8623 28.0879 38.582 27.7324 38.2266C27.377 37.8711 27.0967 37.4541 26.8916 36.9756C26.6865 36.4971 26.584 35.9844 26.584 35.4375C26.584 34.8906 26.6865 34.3779 26.8916 33.8994C27.0967 33.4209 27.377 33.0039 27.7324 32.6484C28.0879 32.293 28.5049 32.0127 28.9834 31.8076C29.4619 31.6025 29.9746 31.5 30.5215 31.5C31.082 31.5 31.6426 31.6299 32.2031 31.8896L38.0684 26.0244L39.9346 27.8906ZM30.5215 36.75C30.877 36.75 31.1846 36.6201 31.4443 36.3604C31.7041 36.1006 31.834 35.793 31.834 35.4375C31.834 35.082 31.7041 34.7744 31.4443 34.5146C31.1846 34.2549 30.877 34.125 30.5215 34.125C30.166 34.125 29.8584 34.2549 29.5986 34.5146C29.3389 34.7744 29.209 35.082 29.209 35.4375C29.209 35.793 29.3389 36.1006 29.5986 36.3604C29.8584 36.6201 30.166 36.75 30.5215 36.75ZM30.5215 26.25C29.25 26.25 28.0605 26.4893 26.9531 26.9678C25.8457 27.4463 24.875 28.1025 24.041 28.9365C23.207 29.7705 22.5508 30.7412 22.0723 31.8486C21.5938 32.9561 21.3477 34.1523 21.334 35.4375C21.334 36.3125 21.457 37.167 21.7031 38.001C21.9492 38.835 22.3115 39.6279 22.79 40.3799L20.6982 42C20.042 41.0156 19.5498 39.9697 19.2217 38.8623C18.8936 37.7549 18.7227 36.6133 18.709 35.4375C18.709 33.8105 19.0166 32.2793 19.6318 30.8438C20.2471 29.4082 21.0947 28.1572 22.1748 27.0908C23.2549 26.0244 24.5059 25.1836 25.9277 24.5684C27.3496 23.9531 28.8809 23.6387 30.5215 23.625C31.4102 23.625 32.2783 23.7275 33.126 23.9326C33.9736 24.1377 34.7939 24.4316 35.5869 24.8145L33.5771 26.8037C33.085 26.6396 32.5859 26.5098 32.0801 26.4141C31.5742 26.3184 31.0547 26.2637 30.5215 26.25ZM41.1445 30.3721C41.5273 31.165 41.8213 31.9854 42.0264 32.833C42.2314 33.6807 42.334 34.5488 42.334 35.4375C42.334 36.5996 42.1699 37.7344 41.8418 38.8418C41.5137 39.9492 41.0146 41.002 40.3447 42L38.2529 40.3799C38.7178 39.6416 39.0732 38.8555 39.3193 38.0215C39.5654 37.1875 39.6953 36.3262 39.709 35.4375C39.709 34.918 39.6611 34.4053 39.5654 33.8994C39.4697 33.3936 39.333 32.8877 39.1553 32.3818L41.1445 30.3721Z" fill="#0B5AA0" />
      </svg>
    );
  }

  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" stroke={tone} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="24" cy="18" r="8" /><path d="M10 42c0-8 6-14 14-14 5.5 0 10.2 2.8 12.6 7" />
      {variant === 'active'   && <path d="M35 39l4 4 8-10" />}
      {variant === 'inactive' && <path d="M36 35l10 10M46 35 36 45" />}
    </svg>
  );
}

// ─── Status Pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status?: string | null }) {
  const active = (status || '').toLowerCase() !== 'inactive';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 80, padding: '3px 12px', borderRadius: 999, border: `1px solid ${active ? '#008c55' : '#d82929'}`, background: active ? '#d7f7e4' : '#ffe9e9', color: active ? '#006b3c' : '#b91c1c', fontSize: 12, fontWeight: 700 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? '#008c55' : '#d82929' }} />
      {status || 'Active'}
    </span>
  );
}

// ─── Column Panel ─────────────────────────────────────────────────────────────

function ColumnPanel({ anchorRect, visibleCols, onToggle, onClose }: {
  anchorRect: DOMRect; visibleCols: Set<ColKey>;
  onToggle: (key: ColKey, on: boolean) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div ref={ref} onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: anchorRect.bottom + 4, left: anchorRect.left, zIndex: 9999, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, boxShadow: '0 4px 18px rgba(0,0,0,0.15)', width: 240, padding: '10px 0' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', padding: '4px 16px 10px', borderBottom: '1px solid #e5e7eb', marginBottom: 4 }}>
        Modify Columns Display
      </div>
      {/* Action — always visible, greyed */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px', opacity: 0.5, cursor: 'default', background: '#ddeeff' }}>
        <input type="checkbox" checked readOnly style={{ accentColor: '#0B5AA0', width: 15, height: 15, flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: '#374151' }}>Action</span>
      </label>
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {ALL_COLS.map(col => (
          <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px', cursor: 'pointer', background: visibleCols.has(col.key) ? '#ddeeff' : 'transparent' }}>
            <input type="checkbox" checked={visibleCols.has(col.key)} onChange={e => onToggle(col.key, e.target.checked)} style={{ accentColor: '#0B5AA0', width: 15, height: 15, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#374151' }}>{col.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Filter Popup ─────────────────────────────────────────────────────────────

function FilterPopup({ anchorRect, colKey: _colKey, allValues, applied, onApply, onCancel, onClear }: {
  anchorRect: DOMRect; colKey: ColKey;
  allValues: string[]; applied: AppliedFilters | undefined;
  onApply: (f: AppliedFilters) => void; onCancel: () => void; onClear: () => void;
}) {
  const [tab, setTab] = useState<'condition' | 'value'>(applied?.condition ? 'condition' : 'value');

  // Value tab state
  const [valSearch, setValSearch] = useState('');
  const [selected, setSelected] = useState<string[]>(applied?.value ?? allValues);

  // Condition tab state
  const [cond1, setCond1] = useState(applied?.condition?.cond1 ?? '(not set)');
  const [val1,  setVal1]  = useState(applied?.condition?.val1 ?? '');
  const [logic, setLogic] = useState<'And'|'Or'>(applied?.condition?.logic ?? 'And');
  const [cond2, setCond2] = useState(applied?.condition?.cond2 ?? '(not set)');
  const [val2,  setVal2]  = useState(applied?.condition?.val2 ?? '');

  const visible = allValues.filter(v => v.toLowerCase().includes(valSearch.toLowerCase()));
  const allChecked = visible.length > 0 && visible.every(v => selected.includes(v));
  function toggleAll() { allChecked ? setSelected(s => s.filter(v => !visible.includes(v))) : setSelected(s => [...new Set([...s, ...visible])]); }
  function toggle(v: string) { setSelected(s => s.includes(v) ? s.filter(x => x !== v) : [...s, v]); }

  const left = Math.min(anchorRect.left, window.innerWidth - 292);
  const top  = Math.min(anchorRect.bottom + 4, window.innerHeight - 480);

  const btnBase: React.CSSProperties = { flex: 1, padding: '7px 0', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, cursor: 'pointer' };

  return (
    <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top, left, zIndex: 9999, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, boxShadow: '0 6px 20px rgba(0,0,0,0.15)', width: 282 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
        {(['condition', 'value'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '9px 0', fontSize: 12, fontWeight: tab === t ? 700 : 400, background: 'none', border: 'none', cursor: 'pointer', color: tab === t ? '#0B5AA0' : '#6b7280', borderBottom: tab === t ? '2px solid #0B5AA0' : '2px solid transparent' }}>
            {t === 'condition' ? 'Filter by Condition' : 'Filter by Value'}
          </button>
        ))}
      </div>

      {tab === 'value' ? (
        <>
          <div style={{ padding: '10px 10px 6px' }}>
            <input autoFocus value={valSearch} onChange={e => setValSearch(e.target.value)} placeholder="Search" style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4, boxSizing: 'border-box', outline: 'none' }} />
          </div>
          <div style={{ padding: '0 6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 4, cursor: 'pointer', background: '#e8f0fa', marginBottom: 2, fontSize: 13, fontWeight: 500 }}>
              <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ accentColor: '#0B5AA0', width: 14, height: 14 }} />
              Select All
            </label>
            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
              {visible.map(v => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 4, cursor: 'pointer', background: selected.includes(v) ? '#e8f0fa' : 'transparent', fontSize: 13, marginBottom: 1 }}>
                  <input type="checkbox" checked={selected.includes(v)} onChange={() => toggle(v)} style={{ accentColor: '#0B5AA0', width: 14, height: 14 }} />
                  {v}
                </label>
              ))}
              {visible.length === 0 && <div style={{ padding: '10px 8px', color: '#9ca3af', fontSize: 12 }}>No values</div>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid #e5e7eb', marginTop: 6 }}>
            <button onClick={() => onApply({ value: selected })} style={{ ...btnBase, background: '#0B5AA0', color: '#fff', border: 'none', fontWeight: 700 }}>Apply</button>
            <button onClick={onCancel}  style={{ ...btnBase, background: '#fff', color: '#374151' }}>Cancel</button>
            <button onClick={onClear}   style={{ ...btnBase, background: '#fff', color: '#374151' }}>Clear</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ padding: '12px 12px 0' }}>
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 8 }}>Show items where the value</div>
            <select value={cond1} onChange={e => setCond1(e.target.value)} style={{ width: '100%', padding: '7px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4, marginBottom: 6, outline: 'none' }}>
              {CONDITION_OPS.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
            <input value={val1} onChange={e => setVal1(e.target.value)} placeholder="" style={{ width: '100%', padding: '7px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4, marginBottom: 10, outline: 'none', boxSizing: 'border-box' }} />
            {/* And / Or */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 10 }}>
              {(['And', 'Or'] as const).map(opt => (
                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" checked={logic === opt} onChange={() => setLogic(opt)} style={{ accentColor: '#0B5AA0', width: 14, height: 14 }} />
                  {opt}
                </label>
              ))}
            </div>
            <select value={cond2} onChange={e => setCond2(e.target.value)} style={{ width: '100%', padding: '7px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4, marginBottom: 6, outline: 'none' }}>
              {CONDITION_OPS.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
            <input value={val2} onChange={e => setVal2(e.target.value)} placeholder="" style={{ width: '100%', padding: '7px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4, marginBottom: 2, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid #e5e7eb', marginTop: 8 }}>
            <button onClick={() => onApply({ condition: { cond1, val1, logic, cond2, val2 } })} style={{ ...btnBase, background: '#0B5AA0', color: '#fff', border: 'none', fontWeight: 700 }}>Apply</button>
            <button onClick={onCancel} style={{ ...btnBase, background: '#fff', color: '#374151' }}>Cancel</button>
            <button onClick={onClear}  style={{ ...btnBase, background: '#fff', color: '#374151' }}>Clear</button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdjusterManagementPage() {
  const navigate = useNavigate();
  const [search,   setSearch]   = useState('');
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [adjusters, setAdjusters] = useState<TempAdjusterDto[]>([]);
  const [error,    setError]    = useState('');

  const [visibleCols,     setVisibleCols]     = useState<Set<ColKey>>(new Set(ALL_COLS.map(c => c.key)));
  const { order: colOrder, dragging: draggingCol, headerProps } = useColumnOrder<ColKey>(ALL_COLS.map(c => c.key));
  const [showColPanel,    setShowColPanel]    = useState(false);
  const [colPanelRect,    setColPanelRect]    = useState<DOMRect | null>(null);
  const [activeFilter,    setActiveFilter]    = useState<ColKey | null>(null);
  const [filterRect,      setFilterRect]      = useState<DOMRect | null>(null);
  const [columnFilters, setColumnFilters] = useSessionState<Record<string, AppliedFilters>>('grid-filters:adjusters', {});

  useEffect(() => {
    adjustersApi.getAll().then(setAdjusters).catch(() => setError('Unable to load adjusters.'));
  }, []);

  // Unique column values for filter popup
  const colValues = useMemo(() => {
    const m: Record<string, string[]> = {};
    ALL_COLS.forEach(col => {
      m[col.key] = [...new Set(adjusters.map(r => getCellValue(r, col.key)))].sort();
    });
    return m;
  }, [adjusters]);

  // Keyword search + column filters applied
  const filteredRows = useMemo(() => {
    let r = adjusters;
    // keyword search
    const q = search.trim().toLowerCase();
    if (q) r = r.filter(row => ALL_COLS.some(c => getCellValue(row, c.key).toLowerCase().includes(q)));
    // column filters
    Object.entries(columnFilters).forEach(([key, f]) => {
      const k = key as ColKey;
      if (f.value) {
        if (f.value.length < (colValues[k]?.length ?? 0)) {
          r = r.filter(row => f.value!.includes(getCellValue(row, k)));
        }
      }
      if (f.condition) {
        r = r.filter(row => matchesConditionFilter(getCellValue(row, k), f.condition!));
      }
    });
    return r;
  }, [adjusters, search, columnFilters, colValues]);

  const pageRows   = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const activeCount   = adjusters.filter(r => (r.status || 'Active').toLowerCase() !== 'inactive').length;
  const inactiveCount = adjusters.length - activeCount;
  const visibleColDefs = colOrder.map(key => ALL_COLS.find(col => col.key === key)!).filter(col => visibleCols.has(col.key));

  function isFiltered(key: ColKey) {
    const f = columnFilters[key];
    if (!f) return false;
    if (f.value && f.value.length < (colValues[key]?.length ?? 0)) return true;
    if (f.condition && (f.condition.cond1 !== '(not set)' || f.condition.cond2 !== '(not set)')) return true;
    return false;
  }

  const TH: React.CSSProperties = {
    padding: '10px 12px', borderBottom: '2px solid #e5e7eb', borderRight: '1px solid #e5e7eb',
    textAlign: 'left', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color: '#374151', background: '#fff',
  };
  const TD: React.CSSProperties = {
    padding: '10px 12px', borderRight: '1px solid #edf1f5', fontSize: 13, color: '#111827',
  };

  return (
    <div
      style={{ padding: 16, background: '#fff', minHeight: '100%' }}
      onClick={() => { setActiveFilter(null); setShowColPanel(false); }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 16 }}>Adjuster Management</h1>
      {error && <div style={{ marginBottom: 12, color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, marginBottom: 26 }}>
        {([
          { label: 'Total',    value: adjusters.length,  tone: '#0B5AA0', variant: 'total'    },
          { label: 'Active',   value: activeCount,        tone: '#009765', variant: 'active'   },
          { label: 'Inactive', value: inactiveCount,      tone: '#d82929', variant: 'inactive' },
        ] as const).map(s => (
          <div key={s.label} style={{ minHeight: 80, background: 'linear-gradient(90deg, #fff8ff 0%, #f2ffff 100%)', borderRadius: 6, padding: '14px 12px', border: '1px solid #e4eaf0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, color: '#111827', marginBottom: 4, fontWeight: 500 }}>{s.label}</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: s.tone, lineHeight: 1 }}>{s.value}</div>
            </div>
            <AdjusterIcon tone={s.tone} variant={s.variant} />
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div style={{ position: 'relative', width: 290 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b', lineHeight: 1 }}><SearchIcon /></span>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by Keyword"
            style={{ paddingLeft: 36, fontSize: 13, width: 290, height: 34, border: '1px solid #aeb7c2', borderRadius: 3, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => navigate('/claims/adjusters/new')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '8px 18px', background: '#0B5AA0', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}
        >
          <span style={{ fontSize: 22, lineHeight: 1 }}>+</span> Add Adjuster
        </button>
      </div>

      {/* Table — no overflowX wrapper; <main> handles the single horizontal scroll */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
        <table style={{ width: '100%', minWidth: 1700, borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {/* ≡ hamburger — serial in data rows */}
              <th
                style={{ ...TH, width: 42, textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                onClick={e => {
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setColPanelRect(rect);
                  setShowColPanel(v => !v);
                }}
              >
                <span style={{ fontSize: 16, color: '#4b5563' }}>≡</span>
              </th>
              {/* Action */}
              <th style={{ ...TH, width: 70 }}>Action</th>
              {/* Data columns */}
              {visibleColDefs.map(col => (
                <th {...headerProps(col.key)} key={col.key} style={{ ...TH, cursor: 'grab', opacity: draggingCol === col.key ? 0.55 : 1 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {col.label}
                    <span
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', lineHeight: 1 }}
                      onClick={e => {
                        e.stopPropagation();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        if (activeFilter === col.key) { setActiveFilter(null); }
                        else { setFilterRect(rect); setActiveFilter(col.key); }
                      }}
                    >
                      <FilterArrow active={isFiltered(col.key)} />
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={visibleColDefs.length + 2} style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>
                  No Data Available
                </td>
              </tr>
            ) : pageRows.map((row, idx) => (
              <tr key={row.id} style={{ borderBottom: '1px solid #edf1f5' }}>
                {/* Serial */}
                <td style={{ ...TD, textAlign: 'center', color: '#64748b', width: 42 }}>{(page - 1) * pageSize + idx + 1}</td>
                {/* Action */}
                <td style={{ ...TD }}>
                  <button onClick={() => navigate('/claims/adjusters/' + row.id)} title="View" style={{ background: 'none', border: 'none', color: '#374151', padding: 4, cursor: 'pointer' }}>
                    <EyeIcon />
                  </button>
                </td>
                {/* Data cells */}
                {visibleColDefs.map(col => (
                  <td key={col.key} style={{ ...TD }}>
                    {col.key === 'fullName' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span className="grid-avatar" style={{ width: 26, height: 26, borderRadius: '50%', background: '#d9f2ff', color: '#0B5AA0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                          {getRowInitials(row)}
                        </span>
                        {getRowFullName(row)}
                      </span>
                    ) : col.key === 'status' ? (
                      <StatusPill status={row.status} />
                    ) : (
                      getCellValue(row, col.key)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12 }}>
        <PaginationBar
          page={page} pageSize={pageSize} total={filteredRows.length}
          onPageChange={setPage}
          onPageSizeChange={size => { setPageSize(size); setPage(1); }}
        />
      </div>

      {/* Column panel — fixed, never clipped */}
      {showColPanel && colPanelRect && (
        <ColumnPanel
          anchorRect={colPanelRect}
          visibleCols={visibleCols}
          onToggle={(key, on) => setVisibleCols(prev => { const n = new Set(prev); on ? n.add(key) : n.delete(key); return n; })}
          onClose={() => setShowColPanel(false)}
        />
      )}

      {/* Filter popup — fixed, never clipped */}
      {activeFilter && filterRect && (
        <FilterPopup
          anchorRect={filterRect}
          colKey={activeFilter}
          allValues={colValues[activeFilter] ?? []}
          applied={columnFilters[activeFilter]}
          onApply={f => { setColumnFilters(p => ({ ...p, [activeFilter]: f })); setActiveFilter(null); setPage(1); }}
          onCancel={() => setActiveFilter(null)}
          onClear={() => { setColumnFilters(p => { const n = { ...p }; delete n[activeFilter!]; return n; }); setActiveFilter(null); setPage(1); }}
        />
      )}
    </div>
  );
}
