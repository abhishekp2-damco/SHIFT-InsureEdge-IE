// US-006/US-012: Permission matrix — one expandable card per module, 9 permission columns.
// BR-009: "Read Only" per module sets View=true, all others=false for that module's screens.
// BR-010: "All Access" per module sets all 9=true for that module's screens.
// US-013: Search filter narrows visible screens.
// QA UGM-09: card per module with its own header row; Read Only / All Access are toggle
// switches; modules keep the API order (module.sort_order), not alphabetical.
import { useState, useMemo } from 'react';
import type { ScreenPermissionDto, ScreenPermissionSaveDto } from '../../types/Group';

interface Props {
  permissions: ScreenPermissionDto[];
  readOnly?: boolean;
  onChange?: (updated: ScreenPermissionSaveDto[]) => void;
}

export type PermissionKey = Exclude<keyof ScreenPermissionSaveDto, 'screenId'>;

export const PERMISSION_COLS: { key: PermissionKey; label: string }[] = [
  { key: 'isViewPermission',      label: 'View' },
  { key: 'isCreatePermission',    label: 'Add' },
  { key: 'isEditPermission',      label: 'Edit' },
  { key: 'isDuplicatePermission', label: 'Clone' },
  { key: 'isUploadPermission',    label: 'Upload' },
  { key: 'isDownloadPermission',  label: 'Download' },
  { key: 'isViewSensitiveInfo',   label: 'Sensitive Data' },
  { key: 'isAccessSensitiveDoc',  label: 'Sensitive Documents' },
  { key: 'isApproveReject',       label: 'Approve/Reject' },
];

export const PERMISSION_KEYS: PermissionKey[] = PERMISSION_COLS.map(c => c.key);

// The H&B OutSystems matrix does not expose every permission for every Quotes &
// Policies screen. Key by screen code so display-label changes cannot alter the
// permission model. Screens not listed here support the complete permission set.
const SCREEN_PERMISSION_KEYS: Partial<Record<string, readonly PermissionKey[]>> = {
  NEWBUSINESSINDIVIDUAL: [
    'isViewPermission', 'isCreatePermission', 'isEditPermission', 'isUploadPermission',
  ],
  ENDORSEMENTINDIVIDUAL: [
    'isViewPermission', 'isCreatePermission', 'isEditPermission', 'isViewSensitiveInfo',
  ],
  RENEWALINDIVIDUAL: ['isViewPermission', 'isCreatePermission', 'isEditPermission'],
  POLICIESINDIVIDUAL: ['isViewPermission', 'isCreatePermission', 'isEditPermission'],
  POLICYSUMMARY: ['isViewPermission', 'isCreatePermission', 'isEditPermission'],
};

export const OUTSYSTEMS_MODULE_ORDER: Record<string, number> = {
  Dashboard: 1,
  'Quotes & Policies': 2,
  Claims: 3,
  'User Management': 4,
  'User Groups Management': 5,
  'Distribution Management': 6,
  'Billing Management': 7,
  'Report Management': 8,
  'Client Management': 9,
  'Accounts Maintenance': 10,
  'Insurance Product Maintenance': 11,
  'Document Management': 12,
};

function applicableKeys(screen: Pick<ScreenPermissionDto, 'screenCode'>): readonly PermissionKey[] {
  return SCREEN_PERMISSION_KEYS[screen.screenCode.toUpperCase()] ?? PERMISSION_KEYS;
}

export function isPermissionApplicable(
  screen: Pick<ScreenPermissionDto, 'screenCode'>,
  key: PermissionKey,
): boolean {
  return applicableKeys(screen).includes(key);
}

export function permissionSectionLabel(moduleName: string): string {
  return moduleName === 'Quotes & Policies' ? 'Individual' : moduleName;
}

export function comparePermissionModules(left: string, right: string): number {
  return (OUTSYSTEMS_MODULE_ORDER[left] ?? Number.MAX_SAFE_INTEGER)
    - (OUTSYSTEMS_MODULE_ORDER[right] ?? Number.MAX_SAFE_INTEGER);
}

