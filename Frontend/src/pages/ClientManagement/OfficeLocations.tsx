// AI_GENERATED | HUMAN_VALIDATION_REQUIRED
// Additional Office Locations: search strip, office cards and the Add/View/Edit pop-up (QA report §5.5/§5.6).
import { type CSSProperties, type ReactNode, useMemo, useState } from 'react';
import type { OfficeDto, SaveContactRequest, SaveOfficeRequest } from '../../types/ClientManagement';
import { AddressEditor, type AddressForm, toAddressForm } from './AddressEditor';
import {
  ConfirmModal, ContactListEditor, Field, Select, TextInput, toContactRequest, validateContactList,
} from './ClientFormFields';
import { CANADA, type Errors, OFFICE_TYPES, apiErrorMessage, pickErrors, validateAddress } from './validation';

type Mode = 'view' | 'edit';

interface OfficeForm {
  officeName: string;
  officeType: string;
  address: AddressForm;
  primary: SaveContactRequest;
  secondaries: SaveContactRequest[];
}

const toForm = (o?: OfficeDto): OfficeForm => ({
  officeName: o?.officeName ?? '',
  officeType: o?.officeType ?? '',
  address: toAddressForm(o ? { ...o, isManual: false } : null),
  primary: toContactRequest(o && {
    contactType: 'Primary', name: o.contactName, suffix: o.contactSuffix, title: o.contactTitle, emailId: o.contactEmail,
    telephoneNumber: o.contactPhone, telephoneNumberCc: o.contactPhoneCc, extension: o.contactExt,
    altTelephoneNumber: o.contactAltPhone, altTelephoneNumberCc: o.contactAltPhoneCc,
  }),
  secondaries: (o?.secondaryContacts ?? []).map(toContactRequest),
});

const toRequest = (id: number | undefined, f: OfficeForm): SaveOfficeRequest => ({
  id,
  officeName: f.officeName.trim(),
  officeType: f.officeType,
  addressLine1: f.address.addressLine1,
  addressLine2: f.address.addressLine2,
  country: f.address.country,
  state: f.address.state,
  city: f.address.city,
  county: f.address.country === CANADA ? '' : f.address.county,
  zipCode: f.address.zipCode,
  latitude: f.address.latitude,
  longitude: f.address.longitude,
  contactName: f.primary.name,
  contactSuffix: f.primary.suffix,
  contactTitle: f.primary.title,
  contactEmail: f.primary.emailId,
  contactPhone: f.primary.telephoneNumber,
  contactPhoneCc: f.primary.telephoneNumberCc,
  contactExt: f.primary.extension,
  contactAltPhone: f.primary.altTelephoneNumber,
  contactAltPhoneCc: f.primary.altTelephoneNumberCc,
  secondaryContacts: f.secondaries,
});

function validateOffice(f: OfficeForm): Errors {
  const e: Errors = {};
  if (!f.officeName.trim()) e.officeName = 'Provide Office Name to continue';
  if (!f.officeType) e.officeType = 'Provide Office Type to continue';
  for (const [k, v] of Object.entries(validateAddress(f.address, {
    validateRegionMembership: false,
    forbidCanadaCounty: false,
  }))) e[`addr.${k}`] = v;
  Object.assign(e, validateContactList(f.primary, f.secondaries));
  return e;
}

export const formatAddress = (a: { addressLine1?: string; addressLine2?: string; city?: string; state?: string; zipCode?: string; country?: string }) =>
  [a.addressLine1, a.addressLine2, a.country, a.state, a.city, a.zipCode].filter(Boolean).join(' ');

