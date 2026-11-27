import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { configurationsApi, type ConfigurationListItem } from '../api/configurations';
import { useColumnOrder } from '../hooks/useColumnOrder';

type SortKey = 'tableName' | 'lastModifiedDate' | 'lastModifiedBy';
type SortDir = 'asc' | 'desc';
const GRID_COLUMNS: { key: SortKey; label: string; width?: number }[] = [
  { key: 'tableName', label: 'Table Name' },
  { key: 'lastModifiedDate', label: 'Last Modified Date', width: 200 },
  { key: 'lastModifiedBy', label: 'Last Modified By', width: 260 },
];

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, marginLeft: 4, verticalAlign: 'middle' }}>
      <svg width="8" height="5" viewBox="0 0 8 5" fill={active && dir === 'asc' ? '#374151' : '#aeb7c2'}>
        <path d="M4 0L8 5H0z" />
      </svg>
      <svg width="8" height="5" viewBox="0 0 8 5" fill={active && dir === 'desc' ? '#374151' : '#aeb7c2'}>
        <path d="M4 5L0 0h8z" />
      </svg>
    </span>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function ExportUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="claims-config-info-banner" role="status">
      <span className="claims-config-info-banner__icon" aria-hidden="true">i</span>
      <span className="claims-config-info-banner__message">{message}</span>
      <button
        className="claims-config-info-banner__close"
        type="button"
        onClick={onDone}
        aria-label="Close notification"
      >
        ✕
      </button>
    </div>
  );
}

function sortRows(rows: ConfigurationListItem[], key: SortKey, dir: SortDir) {
  return [...rows].sort((a, b) => {
    const av = a[key] === '-' ? '' : a[key];
    const bv = b[key] === '-' ? '' : b[key];
    if (av === '' && bv !== '') return 1;
    if (bv === '' && av !== '') return -1;
    const cmp = av.localeCompare(bv);
    return dir === 'asc' ? cmp : -cmp;
  });
}

export default function ClaimsMasterConfigPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [toast, setToast] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const { order: colOrder, dragging: draggingCol, headerProps } = useColumnOrder<SortKey>(GRID_COLUMNS.map(col => col.key));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearchChange(val: string) {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key as SortKey);
      setSortDir('asc');
    }
  }

  const { data: rawRows = [], isLoading } = useQuery({
    queryKey: ['configurations', debouncedSearch],
    queryFn: () => configurationsApi.getList(debouncedSearch || undefined),
  });

  const rows = sortKey ? sortRows(rawRows, sortKey, sortDir) : rawRows;

  function handleExport(id: number) {
    const a = document.createElement('a');
    a.href = configurationsApi.exportXlsx(id);
    a.download = `configuration-${id}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const TH: React.CSSProperties = {
    padding: '11px 16px',
    borderBottom: '1px solid #e5e7eb',
    textAlign: 'left',
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    background: '#fff',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none',
  };

  const TD: React.CSSProperties = {
    padding: '13px 16px',
    borderBottom: '1px solid #f0f2f5',
    fontSize: 13,
    color: '#111827',
    verticalAlign: 'middle',
  };

  return (
    <div style={{ padding: '24px 28px 40px', background: '#fff', minHeight: '100%' }}>
      {toast && <Toast message={toast} onDone={() => setToast('')} />}

      <h1 style={{ margin: '0 0 22px', fontSize: 22, fontWeight: 700, color: '#111827' }}>
        Claim Master Configuration
      </h1>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ position: 'relative', width: 340 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', lineHeight: 1 }}>
            <SearchIcon />
          </span>
          <input
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search By Keyword"
            style={{
              width: '100%', paddingLeft: 36, paddingRight: 12,
              height: 38, fontSize: 13, borderRadius: 4,
              border: '1px solid #d1d5db', background: '#fff',
              outline: 'none', color: '#111827', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setToast('The feature is currently unavailable !!')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            height: 38, padding: '0 20px', borderRadius: 4,
            background: '#0B5AA0', color: '#fff', border: 'none',
            cursor: 'pointer', fontSize: 14, fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1, fontWeight: 400 }}>+</span>
          Add Configuration
        </button>
      </div>

      {/* Table */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 4, overflow: 'hidden', background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 120, textAlign: 'right', cursor: 'default' }}>
                Action
              </th>
              {colOrder.map(key => {
                const col = GRID_COLUMNS.find(item => item.key === key)!;
                return <th {...headerProps(key)} key={key} style={{ ...TH, width: col.width, cursor: 'grab', opacity: draggingCol === key ? 0.55 : 1 }} onClick={() => handleSort(key)}>{col.label}<SortIcon active={sortKey === key} dir={sortKey === key ? sortDir : 'asc'} /></th>;
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} style={{ ...TD, textAlign: 'center', color: '#94a3b8', padding: 48 }}>
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ ...TD, textAlign: 'center', color: '#94a3b8', padding: 48 }}>
                  No Data Available
                </td>
              </tr>
            ) : rows.map(row => (
              <tr key={row.id} style={{ background: '#fff' }}>
                <td style={{ ...TD, textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <button
                      title="View"
                      onClick={() => navigate(`/claims/master-configuration/${row.id}/view`)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, lineHeight: 1, display: 'flex' }}
                    >
                      <EyeIcon />
                    </button>
                    <button
                      title="Edit"
                      onClick={() => navigate(`/claims/master-configuration/${row.id}/edit`)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, lineHeight: 1, display: 'flex' }}
                    >
                      <EditIcon />
                    </button>
                    <button
                      title="Export"
                      onClick={() => handleExport(row.id)}
                      style={{ background: 'none', cursor: 'pointer', color: '#0B5AA0', padding: 4, lineHeight: 1, display: 'flex', border: '1px solid #0B5AA0', borderRadius: 3 }}
                    >
                      <ExportUpIcon />
                    </button>
                  </div>
                </td>
                {colOrder.map(key => <td key={key} style={{ ...TD, color: key === 'lastModifiedBy' && row.lastModifiedBy !== '-' ? '#0B5AA0' : key === 'tableName' ? '#111827' : '#374151' }}>{row[key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
