import { useState } from 'react';
import SearchableSelect from '../ui/SearchableSelect';
import { GoogleAddressAutocomplete } from '../../pages/QuotesPolicies/NewSubmission';
import * as fv from '../../utils/fieldValidation';
import { AddressUncheckConfirm } from './AddressUncheckConfirm';

export type AddressFieldsValue = {
  googleSearch: string;
  enterManually: boolean;
  addressLine1: string;
  addressLine2: string;
  country: string;
  state: string;
  city: string;
  county: string;
  zipCode: string;
  latitude: string;
  longitude: string;
};

export type AddressFieldName = keyof AddressFieldsValue;
export type AddressOption = { value: string; label: string };

// QA UM-14: standard limits, used when the caller doesn't pass its own.
const DEFAULT_MAX_LENGTHS: Partial<Record<AddressFieldName, number>> = {
  addressLine1: fv.ADDRESS_LINE_MAX, addressLine2: fv.ADDRESS_LINE_MAX, city: fv.CITY_MAX, county: fv.COUNTY_MAX,
};

// Fields discarded when the user confirms unchecking "Enter Address Manually" (Country is kept).
const MANUAL_FIELDS: AddressFieldName[] = ['googleSearch', 'addressLine1', 'addressLine2', 'state', 'city', 'county', 'zipCode', 'latitude', 'longitude'];

function ErrorText({ message }: { message?: string }) {
  return message ? <span className="ferr"><span className="ferr__ico">⊘</span>{message}</span> : null;
}

/**
 * Presentation-only address editor. Consumers own address persistence, "same as"
 * business rules, option sources, and any field-name mapping.
 */
