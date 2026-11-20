using System.Text.Json;
using System.Text.RegularExpressions;

namespace InsureEdge.Application.Validation;

public static class AddressLengthValidator
{
    public const int AddressLineMaxLength = 500;
    public const int CityMaxLength = 50;
    public const int CountyMaxLength = 50;
    public const int OrganizationNameMaxLength = 75;

    public static string? ValidateJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;

        try
        {
            using var document = JsonDocument.Parse(json);
            return ValidatePrimaryNamedInsured(document.RootElement) ?? ValidateElement(document.RootElement);
        }
        catch (JsonException)
        {
            // JSON syntax remains the responsibility of the existing submission flow.
            return null;
        }
    }

    private static string? ValidatePrimaryNamedInsured(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object
            || !root.TryGetProperty("form", out var form)
            || form.ValueKind != JsonValueKind.Object)
            return null;

        foreach (var (propertyName, label) in new[]
        {
            ("firstName", "First Name"),
            ("middleName", "Middle Name"),
            ("lastName", "Last Name"),
        })
        {
            if (!form.TryGetProperty(propertyName, out var property)
                || property.ValueKind != JsonValueKind.String)
                continue;

            var value = property.GetString() ?? string.Empty;
            if (value.Length == 0) continue;
            if (value.Length > 50 || value.StartsWith(' ') || !Regex.IsMatch(value, @"^[A-Za-z@'.& -]+$"))
                return $"Provide valid {label} to continue";
        }

        return null;
    }

    private static string? ValidateElement(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                if (property.Value.ValueKind == JsonValueKind.String)
                {
                    var value = property.Value.GetString() ?? string.Empty;
                    var error = ValidateProperty(property.Name, value.Length);
                    if (error != null) return error;
                }

                var nestedError = ValidateElement(property.Value);
                if (nestedError != null) return nestedError;
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                var nestedError = ValidateElement(item);
                if (nestedError != null) return nestedError;
            }
        }

        return null;
    }

    private static string? ValidateProperty(string name, int length)
    {
        if ((name.EndsWith("AddressLine1", StringComparison.OrdinalIgnoreCase) || name.Equals("addrLine1", StringComparison.OrdinalIgnoreCase))
            && length > AddressLineMaxLength)
            return $"Address Line 1 cannot exceed {AddressLineMaxLength} characters.";
        if ((name.EndsWith("AddressLine2", StringComparison.OrdinalIgnoreCase) || name.Equals("addrLine2", StringComparison.OrdinalIgnoreCase))
            && length > AddressLineMaxLength)
            return $"Address Line 2 cannot exceed {AddressLineMaxLength} characters.";
        if (name.EndsWith("City", StringComparison.OrdinalIgnoreCase) && length > CityMaxLength)
            return $"City cannot exceed {CityMaxLength} characters.";
        if (name.EndsWith("County", StringComparison.OrdinalIgnoreCase) && length > CountyMaxLength)
            return $"County cannot exceed {CountyMaxLength} characters.";
        if ((name.Equals("organizationName", StringComparison.OrdinalIgnoreCase)
             || name.Equals("orgName", StringComparison.OrdinalIgnoreCase))
            && length > OrganizationNameMaxLength)
            return $"Organization Name cannot exceed {OrganizationNameMaxLength} characters.";
        if ((name.Equals("doingBusinessAs", StringComparison.OrdinalIgnoreCase)
             || name.Equals("dbaName", StringComparison.OrdinalIgnoreCase))
            && length > OrganizationNameMaxLength)
            return $"Doing Business As cannot exceed {OrganizationNameMaxLength} characters.";
        return null;
    }
}
