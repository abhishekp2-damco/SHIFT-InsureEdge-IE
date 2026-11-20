// Group member picker used by Add Group. Selection is staged in the modal and
// only committed to the group form when Save is selected.
import { useEffect, useMemo, useState } from 'react';
import type { UserSelectDto } from '../../types/User';
import {
  filterAndSortMembers, normalizeMemberIds, toggleMember, type MemberSort,
} from './groupMembers';

interface Props {
  selectedIds: number[];
  users: UserSelectDto[];
  onChange: (ids: number[]) => void;
  readOnly?: boolean;
  isLoading?: boolean;
  loadError?: string | null;
}

const SearchIcon = () => (
  <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="#687386" strokeWidth="1.8">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

function MemberSearch({ value, onChange, placeholder }: {
  value: string; onChange: (value: string) => void; placeholder: string;
}) {
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
      <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', display: 'flex', pointerEvents: 'none' }}>
        <SearchIcon />
      </span>
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={event => onChange(event.target.value)}
        style={{ width: '100%', height: 28, padding: '5px 9px 5px 31px', borderRadius: 2, fontSize: 11, background: '#f8f9fc' }}
      />
    </div>
  );
}

function AddMembersModal({ users, selectedIds, onCancel, onSave }: {
  users: UserSelectDto[];
  selectedIds: number[];
  onCancel: () => void;
  onSave: (ids: number[]) => void;
}) {
  const [draftIds, setDraftIds] = useState(() => normalizeMemberIds(selectedIds));
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<MemberSort | ''>('');
  const visibleUsers = useMemo(
    () => filterAndSortMembers(users, search, sort || 'alphabetical'),
    [users, search, sort],
  );

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onCancel]);

  return (
    <div
      role="presentation"
      onMouseDown={event => { if (event.currentTarget === event.target) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(17, 24, 39, 0.34)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-user-to-group-title"
        style={{
          width: 510, maxWidth: '100%', height: 'min(730px, calc(100vh - 32px))',
          display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 7,
          boxShadow: '0 12px 35px rgba(15, 23, 42, 0.24)', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 13px 12px', borderBottom: '1px solid #d9dde4' }}>
          <h2 id="add-user-to-group-title" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#252a31' }}>Add User To Group</h2>
          <button type="button" aria-label="Close Add User To Group" onClick={onCancel}
            style={{ width: 28, height: 28, padding: 0, border: 0, background: 'transparent', fontSize: 27, lineHeight: 1, color: '#252a31' }}>
            ×
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 13px', borderBottom: '1px solid #d9dde4', fontSize: 11 }}>
          <strong>Selected Users</strong>
          <span>Total : &nbsp;{draftIds.length}</span>
        </div>

        <div style={{ padding: 13, flex: 1, minHeight: 0 }}>
          <div style={{ height: '100%', border: '1px solid #d9dde4', borderRadius: 5, padding: 11, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <MemberSearch value={search} onChange={setSearch} placeholder="Search By Name or Email ID" />
              <select aria-label="Sort users" value={sort} onChange={event => setSort(event.target.value as MemberSort | '')}
                style={{ width: 112, height: 28, padding: '0 9px', borderRadius: 3, fontSize: 11, background: '#fff' }}>
                <option value="">Sort By</option>
                <option value="alphabetical">Alphabetical</option>
                <option value="creationDate">Creation Date</option>
              </select>
            </div>

            <div style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(138px, 1fr))', gap: 10, alignContent: 'start' }}>
              {visibleUsers.map(user => {
                const selected = draftIds.includes(user.id);
                return (
                  <label key={user.id} style={{
                    minWidth: 0, minHeight: 44, border: `1px solid ${selected ? '#0B5AA0' : '#d9dde4'}`,
                    background: selected ? '#f1f7fd' : '#f8f9fc', padding: '7px 8px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span aria-hidden="true" style={{
                      width: 31, height: 31, flex: '0 0 31px', borderRadius: '50%', background: '#dff3ff', color: '#0B5AA0',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600,
                    }}>{user.initials}</span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span title={user.fullName} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: '#252a31' }}>{user.fullName}</span>
                      <span title={user.email} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9, color: '#687386' }}>{user.email}</span>
                    </span>
                    <input
                      type="checkbox"
                      aria-label={`Select ${user.fullName}`}
                      checked={selected}
                      onChange={() => setDraftIds(current => toggleMember(current, user.id))}
                      style={{ width: 16, height: 16, flex: '0 0 auto' }}
                    />
                  </label>
                );
              })}
              {visibleUsers.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: 28, textAlign: 'center', color: '#687386', fontSize: 11 }}>
                  No Data Available
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '8px 13px', borderTop: '1px solid #d9dde4' }}>
          <button type="button" className="btn-secondary" onClick={onCancel} style={{ minWidth: 106 }}>Cancel</button>
          <button type="button" className="btn-primary" onClick={() => onSave(normalizeMemberIds(draftIds))} style={{ minWidth: 106 }}>Save</button>
        </div>
      </div>
    </div>
  );
}

export default function GroupMembersPanel({
  selectedIds, users, onChange, readOnly, isLoading = false, loadError = null,
}: Props) {
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const selectedUsers = useMemo(
    () => filterAndSortMembers(users.filter(user => selectedIds.includes(user.id)), search, 'alphabetical'),
    [users, selectedIds, search],
  );

  return (
    <div className="card" style={{ padding: '12px 13px', border: '1px solid #d9dde4', borderRadius: 6, boxShadow: 'none' }}>
      <h3 style={{ margin: '0 0 7px', fontSize: 14, fontWeight: 600 }}>
        {selectedIds.length} Group Members
      </h3>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <MemberSearch value={search} onChange={setSearch} placeholder="Enter member name you are looking for" />
        {!readOnly && (
          <button
            type="button"
            className="btn-secondary"
            disabled={isLoading || !!loadError}
            onClick={() => setModalOpen(true)}
            style={{ height: 28, minWidth: 106, padding: '0 12px', color: '#0B5AA0', borderColor: '#0B5AA0' }}
          >
            <span aria-hidden="true" style={{ fontSize: 17, marginRight: 7, lineHeight: 0 }}>+</span>
            Add User
          </button>
        )}
      </div>

      <div style={{ marginTop: 12, minHeight: 72 }}>
        {isLoading && <div style={{ padding: 16, textAlign: 'center', color: '#687386', fontSize: 11 }}>Loading users...</div>}
        {!isLoading && loadError && <div role="alert" style={{ padding: 16, textAlign: 'center', color: 'var(--color-danger)', fontSize: 11 }}>{loadError}</div>}
        {!isLoading && !loadError && selectedUsers.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: '#252a31', fontSize: 11 }}>
            {selectedIds.length > 0 && search.trim() ? 'No Data Available' : 'No User Added'}
          </div>
        )}
        {!isLoading && !loadError && selectedUsers.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {selectedUsers.map(user => (
              <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180, maxWidth: 260, border: '1px solid #d9dde4', background: '#f8f9fc', padding: '7px 9px' }}>
                <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: '50%', background: '#dff3ff', color: '#0B5AA0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>{user.initials}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{user.fullName}</span>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9, color: '#687386' }}>{user.email}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <AddMembersModal
          users={users}
          selectedIds={selectedIds}
          onCancel={() => setModalOpen(false)}
          onSave={ids => { onChange(ids); setModalOpen(false); }}
        />
      )}
    </div>
  );
}