// ── Pop-up ─────────────────────────────────────────────────────────────────────
function OfficeModal({ office, initialMode, onSave, onClose }: {
  office?: OfficeDto;
  initialMode: Mode;
  onSave: (req: SaveOfficeRequest) => Promise<void>;
  onClose: () => void;
}) {
  const initial = useMemo(() => toForm(office), [office]);
  const [form, setForm] = useState<OfficeForm>(initial);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const viewing = mode === 'view';
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  // Re-validate live once the user has tried to save, so errors clear as fields are fixed.
  const update = (next: OfficeForm) => { setForm(next); if (submitted) setErrors(validateOffice(next)); };
  const updateWith = (fn: (prev: OfficeForm) => OfficeForm) => setForm(prev => {
    const next = fn(prev);
    if (submitted) setErrors(validateOffice(next));
    return next;
  });

  const handleCancel = () => (dirty ? setConfirmCancel(true) : onClose());

  const handleSave = async () => {
    setSubmitted(true);
    const errs = validateOffice(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true); setServerError('');
    try { await onSave(toRequest(office?.id, form)); onClose(); }
    catch (err) { setServerError(apiErrorMessage(err, 'Failed to save. Please try again.')); }
    finally { setSaving(false); }
  };

  const title = viewing ? 'View Office Location' : office ? 'Edit Office Location' : 'Add Additional Office Location';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div role="dialog" aria-modal="true" className="cm-scope" style={{ background: '#fff', borderRadius: 6, padding: 24, width: 1040, maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #d8dee6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#111827', margin: 0 }}>{title}</h2>
          <button type="button" aria-label="Close" onClick={viewing ? onClose : handleCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 20 }}>×</button>
        </div>
        {serverError && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 4, fontSize: 13, marginBottom: 14 }}>{serverError}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 28 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#374151', marginBottom: 14 }}>Office Address</div>
            <div className="fg2">
              <Field label="Office Name" required error={errors.officeName}>
                <TextInput value={form.officeName} onChange={v => update({ ...form, officeName: v })} maxLength={75} error={errors.officeName} disabled={viewing} />
              </Field>
              <Field label="Office Type" required error={errors.officeType}>
                <Select value={form.officeType} onChange={v => update({ ...form, officeType: v })} options={OFFICE_TYPES} error={errors.officeType} disabled={viewing} />
              </Field>
            </div>
            <AddressEditor value={form.address} disabled={viewing} errors={pickErrors('addr.', errors)}
              onChange={fn => updateWith(prev => ({ ...prev, address: fn(prev.address) }))} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#374151', marginBottom: 14 }}>Office Contact Details</div>
            <ContactListEditor cols={2} disabled={viewing} errors={errors}
              primary={form.primary} secondaries={form.secondaries}
              onPrimaryChange={primary => update({ ...form, primary })}
              onSecondariesChange={secondaries => update({ ...form, secondaries })} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          {viewing ? (
            <>
              <button type="button" onClick={onClose} style={btnSecondary}>Close</button>
              <button type="button" onClick={() => setMode('edit')} style={btnPrimary}>Edit</button>
            </>
          ) : (
            <>
              <button type="button" onClick={handleCancel} style={btnSecondary} disabled={saving}>Cancel</button>
              <button type="button" onClick={handleSave} style={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </>
          )}
        </div>
      </div>
      {confirmCancel && <ConfirmModal kind="cancel" onConfirm={onClose} onCancel={() => setConfirmCancel(false)} />}
    </div>
  );
}

// ── Cards ──────────────────────────────────────────────────────────────────────
const btnPrimary: CSSProperties = {
  height: 34, padding: '0 16px', background: '#0B5AA0', color: '#fff',
  border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const btnSecondary: CSSProperties = {
  height: 34, padding: '0 16px', background: '#fff', color: '#0B5AA0',
  border: '1px solid #d8dee6', borderRadius: 3, fontSize: 13, cursor: 'pointer',
};
const cardBase: CSSProperties = {
  width: 440, maxWidth: '100%', boxSizing: 'border-box',
  border: '1px solid #d8dee6', borderRadius: 6, padding: 12, background: '#fff',
  minHeight: 218, display: 'flex', flexDirection: 'column',
};
const cardHover: CSSProperties = { borderColor: '#0B5AA0' };

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: hover ? (danger ? '#fee2e2' : '#eff6ff') : 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', color: hover ? (danger ? '#dc2626' : '#0B5AA0') : '#111827', padding: 5, display: 'flex' }}>
      {children}
    </button>
  );
}

