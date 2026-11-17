// AI_GENERATED | HUMAN_VALIDATION_REQUIRED
using System.Text.RegularExpressions;
using InsureEdge.Application.DTOs.Client;

namespace InsureEdge.Application.Validation;

// Server-side mirror of the Client Management field rules (QA report §2/§5).
// Each method returns the first error message, or null when the request is valid.
public static partial class ClientValidator
{
    public const string Canada = "Canada";
    public const string UnitedStates = "United States";
    public const string LegalAddressType = "Legal";
    public const string MailingAddressType = "Mailing";
    public static readonly string[] Countries = [UnitedStates, Canada];
    public static readonly string[] AddressTypes = [LegalAddressType, MailingAddressType];
    public static readonly HashSet<string> UsStates = new(StringComparer.Ordinal)
    {
        "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
        "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
        "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
        "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
        "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
        "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
        "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
    };
    public static readonly HashSet<string> CanadaRegions = new(StringComparer.Ordinal)
    {
        "Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador",
        "Northwest Territories", "Nova Scotia", "Nunavut", "Ontario", "Prince Edward Island",
        "Quebec", "Saskatchewan", "Yukon"
    };
    public static readonly string[] CompanyTypes = ["MGA", "Insurance Carrier"];
    public static readonly string[] OfficeTypes = ["Branch", "Regional"];
    public const int BusinessDescriptionMinLength = 5;
    public const int BusinessDescriptionMaxLength = 1000;
    public const string BusinessDescriptionLengthError = "Business Description should be in between 5 to 1000 characters";

    public static string Required(string label) => $"Provide {label} to continue";
    public static string Invalid(string label) => $"Provide valid {label} to continue";

    [GeneratedRegex(@"^\d{5}(-\d{4})?$")] private static partial Regex UsZip();
    // First letter never D F I O Q U W Z; later letters never D F I O Q U.
    [GeneratedRegex(@"^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] \d[ABCEGHJ-NPRSTV-Z]\d$")] private static partial Regex CaPostal();
    [GeneratedRegex(@"^[A-Za-z0-9\-'‘’. áéíóúñüçÁÉÍÓÚÑÜÇ]+$")] private static partial Regex NameChars();
    [GeneratedRegex(@"^[^\s@]+@[^\s@]+\.[^\s@]+$")] private static partial Regex Email();
    [GeneratedRegex(@"^\d{2}-?\d{7}$")] private static partial Regex FederalTaxId();

    public static bool IsValidZip(string? zip, string? country) =>
        zip != null && (country == Canada ? CaPostal().IsMatch(zip) : UsZip().IsMatch(zip));

    public static bool IsValidName(string? name) =>
        name is { Length: > 0 and <= 50 } && name[0] != ' ' && NameChars().IsMatch(name);

    public static bool IsValidEmail(string? email) => email is { Length: <= 50 } && Email().IsMatch(email);

    public static string NormalizePhone(string? phone)
    {
        var digits = new string((phone ?? "").Where(char.IsAsciiDigit).ToArray());
        return digits.Length == 11 && digits[0] == '1' ? digits[1..] : digits;
    }

    public static bool IsValidPhone(string? phone) => phone != null && NormalizePhone(phone).Length == 10;

    public static bool IsValidExtension(int? ext) => ext is null or >= 0 and <= 999999;

    public static bool IsValidFederalTaxId(string? id) => id != null && FederalTaxId().IsMatch(id);

    public static string? ValidateBusinessDescription(string? value)
    {
        var description = value?.Trim() ?? "";
        return description.Length == 0 || description.Length is >= BusinessDescriptionMinLength and <= BusinessDescriptionMaxLength
            ? null
            : BusinessDescriptionLengthError;
    }