export function AddressFields({
  value,
  errors = {},
  onChange,
  countryOptions,
  stateOptions,
  disabled = false,
  showCounty = true,
  coordinatesReadOnly = true,
  countyRequired = true,
  stateLabel,
  zipLabel,
  maxLengths = DEFAULT_MAX_LENGTHS,
  confirmUncheck = true,
  trailingColumns = 2,
}: {
  value: AddressFieldsValue;
  errors?: Partial<Record<AddressFieldName, string>>;
  onChange: (field: AddressFieldName, nextValue: string | boolean) => void;
  countryOptions: AddressOption[];
  stateOptions: AddressOption[];
  disabled?: boolean;
  showCounty?: boolean;
  coordinatesReadOnly?: boolean;
  countyRequired?: boolean;
  stateLabel?: string;
  zipLabel?: string;
  maxLengths?: Partial<Record<AddressFieldName, number>>;
  confirmUncheck?: boolean;
  trailingColumns?: 2 | 3;
}) {
  const [confirming, setConfirming] = useState(false);
  const limits = { ...DEFAULT_MAX_LENGTHS, ...maxLengths };
  const changeText = (field: AddressFieldName, nextValue: string) => {
    const maxLength = limits[field];
    onChange(field, maxLength === undefined ? nextValue : nextValue.slice(0, maxLength));
  };
  const entryDisabled = disabled || !value.enterManually;
  // Callers store either a code ("CA") or a name ("Canada"); compare on the display name.
  const countryName = countryOptions.find(option => option.value === value.country)?.label ?? value.country;
  const isCanada = countryName === fv.CANADA;
  // §2: Canada hides County and uses Province / Postal Code.
  const countyVisible = showCounty && !isCanada;
  const changeCountry = (country: string) => {
    onChange('country', country);
    if (!stateOptions.some(option => option.value === value.state)) onChange('state', '');
  };
  const toggleManual = (checked: boolean) => {
    if (!checked && confirmUncheck) { setConfirming(true); return; }
    onChange('enterManually', checked);
  };
  const discardManualAddress = () => {
    setConfirming(false);
    for (const field of MANUAL_FIELDS) onChange(field, '');
    onChange('enterManually', false);
  };
  return <>
    <div className="fc fg-mb">
      <label className="fl-plain">Google Address Search</label>
      <GoogleAddressAutocomplete
        disabled={disabled || value.enterManually}
        placeholder="Start typing an address"
        onSelect={place => {
          changeText('googleSearch', [place.addressLine1, place.city, place.state, place.country].filter(Boolean).join(', '));
          changeText('addressLine1', place.addressLine1);
          changeText('addressLine2', place.addressLine2 ?? '');
          onChange('country', place.country);
          onChange('state', place.state);
          changeText('city', place.city);
          changeText('county', place.county);
          onChange('zipCode', place.zip);
          onChange('latitude', place.latitude);
          onChange('longitude', place.longitude);
        }}
      />
    </div>
    <label className="manual-chk">
      <input type="checkbox" checked={value.enterManually} disabled={disabled} onChange={event => toggleManual(event.target.checked)} />
      Enter Address Manually
    </label>
    <div className="fg2 fg-mb">
      <div className="fc"><label className="fl"><span className="req">*</span> Address Line 1</label>
        <input className={`fi${errors.addressLine1 ? ' fi--err' : ''}${entryDisabled ? ' fi--disabled' : ''}`} value={value.addressLine1} onChange={event => changeText('addressLine1', event.target.value)} disabled={entryDisabled} maxLength={limits.addressLine1} />
        <ErrorText message={errors.addressLine1} /></div>
      <div className="fc"><label className="fl">Address Line 2 <span className="fi-info">ⓘ</span></label>
        <input className={`fi${errors.addressLine2 ? ' fi--err' : ''}${entryDisabled ? ' fi--disabled' : ''}`} value={value.addressLine2} onChange={event => changeText('addressLine2', event.target.value)} disabled={entryDisabled} maxLength={limits.addressLine2} />
        <ErrorText message={errors.addressLine2} /></div>
    </div>
    <div className="fg3 fg-mb">
      <div className="fc"><label className="fl"><span className="req">*</span> Country</label><SearchableSelect value={value.country} onChange={changeCountry} options={countryOptions} placeholder="Search..." clearable disabled={entryDisabled} appearance="user-reference" /><ErrorText message={errors.country} /></div>
      <div className="fc"><label className="fl"><span className="req">*</span> {stateLabel ?? fv.stateLabel(countryName)}</label><SearchableSelect value={value.state} onChange={next => onChange('state', next)} options={stateOptions} placeholder="Search..." clearable disabled={entryDisabled} appearance="user-reference" /><ErrorText message={errors.state} /></div>
      <div className="fc"><label className="fl"><span className="req">*</span> City</label><input className={`fi${errors.city ? ' fi--err' : ''}${entryDisabled ? ' fi--disabled' : ''}`} value={value.city} onChange={event => changeText('city', event.target.value)} disabled={entryDisabled} maxLength={limits.city} /><ErrorText message={errors.city} /></div>
    </div>
    <div className={countyVisible ? (trailingColumns === 3 ? 'fg3 fg-mb' : 'fg2 fg-mb') : 'fg1 fg-mb'}>
      {countyVisible && <div className="fc"><label className={countyRequired ? 'fl' : 'fl-plain'}>{countyRequired && <span className="req">* </span>}County</label><input className={`fi${errors.county ? ' fi--err' : ''}${entryDisabled ? ' fi--disabled' : ''}`} value={value.county} onChange={event => changeText('county', event.target.value)} disabled={entryDisabled} maxLength={limits.county} /><ErrorText message={errors.county} /></div>}
      <div className="fc"><label className="fl"><span className="req">*</span> {zipLabel ?? fv.zipLabel(countryName)}</label><input className={`fi${errors.zipCode ? ' fi--err' : ''}${entryDisabled ? ' fi--disabled' : ''}`} value={value.zipCode} onChange={event => onChange('zipCode', event.target.value)} disabled={entryDisabled} maxLength={limits.zipCode} /><ErrorText message={errors.zipCode} /></div>
    </div>
    {/* UM-12: Latitude / Longitude stay disabled until Enter Address Manually is checked. */}
    <div className={trailingColumns === 3 ? 'fg3 fg-mb' : 'fg2 fg-mb'}>
      <div className="fc"><label className="fl-plain">Latitude</label><input className={`fi${coordinatesReadOnly ? ' fi--ro' : ''}${entryDisabled ? ' fi--disabled' : ''}`} value={value.latitude} onChange={event => onChange('latitude', event.target.value)} readOnly={coordinatesReadOnly} disabled={entryDisabled} /></div>
      <div className="fc"><label className="fl-plain">Longitude</label><input className={`fi${coordinatesReadOnly ? ' fi--ro' : ''}${entryDisabled ? ' fi--disabled' : ''}`} value={value.longitude} onChange={event => onChange('longitude', event.target.value)} readOnly={coordinatesReadOnly} disabled={entryDisabled} /></div>
    </div>
    {confirming && <AddressUncheckConfirm onCancel={() => setConfirming(false)} onContinue={discardManualAddress} />}
  </>;
}