export function normalizePermissionSave(screen: ScreenPermissionDto): ScreenPermissionSaveDto {
  const normalized = { screenId: screen.screenId } as ScreenPermissionSaveDto;
  for (const key of PERMISSION_KEYS) {
    normalized[key] = isPermissionApplicable(screen, key) && Boolean(screen[key]);
  }
  return normalized;
}

function build(screenId: number, on: (key: PermissionKey) => boolean): ScreenPermissionSaveDto {
  const p = { screenId } as ScreenPermissionSaveDto;
  for (const key of PERMISSION_KEYS) p[key] = on(key);
  return p;
}
const makeReadOnly = (screen: ScreenPermissionDto) =>
  build(screen.screenId, key => key === 'isViewPermission' && isPermissionApplicable(screen, key));
const makeAllAccess = (screen: ScreenPermissionDto) =>
  build(screen.screenId, key => isPermissionApplicable(screen, key));
const makeNoAccess = (screen: ScreenPermissionDto) => build(screen.screenId, () => false);

export default function PermissionMatrix({ permissions, readOnly, onChange }: Props) {
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Record<number, ScreenPermissionSaveDto>>(() => {
    const map: Record<number, ScreenPermissionSaveDto> = {};
    for (const p of permissions) map[p.screenId] = normalizePermissionSave(p);
    return map;
  });

  // Sync draft when permissions list changes (e.g. first load of screens)
  const permKey = permissions.map(p => p.screenId).join(',');
  const [lastKey, setLastKey] = useState(permKey);
  if (permKey !== lastKey) {
    const map: Record<number, ScreenPermissionSaveDto> = {};
    for (const p of permissions) map[p.screenId] = normalizePermissionSave(p);
    setDraft(map);
    setLastKey(permKey);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return permissions;
    const q = search.toLowerCase();
    return permissions.filter(p =>
      p.screenName.toLowerCase().includes(q) || p.moduleName.toLowerCase().includes(q));
  }, [permissions, search]);

  // Map keeps insertion order, i.e. the API's module order.
  const modules = useMemo(() => {
    const map = new Map<string, ScreenPermissionDto[]>();
    for (const p of filtered) {
      if (!map.has(p.moduleName)) map.set(p.moduleName, []);
      map.get(p.moduleName)!.push(p);
    }
    return new Map(Array.from(map.entries()).sort(([left], [right]) =>
      comparePermissionModules(left, right)));
  }, [filtered]);

  const applyToScreens = (
    moduleScreens: ScreenPermissionDto[],
    builder: (screen: ScreenPermissionDto) => ScreenPermissionSaveDto,
  ) => {
    if (readOnly) return;
    const updated = { ...draft };
    for (const screen of moduleScreens) updated[screen.screenId] = builder(screen);
    setDraft(updated);
    onChange?.(Object.values(updated));
  };

  const updateOne = (screen: ScreenPermissionDto, field: PermissionKey, value: boolean) => {
    if (readOnly || !isPermissionApplicable(screen, field)) return;
    const screenId = screen.screenId;
    const updated = { ...draft, [screenId]: { ...draft[screenId], [field]: value } };
    setDraft(updated);
    onChange?.(Object.values(updated));
  };

  if (permissions.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
        Loading screens…
      </div>
    );
  }

  return (
    <div>
      {/* Search */}
      <div className="rgt-search-row" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div className="rgt-search-wrap" style={{ width: 'min(100%, 574px)', maxWidth: 'none' }}>
          <span className="rgt-search-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            className="rgt-search-input"
            type="search"
            aria-label="Search modules or features"
            placeholder="Enter module or feature name"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {modules.size === 0 && (
        <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No Data Available</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Array.from(modules.entries()).map(([moduleName, screens]) => (
          <ModuleCard
            key={moduleName}
            moduleName={moduleName}
            screens={screens}
            draft={draft}
            readOnly={!!readOnly}
            onUpdate={updateOne}
            onApplyToModule={builder => applyToScreens(screens, builder)}
          />
        ))}
      </div>
    </div>
  );
}