    public static string? ValidateInfo(SaveClientInfoRequest r)
    {
        var name = r.CompanyName?.Trim() ?? "";
        if (name.Length == 0) return Required("Company Name");
        if (name.Length is < 5 or > 75) return "Company Name should be in between 5 to 75 characters";
        if (!Blank(r.LogoBase64) && ValidateLogo(r.LogoBase64!, r.LogoContentType) is { } logoError)
            return logoError;
        if (Blank(r.TypeOfCompany)) return Required("Type of Company");
        if (!CompanyTypes.Contains(r.TypeOfCompany)) return Invalid("Type of Company");
        if (Blank(r.NaicCode)) return Required("NAIC Code");
        if (!(r.NaicCode!.Length == 5 && r.NaicCode.All(char.IsAsciiDigit))) return Invalid("NAIC Code");
        if (r.RegisteredTradeMark?.Length > 75) return Invalid("Registered Trade Mark");
        if (Blank(r.DomicileCountry)) return Required("Domicile Country");
        if (!Countries.Contains(r.DomicileCountry)) return Invalid("Domicile Country");
        var stateLabel = r.DomicileCountry == Canada ? "Province of Domicile" : "State of Domicile";
        if (Blank(r.StateOfDomicile)) return Required(stateLabel);
        if (Blank(r.FederalTaxId)) return Required("Federal Tax ID");
        if (!IsValidFederalTaxId(r.FederalTaxId)) return Invalid("Federal Tax ID");
        if (r.OwnedBy?.Length > 75) return Invalid("Owned By");
        if (!Blank(r.NumberOfEmployees) && !(r.NumberOfEmployees!.Length <= 10 && r.NumberOfEmployees.All(char.IsAsciiDigit))) return Invalid("No. of Employees");
        if (!Blank(r.YearBusinessStarted) && (!(r.YearBusinessStarted!.Length == 4 && r.YearBusinessStarted.All(char.IsAsciiDigit))
            || int.Parse(r.YearBusinessStarted) is < 1600 || int.Parse(r.YearBusinessStarted) > DateTime.UtcNow.Year))
            return Invalid("Year Business Started");
        if (!Blank(r.EmailId) && !IsValidEmail(r.EmailId)) return Invalid("Email ID");
        if (!Blank(r.TelephoneNumber) && !IsValidPhone(r.TelephoneNumber)) return Invalid("Telephone");
        if (!IsValidExtension(r.Extension)) return Invalid("Extension");
        if (r.ClientUrl?.Length > 50) return Invalid("Client URL");
        if (ValidateBusinessDescription(r.BusinessDescription) is { } descriptionError) return descriptionError;
        return null;
    }

    public static string? ValidateCompany(SaveCompanyRequest r)
    {
        var name = r.CompanyName?.Trim() ?? "";
        if (name.Length == 0) return Required("Company Name");
        if (name.Length > 75) return Invalid("Company Name");
        if (r.Id is null && Blank(r.LogoBase64)) return Required("Company Logo");
        if (!Blank(r.LogoBase64) && ValidateLogo(r.LogoBase64!, r.LogoContentType) is { } logoError)
            return logoError;
        if (Blank(r.DomicileCountry)) return Required("Domicile Country");
        if (!Countries.Contains(r.DomicileCountry)) return Invalid("Domicile Country");
        if (Blank(r.StateOfDomicile)) return Required(r.DomicileCountry == Canada ? "Province of Domicile" : "State of Domicile");
        if (Blank(r.NaicCode)) return Required("NAIC Code");
        if (!(r.NaicCode!.Length == 5 && r.NaicCode.All(char.IsAsciiDigit))) return Invalid("NAIC Code");
        if (Blank(r.FederalTaxId)) return Required("Federal Tax ID");
        if (!IsValidFederalTaxId(r.FederalTaxId)) return Invalid("Federal Tax ID");
        if (!Blank(r.EmailId) && !IsValidEmail(r.EmailId)) return Invalid("Email ID");
        if (!Blank(r.TelephoneNumber) && !IsValidPhone(r.TelephoneNumber)) return Invalid("Telephone");
        if (!IsValidExtension(r.Extension)) return Invalid("Extension");
        if (ValidateBusinessDescription(r.BusinessDescription) is { } descriptionError) return descriptionError;
        if (r.LegalAddress is null) return Required("Home Office / Legal Address");
        if (r.LegalAddress.AddressType != LegalAddressType) return Invalid("Home Office / Legal Address Type");
        if (ValidateAddress(r.LegalAddress) is { } legalError) return legalError;
        if (r.MailingAddress is null) return Required("Mailing Address");
        if (r.MailingAddress.AddressType != MailingAddressType) return Invalid("Mailing Address Type");
        if (ValidateAddress(r.MailingAddress) is { } mailingError) return mailingError;
        if (ValidateSameAsLegal(r.MailingAddress, r.LegalAddress) is { } sameAsError) return sameAsError;
        if (r.PrimaryContact is null) return Required("Primary Contact");
        if (Blank(r.PrimaryContact.TelephoneNumber)) return Required("Telephone Number");
        if (ValidateContact(r.PrimaryContact) is { } contactError) return contactError;
        foreach (var contact in r.SecondaryContacts ?? [])
        {
            if (Blank(contact.TelephoneNumber)) return Required("Telephone Number");
            if (ValidateContact(contact) is { } secondaryError) return secondaryError;
        }
        return null;
    }

