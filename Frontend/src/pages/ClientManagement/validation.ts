// AI_GENERATED | HUMAN_VALIDATION_REQUIRED
// Client Management field rules (QA report §2 / §5). Mirrors Backend ClientValidator.
// Generic rules live in utils/fieldValidation; this file adds the Client-specific ones.
import { CANADA_PROVINCES, US_STATES } from '../DistributionManagement/IntermediaryReferenceData';
import type { SaveClientInfoRequest, SaveCompanyRequest, SaveContactRequest } from '../../types/ClientManagement';
import {
  CANADA, type Errors, checkPhonesDiffer, digitsOnly, formatUsZipInput, invalid, isBlank as blank, isValidEmail, isValidName, isValidPhone,
  isValidZip, normalizeNorthAmericanPhone, required, stateLabel, zipLabel,
} from '../../utils/fieldValidation';

export {
  CANADA, type Errors, apiErrorMessage, digitsOnly, formatPhone, formatPhoneView, formatUsZipInput, invalid, isValidEmail, isValidName,
  isValidPhone, isValidZip, normalizeNorthAmericanPhone, required, stateLabel, todayMmDdYyyy, zipLabel,
} from '../../utils/fieldValidation';

export const COUNTRIES = ['United States', CANADA] as const;
export const COMPANY_TYPES = ['MGA', 'Insurance Carrier'] as const;
export const OFFICE_TYPES = ['Branch', 'Regional'] as const;
export const BUSINESS_DESCRIPTION_MIN = 5;
export const BUSINESS_DESCRIPTION_MAX = 1000;
export const BUSINESS_DESCRIPTION_LENGTH_ERROR = 'Business Description should be in between 5 to 1000 characters';
export const CLIENT_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/gif'] as const;
export const CLIENT_LOGO_MIN_BYTES = 10 * 1024;
export const CLIENT_LOGO_MAX_BYTES = 10 * 1024 * 1024;
export const EST_DWP_OPTIONS = ['Below 1M', '1–99M', '100–250M', '250M+'] as const;
export { US_STATES };

export function validateClientLogoFile(file: Pick<File, 'type' | 'size'>): string | undefined {
  if (!CLIENT_LOGO_TYPES.includes(file.type as typeof CLIENT_LOGO_TYPES[number]))
    return 'Please upload file based on the criteria listed';
  if (file.size < CLIENT_LOGO_MIN_BYTES) return 'File size is too small';
  if (file.size > CLIENT_LOGO_MAX_BYTES) return 'File size is too large';
  return undefined;
}

export const regionOptions = (country?: string): readonly string[] =>
  country === CANADA ? CANADA_PROVINCES : US_STATES;

export function changeDomicileCountry<T extends { domicileCountry?: string; stateOfDomicile?: string }>(form: T, country: string): T {
  return country === form.domicileCountry
    ? form
    : { ...form, domicileCountry: country, stateOfDomicile: '' };
}

export function clearDomicileErrors(errors: Errors): Errors {
  const next = { ...errors };
  delete next.domicileCountry;
  delete next.stateOfDomicile;
  return next;
}

export function formatFederalTaxId(raw: string): string {
  const d = digitsOnly(raw, 9);
  return d.length <= 2 ? d : `${d.slice(0, 2)}-${d.slice(2)}`;
}

export function validateBusinessDescription(value?: string | null): string | undefined {
  const description = value?.trim() ?? '';
  if (!description) return undefined;
  return description.length < BUSINESS_DESCRIPTION_MIN || description.length > BUSINESS_DESCRIPTION_MAX
    ? BUSINESS_DESCRIPTION_LENGTH_ERROR
    : undefined;
}

