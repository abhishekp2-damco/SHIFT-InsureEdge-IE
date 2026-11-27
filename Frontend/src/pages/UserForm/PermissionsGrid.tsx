import { useState, useMemo } from 'react'
import type { ModuleRow, PermissionInput, ScreenRow } from '../../types/User'
import { sanitizePermissions } from '../../api/users'
import { Toggle } from '../../components/PermissionMatrix/PermissionMatrix'

const PERM_COLS = [
  { key: 'isViewPermission',      label: 'View' },
  { key: 'isCreatePermission',    label: 'Add' },
  { key: 'isEditPermission',      label: 'Edit' },
  { key: 'isDuplicatePermission', label: 'Clone' },
  { key: 'isUploadPermission',    label: 'Upload' },
  { key: 'isDownloadPermission',  label: 'Download' },
  { key: 'isViewSensitiveInfo',   label: 'Sensitive Data' },
  { key: 'isAccessSensitiveDoc',  label: 'Sensitive Documents' },
  { key: 'isApproveReject',       label: 'Approve/Reject' },
] as const

type PermKey = (typeof PERM_COLS)[number]['key']

const QUOTES_POLICIES = 'Quotes & Policies'

const REPORT_CLAIMS = new Set([
  'CLAIMMANAGEMENTREPORT', 'CLAIMFINANCIALREPORT', 'LOSSEXPOSUREREPORT',
  'COMPLIANCEREPORT', 'CATASTROPHEREPORT',
])
const REPORT_POLICIES = new Set(['POLICYISSUANCE', 'NEWBUSINESSPREMIUM', 'TRANSACTIONTYPEREPORT'])

function sectionName(moduleName: string, screen: ScreenRow): string {
  const code = screen.screenCode.toUpperCase()
  if (moduleName === QUOTES_POLICIES) return 'Individual'
  if (moduleName === 'Claims') return screen.screenName
  if (moduleName === 'Billing Management') return 'Payments'
  if (moduleName === 'Report Management') {
    if (code === 'MGATOISSUERREPORT') return 'Bordereaux'
    if (REPORT_CLAIMS.has(code)) return 'Claims'
    if (REPORT_POLICIES.has(code)) return 'Policies'
    if (code === 'COMMISIONS') return 'Commissions'
  }
  if (moduleName === 'Accounts Maintenance') {
    return code === 'BUSINESSACCOUNTS' ? 'Business' : 'Individual'
  }
  if (moduleName === 'Document Management') {
    if (code === 'POLICYCOMMON') return 'Policy'
    if (code === 'CLAIMSCOMMON') return 'Claims'
    if (code === 'BILLINGCOMMON') return 'Billing'
  }
  return moduleName
}

function groupScreens(moduleName: string, screens: ScreenRow[]) {
  return screens.reduce<Array<{ name: string; screens: ScreenRow[] }>>((groups, screen) => {
    const name = sectionName(moduleName, screen)
    const current = groups[groups.length - 1]
    if (current?.name === name) current.screens.push(screen)
    else groups.push({ name, screens: [screen] })
    return groups
  }, [])
}

interface Props {
  modules: ModuleRow[]
  permissions: PermissionInput[]
  onChange: (permissions: PermissionInput[]) => void
  readOnly?: boolean
  searchQuery?: string
}

function emptyPerm(screenId: number): PermissionInput {
  return {
    screenId,
    isViewPermission: false, isCreatePermission: false, isEditPermission: false,
    isDuplicatePermission: false, isUploadPermission: false, isDownloadPermission: false,
    isViewSensitiveInfo: false, isAccessSensitiveDoc: false, isApproveReject: false,
    allAccess: false,
  }
}

function makeReadOnly(screenId: number): PermissionInput {
  return { ...emptyPerm(screenId), isViewPermission: true }
}

function makeAllAccess(screenId: number): PermissionInput {
  return {
    screenId,
    isViewPermission: true, isCreatePermission: true, isEditPermission: true,
    isDuplicatePermission: true, isUploadPermission: true, isDownloadPermission: true,
    isViewSensitiveInfo: true, isAccessSensitiveDoc: true, isApproveReject: true,
    allAccess: true,
  }
}