    private static string? ValidateLogo(string base64, string? contentType)
    {
        if (contentType is not ("image/png" or "image/jpeg" or "image/gif"))
            return "Please upload file based on the criteria listed";
        try
        {
            var bytes = Convert.FromBase64String(base64).Length;
            if (bytes < 10 * 1024) return "File size is too small";
            if (bytes > 10 * 1024 * 1024) return "File size is too large";
            return null;
        }
        catch (FormatException)
        {
            return "Please upload file based on the criteria listed";
        }
    }

    public static SaveAddressRequest NormalizeAddress(SaveAddressRequest r) =>
        r.Country == Canada ? r with { County = null } : r;

    public static string? ValidateAddress(SaveAddressRequest r)
    {
        if (!AddressTypes.Contains(r.AddressType)) return Invalid("Address Type");
        if (r.IsSameAsLegal && r.AddressType != MailingAddressType)
            return "Same as Home Office / Legal Address is valid only for Mailing Address";
        if (r.IsSameAsLegal && r.IsManual)
            return "Enter Address Manually must be unchecked when Same as Home Office / Legal Address is selected";
        return ValidateAddressFields(r.AddressLine1, r.AddressLine2, r.Country, r.State, r.City, r.County, r.ZipCode);
    }

    public static string? ValidateSameAsLegal(SaveAddressRequest mailing, SaveAddressRequest? legal)
    {
        if (!mailing.IsSameAsLegal) return null;
        if (legal is null) return Required("Home Office / Legal Address");
        return SameAddressValues(mailing.AddressLine1, mailing.AddressLine2, mailing.Country, mailing.State,
            mailing.City, mailing.County, mailing.ZipCode, mailing.Latitude, mailing.Longitude,
            legal.AddressLine1, legal.AddressLine2, legal.Country, legal.State, legal.City,
            legal.Country == Canada ? null : legal.County,
            legal.ZipCode, legal.Latitude, legal.Longitude)
            ? null
            : "Mailing Address must match Home Office / Legal Address when Same as Home Office / Legal Address is selected";
    }

    public static string? ValidateSameAsLegal(SaveAddressRequest mailing, AddressDto? legal)
    {
        if (!mailing.IsSameAsLegal) return null;
        if (legal is null) return Required("Home Office / Legal Address");
        return SameAddressValues(mailing.AddressLine1, mailing.AddressLine2, mailing.Country, mailing.State,
            mailing.City, mailing.County, mailing.ZipCode, mailing.Latitude, mailing.Longitude,
            legal.AddressLine1, legal.AddressLine2, legal.Country, legal.State, legal.City,
            legal.Country == Canada ? null : legal.County,
            legal.ZipCode, legal.Latitude, legal.Longitude)
            ? null
            : "Mailing Address must match Home Office / Legal Address when Same as Home Office / Legal Address is selected";
    }