// ── Section validators ─────────────────────────────────────────────────────────
export function validateClientInfo(f: SaveClientInfoRequest, hasLogo: boolean): Errors {
  const e: Errors = {};
  if (!hasLogo) e.logo = required('Client Logo');

  const name = f.companyName?.trim() ?? '';
  if (!name) e.companyName = required('Company Name');
  else if (name.length < 5 || name.length > 75) e.companyName = 'Company Name should be in between 5 to 75 characters';

  if (blank(f.typeOfCompany)) e.typeOfCompany = required('Type of Company');
  if (blank(f.naicCode)) e.naicCode = required('NAIC Code');
  else if (!/^\d{5}$/.test(f.naicCode!)) e.naicCode = invalid('NAIC Code');
  if (blank(f.domicileCountry)) e.domicileCountry = required('Domicile Country');
  if (blank(f.stateOfDomicile)) e.stateOfDomicile = required(`${stateLabel(f.domicileCountry)} of Domicile`);

  if (blank(f.federalTaxId)) e.federalTaxId = required('Federal Tax ID');
  else if (!/^\d{2}-\d{7}$/.test(f.federalTaxId!)) e.federalTaxId = invalid('Federal Tax ID');

  if (!blank(f.numberOfEmployees) && !/^\d{1,10}$/.test(f.numberOfEmployees!)) e.numberOfEmployees = invalid('No. of Employees');

  if (!blank(f.yearBusinessStarted)) {
    const y = Number(f.yearBusinessStarted);
    if (!/^\d{4}$/.test(f.yearBusinessStarted!) || y < 1600 || y > new Date().getFullYear())
      e.yearBusinessStarted = invalid('Year Business Started');
  }

  if (!blank(f.emailId) && !isValidEmail(f.emailId!)) e.emailId = invalid('Email ID');
  if (!blank(f.telephoneNumber) && !isValidPhone(f.telephoneNumber!)) e.telephoneNumber = invalid('Telephone');
  if (f.extension != null && !/^\d{1,6}$/.test(String(f.extension))) e.extension = invalid('Extension');

  const businessDescriptionError = validateBusinessDescription(f.businessDescription);
  if (businessDescriptionError) e.businessDescription = businessDescriptionError;
  return e;
}

export interface AddressLike {
  addressType?: string; addressLine1?: string; addressLine2?: string; country?: string; state?: string;
  city?: string; county?: string; zipCode?: string; latitude?: string; longitude?: string;
  isManual?: boolean; isSameAsLegal?: boolean;
}

// Keys match AddressFields' field names so errors can be passed straight through.
export function validateAddress(a: AddressLike, options: { validateRegionMembership?: boolean; forbidCanadaCounty?: boolean } = {}): Errors {
  const validateRegionMembership = options.validateRegionMembership ?? true;
  const forbidCanadaCounty = options.forbidCanadaCounty ?? true;
  const e: Errors = {};
  if (a.addressType && !['Legal', 'Mailing'].includes(a.addressType)) e.addressType = invalid('Address Type');
  if (a.isSameAsLegal && a.addressType && a.addressType !== 'Mailing') e.isSameAsLegal = 'Same as Home Office / Legal Address is valid only for Mailing Address';
  if (a.isSameAsLegal && a.isManual) e.isManual = 'Enter Address Manually must be unchecked when Same as Home Office / Legal Address is selected';
  if (blank(a.addressLine1)) e.addressLine1 = required('Address Line 1');
  else if (a.addressLine1!.length > 500) e.addressLine1 = invalid('Address Line 1');
  if ((a.addressLine2?.length ?? 0) > 500) e.addressLine2 = invalid('Address Line 2');
  if (blank(a.country)) e.country = required('Country');
  else if (!COUNTRIES.includes(a.country as typeof COUNTRIES[number])) e.country = invalid('Country');
  if (blank(a.state)) e.state = required(stateLabel(a.country));
  else if (validateRegionMembership && COUNTRIES.includes(a.country as typeof COUNTRIES[number]) && !regionOptions(a.country).includes(a.state!)) e.state = invalid(stateLabel(a.country));
  if (blank(a.city)) e.city = required('City');
  else if (a.city!.length > 50) e.city = invalid('City');
  if ((a.county?.length ?? 0) > 50 || (forbidCanadaCounty && a.country === CANADA && !blank(a.county))) e.county = invalid('County');
  const zl = zipLabel(a.country);
  if (blank(a.zipCode)) e.zipCode = required(zl);
  else if (!isValidZip(a.zipCode!, a.country)) e.zipCode = invalid(zl);
  return e;
}