export default function PermissionsGrid({ modules, permissions, onChange, readOnly, searchQuery }: Props) {
  const [openMods, setOpenMods] = useState<Set<number>>(new Set())
  const [internalSearch, setInternalSearch] = useState('')

  const search = searchQuery ?? internalSearch

  const permMap = useMemo(() => {
    const m = new Map<number, PermissionInput>()
    for (const p of permissions) m.set(p.screenId, p)
    return m
  }, [permissions])

  const getPerm = (screenId: number): PermissionInput => permMap.get(screenId) ?? emptyPerm(screenId)

  function setPerm(screenId: number, key: PermKey, val: boolean) {
    const current = getPerm(screenId)
    const updated = { ...current, [key]: val }
    updated.allAccess = PERM_COLS.every(c => updated[c.key])
    onChange(sanitizePermissions(permissions.filter(p => p.screenId !== screenId).concat(updated)))
  }

  function applyToModule(moduleId: number, builder: (id: number) => PermissionInput) {
    const mod = modules.find(m => m.id === moduleId)
    if (!mod) return
    const screenIds = new Set(mod.screens.map(s => s.id))
    const updated = permissions.filter(p => !screenIds.has(p.screenId))
    for (const s of mod.screens) updated.push(builder(s.id))
    onChange(sanitizePermissions(updated))
  }

  // A module's switch is on when every screen holds exactly what that switch grants.
  function moduleMatches(mod: ModuleRow, builder: (id: number) => PermissionInput) {
    return mod.screens.length > 0 && mod.screens.every(s => {
      const target = builder(s.id);
      const p = getPerm(s.id);
      return PERM_COLS.every(c => p[c.key] === target[c.key]);
    });
  }

  function toggleModule(moduleId: number) {
    setOpenMods(prev => {
      const next = new Set(prev)
      next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId)
      return next
    })
  }

  const filteredModules = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return modules
    return modules.filter(m =>
      m.moduleName.toLowerCase().includes(q) ||
      m.screens.some(s => s.screenName.toLowerCase().includes(q))
    )
  }, [modules, search])

  return (
    <div>
      {/* Internal search — only when parent doesn't own the search bar */}
      {searchQuery === undefined && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ position: 'relative', maxWidth: 340 }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 14 }}>⌕</span>
            <input value={internalSearch} onChange={e => setInternalSearch(e.target.value)}
              placeholder="Enter module or feature name"
              style={{ paddingLeft: 28, paddingRight: 12, paddingTop: 7, paddingBottom: 7, fontSize: 13, border: '1px solid #d1d5db', borderRadius: 4, width: '100%', outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filteredModules.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
            {modules.length === 0 ? 'Loading modules…' : 'No Data Available'}
          </div>
        )}

        {filteredModules.map(mod => {
          const open = openMods.has(mod.id)
          const sections = groupScreens(mod.moduleName, mod.screens)
          return (
            <div key={mod.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>

              {/* Module header */}
              <div style={{ display: 'flex', alignItems: 'center', background: open ? '#eff6ff' : '#fff', userSelect: 'none' }}>
                <div
                  onClick={() => toggleModule(mod.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', flex: 1, cursor: 'pointer' }}
                >
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 20, height: 20, borderRadius: '50%',
                    border: '2px solid #93c5fd', color: '#1d4ed8',
                    fontSize: 13, fontWeight: 700, flexShrink: 0,
                  }}>
                    {open ? '−' : '+'}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#1d4ed8' }}>{mod.moduleName}</span>
                </div>

                {/* UM-06: Read Only / All Access are switches — a second click turns them off
                    and clears the module's permissions (QA Q3 default, same as Group Rights). */}
                <div style={{ display: 'flex', gap: 14, padding: '0 14px' }}>
                  <Toggle label="Read Only" disabled={Boolean(readOnly)}
                    checked={moduleMatches(mod, makeReadOnly)}
                    onChange={on => applyToModule(mod.id, on ? makeReadOnly : emptyPerm)} />
                  <Toggle label="All Access" disabled={Boolean(readOnly)}
                    checked={moduleMatches(mod, makeAllAccess)}
                    onChange={on => applyToModule(mod.id, on ? makeAllAccess : emptyPerm)} />
                </div>
              </div>

              {/* Screen rows table */}
              {open && (
                <div style={{ overflowX: 'auto', borderTop: '1px solid #e5e7eb' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    {sections.map((section, sectionIndex) => (
                    <tbody key={`${section.name}-${sectionIndex}`}>
                      <tr style={{ background: '#f9fafb', borderTop: sectionIndex ? '1px solid #e5e7eb' : undefined }}>
                        <th style={{ padding: '7px 12px 7px 28px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: '#374151', minWidth: 180 }}>
                          {section.name}
                        </th>
                        {PERM_COLS.map(c => (
                          <th key={c.key} style={{ padding: '7px 6px', textAlign: 'center', fontWeight: 600, fontSize: 11, color: '#374151', minWidth: 65, whiteSpace: 'nowrap' }}>
                            {c.label}
                          </th>
                        ))}
                      </tr>
                      {section.screens.map(screen => {
                        const p = getPerm(screen.id)
                        return (
                          <tr key={screen.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '7px 12px 7px 28px', color: '#374151' }}>
                              {screen.screenName}
                            </td>
                            {PERM_COLS.map(col => {
                              const val = p[col.key as PermKey]
                              return (
                                <td key={col.key} style={{ textAlign: 'center', padding: '7px 4px' }}>
                                  {readOnly ? (
                                    <span style={{ fontSize: 15, color: val ? '#16a34a' : '#d1d5db' }}>
                                      {val ? '✓' : '–'}
                                    </span>
                                  ) : (
                                    <input type="checkbox" checked={val}
                                      onChange={e => setPerm(screen.id, col.key as PermKey, e.target.checked)}
                                      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#0B5AA0' }} />
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                    ))}
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