    public static string? ValidateContact(SaveContactRequest r)
    {
        if (Blank(r.Name)) return Required("Name");
        if (!IsValidName(r.Name)) return Invalid("Name");
        if (!Blank(r.Suffix) && !(r.Suffix!.Length <= 4 && r.Suffix.All(char.IsAsciiLetter))) return Invalid("Suffix");
        if (Blank(r.Title)) return Required("Title");
        if (r.Title!.Length > 50) return Invalid("Title");
        if (Blank(r.EmailId)) return Required("Email ID");
        if (!IsValidEmail(r.EmailId)) return Invalid("Email ID");
        if (!Blank(r.TelephoneNumber) && !IsValidPhone(r.TelephoneNumber)) return Invalid("Telephone");
        if (!IsValidExtension(r.Extension)) return Invalid("Extension");
        if (!Blank(r.AltTelephoneNumber) && !IsValidPhone(r.AltTelephoneNumber)) return Invalid("Alternative Telephone");
        if (!Blank(r.TelephoneNumber) && !Blank(r.AltTelephoneNumber)
            && NormalizePhone(r.TelephoneNumber) == NormalizePhone(r.AltTelephoneNumber))
            return UserValidator.TelephoneSameAsAlt; // QA UM-15 standard wording
        return null;
    }

    public static string? ValidateContacts(SaveContactsRequest r) =>
        ValidateContact(r.Primary) ?? r.SecondaryContacts?.Select(ValidateContact).FirstOrDefault(e => e != null);

    public static string? ValidateOffice(SaveOfficeRequest r)
    {
        if (Blank(r.OfficeName)) return Required("Office Name");
        if (r.OfficeName.Length > 75) return Invalid("Office Name");
        if (Blank(r.OfficeType)) return Required("Office Type");
        if (!OfficeTypes.Contains(r.OfficeType)) return Invalid("Office Type");
        return ValidateAddressFields(r.AddressLine1, r.AddressLine2, r.Country, r.State, r.City, r.County, r.ZipCode,
                validateRegionMembership: false, forbidCanadaCounty: false)
            ?? ValidateContact(new SaveContactRequest(r.ContactName, r.ContactSuffix, r.ContactTitle, r.ContactEmail,
                r.ContactPhone, r.ContactPhoneCc, r.ContactExt, r.ContactAltPhone, r.ContactAltPhoneCc))
            ?? r.SecondaryContacts?.Select(ValidateContact).FirstOrDefault(e => e != null);
    }

    private static string? ValidateAddressFields(string? line1, string? line2, string? country, string? state,
        string? city, string? county, string? zip, bool validateRegionMembership = true, bool forbidCanadaCounty = true)
    {
        if (Blank(line1)) return Required("Address Line 1");
        if (line1!.Length > 500) return Invalid("Address Line 1");
        if (line2?.Length > 500) return Invalid("Address Line 2");
        if (Blank(country)) return Required("Country");
        if (!Countries.Contains(country)) return Invalid("Country");
        var isCanada = country == Canada;
        if (Blank(state)) return Required(isCanada ? "Province" : "State");
        if (validateRegionMembership && !(isCanada ? CanadaRegions : UsStates).Contains(state!)) return Invalid(isCanada ? "Province" : "State");
        if (Blank(city)) return Required("City");
        if (city!.Length > 50) return Invalid("City");
        if (county?.Length > 50) return Invalid("County");
        if (forbidCanadaCounty && isCanada && !Blank(county)) return Invalid("County");
        var zipLabel = isCanada ? "Postal Code" : "Zip Code";
        if (Blank(zip)) return Required(zipLabel);
        if (!IsValidZip(zip, country)) return Invalid(zipLabel);
        return null;
    }

    private static bool SameAddressValues(
        string? line1, string? line2, string? country, string? state, string? city, string? county,
        string? zip, string? latitude, string? longitude,
        string? otherLine1, string? otherLine2, string? otherCountry, string? otherState, string? otherCity,
        string? otherCounty, string? otherZip, string? otherLatitude, string? otherLongitude) =>
        SameText(line1, otherLine1) && SameText(line2, otherLine2) && SameText(country, otherCountry)
        && SameText(state, otherState) && SameText(city, otherCity) && SameText(county, otherCounty)
        && SameText(zip, otherZip) && SameText(latitude, otherLatitude) && SameText(longitude, otherLongitude);

    private static bool SameText(string? left, string? right) =>
        string.Equals(NormalizeText(left), NormalizeText(right), StringComparison.Ordinal);

    private static string NormalizeText(string? value) => string.IsNullOrWhiteSpace(value) ? "" : value.Trim();

    private static bool Blank(string? s) => string.IsNullOrWhiteSpace(s);
}