function OfficeCard({ office, onView, onEdit, onDelete }: { office: OfficeDto; onView: () => void; onEdit: () => void; onDelete: () => void }) {
  const [hover, setHover] = useState(false);
  const initial = office.contactName?.trim()?.[0]?.toUpperCase() ?? '?';
  return (
    <div style={{ ...cardBase, ...(hover ? cardHover : {}) }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {office.officeType && (
        <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fff', color: '#0B5AA0', border: '1px solid #0B5AA0', borderRadius: 10, padding: '2px 10px', fontSize: 10, lineHeight: 1.1, fontWeight: 500, marginBottom: 8 }}>
          <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: '50%', background: '#0B5AA0' }} />
          {office.officeType}
        </span>
      )}
      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 10 }}>{office.officeName}</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
        <span className="grid-avatar" style={{ width: 32, height: 32, borderRadius: '50%', background: '#e0f2fe', color: '#0B5AA0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{initial}</span>
        <div style={{ minWidth: 0, fontSize: 11, color: '#374151', lineHeight: 1.45 }}>
          <div style={{ fontWeight: 600, color: '#111827' }}>{office.contactName || '-'}</div>
          <div>{office.contactTitle || '-'}</div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{office.contactEmail || '-'}</div>
        </div>
      </div>
      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8, fontSize: 11, fontWeight: 700, color: '#111827' }}>Address</div>
      <div style={{ fontSize: 11, color: '#111827', lineHeight: 1.45, flex: 1 }}>{formatAddress(office) || '-'}</div>
      <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 8, paddingTop: 7, display: 'flex', justifyContent: 'center', gap: 18 }}>
        <IconButton label="View" onClick={onView}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
        </IconButton>
        <IconButton label="Edit" onClick={onEdit}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
        </IconButton>
        <IconButton label="Delete" onClick={onDelete} danger>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" /></svg>
        </IconButton>
      </div>
    </div>
  );
}

export function OfficeLocations({ offices, onSave, onDelete }: {
  offices: OfficeDto[];
  onSave: (req: SaveOfficeRequest) => Promise<void>;
  onDelete: (officeId: number) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ office?: OfficeDto; mode: Mode } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const q = search.trim().toLowerCase();
  const filtered = offices.filter(o => !q || [o.officeName, o.officeType, o.contactName, o.contactEmail, formatAddress(o)]
    .some(v => v?.toLowerCase().includes(q)));

  return (
    <section style={{ border: '1px solid #d8dee6', borderRadius: 4, background: '#fff', marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '12px 12px 13px', borderBottom: '1px solid #d8dee6' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#20242a', margin: '0 0 12px' }}>Additional Office Locations</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ width: 233, maxWidth: '100%', height: 28, boxSizing: 'border-box', border: '1px solid #9ea8b5', borderRadius: 3, background: '#f7f8fb', color: '#64748b', display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px' }}>
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input
              aria-label="Search office locations"
              placeholder="Search Keyword"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: '#20242a', fontSize: 11 }}
            />
          </label>
          <button type="button" onClick={() => setModal({ mode: 'edit' })} style={{ ...btnPrimary, height: 28, minWidth: 106, padding: '0 13px', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <span aria-hidden="true" style={{ fontSize: 17, lineHeight: 1, fontWeight: 300 }}>+</span>
            Add Office
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div role="status" style={{ minHeight: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#20242a', fontSize: 16, fontWeight: 700 }}>No Data Available</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 14, padding: 12 }}>
          {filtered.map(o => (
            <OfficeCard key={o.id} office={o}
              onView={() => setModal({ office: o, mode: 'view' })}
              onEdit={() => setModal({ office: o, mode: 'edit' })}
              onDelete={() => setDeletingId(o.id!)} />
          ))}
        </div>
      )}

      {modal && <OfficeModal office={modal.office} initialMode={modal.mode} onSave={onSave} onClose={() => setModal(null)} />}
      {deletingId !== null && (
        <ConfirmModal kind="delete"
          onConfirm={async () => { const id = deletingId; setDeletingId(null); await onDelete(id); }}
          onCancel={() => setDeletingId(null)} />
      )}
    </section>
  );
}