function ModuleCard({
  moduleName, screens, draft, readOnly, onUpdate, onApplyToModule,
}: {
  moduleName: string;
  screens: ScreenPermissionDto[];
  draft: Record<number, ScreenPermissionSaveDto>;
  readOnly: boolean;
  onUpdate: (screen: ScreenPermissionDto, field: PermissionKey, value: boolean) => void;
  onApplyToModule: (builder: (screen: ScreenPermissionDto) => ScreenPermissionSaveDto) => void;
}) {
  const [open, setOpen] = useState(false);

  const matches = (builder: (screen: ScreenPermissionDto) => ScreenPermissionSaveDto) =>
    screens.every(s => {
      const expected = builder(s);
      return PERMISSION_KEYS.every(k => !!draft[s.screenId]?.[k] === expected[k]);
    });
  const isReadOnly = matches(makeReadOnly);
  const isAllAccess = matches(makeAllAccess);

  return (
    <div style={{ border: '1px solid #d9dde4', borderRadius: 4, overflow: 'hidden', background: '#fff' }}>
      {/* Module header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        padding: '9px 12px', background: '#fff',
        borderBottom: open ? '1px solid #d9dde4' : 'none',
      }}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: 0, width: 'auto',
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
            fontSize: 13, fontWeight: 600, color: '#252a31',
          }}
        >
          <span aria-hidden="true" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 16, height: 16, border: '1px solid #6b7280', borderRadius: '50%',
            fontSize: 13, lineHeight: 1, fontWeight: 400, color: '#4b5563',
          }}>{open ? '−' : '+'}</span>
          {moduleName}
        </button>
        <Toggle
          label="Read Only"
          checked={isReadOnly}
          disabled={readOnly}
          onChange={on => onApplyToModule(on ? makeReadOnly : makeNoAccess)}
        />
        <Toggle
          label="All Access"
          checked={isAllAccess}
          disabled={readOnly}
          onChange={on => onApplyToModule(on ? makeAllAccess : makeNoAccess)}
        />
      </div>

      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#fff' }}>
                <th style={thStyle('left', 200)}>
                  {permissionSectionLabel(moduleName)}
                </th>
                {PERMISSION_COLS.map(c => (
                  <th key={c.key} style={thStyle('center', 75)}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {screens.map(screen => (
                <tr key={screen.screenId} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '7px 12px', color: '#374151' }}>{screen.screenName}</td>
                  {PERMISSION_COLS.map(col => {
                    const applicable = isPermissionApplicable(screen, col.key);
                    const val = applicable && !!draft[screen.screenId]?.[col.key];
                    return (
                      <td key={col.key} style={{ textAlign: 'center', padding: '7px 4px' }}>
                        {applicable ? (
                          <input
                            type="checkbox"
                            aria-label={`${screen.screenName} ${col.label}`}
                            checked={val}
                            disabled={readOnly}
                            onChange={e => onUpdate(screen, col.key, e.target.checked)}
                            style={{ width: 15, height: 15, cursor: readOnly ? 'default' : 'pointer', accentColor: '#0B5AA0' }}
                          />
                        ) : (
                          <span
                            aria-label={`${screen.screenName} ${col.label} not available`}
                            title="This permission does not apply to this screen"
                            style={{ color: '#b8bec7', fontSize: 17, lineHeight: 1 }}
                          >⊘</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Toggle({ label, checked, disabled, onChange }: {
  label: string; checked: boolean; disabled: boolean; onChange: (on: boolean) => void;
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 500, color: '#374151', cursor: disabled ? 'default' : 'pointer', margin: 0 }}>
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative', display: 'inline-flex', width: 32, height: 17, flexShrink: 0,
          borderRadius: 999, border: 'none', padding: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: checked ? '#1769aa' : '#d1d5db', transition: 'background 0.2s',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: checked ? 17 : 2, width: 13, height: 13,
          borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
        }} />
      </button>
    </label>
  );
}

function thStyle(align: 'left' | 'center', minWidth: number): React.CSSProperties {
  return {
    textAlign: align, padding: '8px 12px', fontWeight: 600, fontSize: 12,
    color: '#6b7280', borderBottom: '1px solid #e5e7eb',
    minWidth, whiteSpace: 'nowrap',
  };
}