function sameAddressValues(left?: AddressLike, right?: AddressLike): boolean {
  if (!left || !right) return false;
  const value = (input?: string) => input?.trim() ?? '';
  return value(left.addressLine1) === value(right.addressLine1)
    && value(left.addressLine2) === value(right.addressLine2)
    && value(left.country) === value(right.country)
    && value(left.state) === value(right.state)
    && value(left.city) === value(right.city)
    && value(left.county) === value(right.county)
    && value(left.zipCode) === value(right.zipCode)
    && value(left.latitude) === value(right.latitude)
    && value(left.longitude) === value(right.longitude);
}

export function validateContact(c: SaveContactRequest): Errors {
  const e: Errors = {};
  if (blank(c.name)) e.name = required('Name');
  else if (!isValidName(c.name!)) e.name = invalid('Name');
  if (!blank(c.suffix) && !/^[A-Za-z]{1,4}$/.test(c.suffix!)) e.suffix = invalid('Suffix');
  if (blank(c.title)) e.title = required('Title');
  if (blank(c.emailId)) e.emailId = required('Email ID');
  else if (!isValidEmail(c.emailId!)) e.emailId = invalid('Email ID');
  if (blank(c.telephoneNumber)) e.telephoneNumber = required('Telephone Number');
  else if (!isValidPhone(c.telephoneNumber!)) e.telephoneNumber = invalid('Telephone');
  if (c.extension != null && !/^\d{1,6}$/.test(String(c.extension))) e.extension = invalid('Extension');
  if (!blank(c.altTelephoneNumber) && !isValidPhone(c.altTelephoneNumber!)) e.altTelephoneNumber = invalid('Alternative Telephone');
  checkPhonesDiffer(e, 'telephoneNumber', 'altTelephoneNumber', c.telephoneNumber, c.altTelephoneNumber);
  return e;
}

export function validateCompanyForm(form: SaveCompanyRequest, hasExistingLogo = false): Errors {
  const errors: Errors = {};
  if (!form.logoBase64 && !hasExistingLogo) errors.logo = required('Company Logo');
  if (blank(form.companyName)) errors.companyName = required('Company Name');
  else if (form.companyName.length > 75) errors.companyName = invalid('Company Name');
  if (blank(form.domicileCountry)) errors.domicileCountry = required('Domicile Country');
  if (blank(form.stateOfDomicile)) errors.stateOfDomicile = required(`${form.domicileCountry === CANADA ? 'Province' : 'State'} of Domicile`);
  if (blank(form.naicCode)) errors.naicCode = required('NAIC Code');
  else if (!/^\d{5}$/.test(form.naicCode!)) errors.naicCode = invalid('NAIC Code');
  if (blank(form.federalTaxId)) errors.federalTaxId = required('Federal Tax ID');
  else if (!/^\d{2}-\d{7}$/.test(form.federalTaxId!)) errors.federalTaxId = invalid('Federal Tax ID');
  const description = validateBusinessDescription(form.businessDescription);
  if (description) errors.businessDescription = description;
  for (const [key, value] of Object.entries(validateAddress(form.legalAddress ?? {}))) errors[`legal.${key}`] = value;
  for (const [key, value] of Object.entries(validateAddress(form.mailingAddress ?? {}))) errors[`mailing.${key}`] = value;
  if (form.mailingAddress?.isSameAsLegal && !sameAddressValues(form.mailingAddress, form.legalAddress))
    errors['mailing.addressLine1'] = 'Mailing Address must match Home Office / Legal Address when Same as Home Office / Legal Address is selected';
  const contacts = [form.primaryContact ?? {}, ...(form.secondaryContacts ?? [])];
  contacts.forEach((contact, index) => {
    const prefix = index === 0 ? 'primary.' : `secondary.${index - 1}.`;
    for (const [key, value] of Object.entries(validateContact(contact))) errors[`${prefix}${key}`] = value;
  });
  return errors;
}

export function isContactEmpty(c: SaveContactRequest): boolean {
  return [c.name, c.suffix, c.title, c.emailId, c.telephoneNumber, c.extension, c.altTelephoneNumber].every(blank);
}

// Pulls one section's errors out of a combined map (e.g. "secondary.1.name" → "name").
export function pickErrors(prefix: string, errors: Errors): Errors {
  return Object.fromEntries(
    Object.entries(errors).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]),
  );
}
