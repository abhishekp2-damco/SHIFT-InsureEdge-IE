using InsureEdge.Application.Validation;
using System.Text.Json;
using Xunit;

namespace InsureEdge.UnitTests;

public class AddressLengthValidatorTests
{
    [Fact]
    public void Accepts_standard_address_lengths_in_nested_submission_json()
    {
        var json = JsonSerializer.Serialize(new
        {
            form = new
            {
                addressLine1 = new string('A', 500),
                addressLine2 = new string('B', 500),
                city = new string('C', 50),
                county = new string('D', 50),
            },
        });

        Assert.Null(AddressLengthValidator.ValidateJson(json));
    }

    [Theory]
    [InlineData("addressLine1", 501, "Address Line 1")]
    [InlineData("addressLine2", 501, "Address Line 2")]
    [InlineData("city", 51, "City")]
    [InlineData("county", 51, "County")]
    public void Rejects_oversized_address_values_at_any_nesting_level(string field, int length, string expectedLabel)
    {
        var json = JsonSerializer.Serialize(new
        {
            mortgages = new[] { new Dictionary<string, string> { [field] = new string('X', length) } },
        });

        var error = AddressLengthValidator.ValidateJson(json);

        Assert.NotNull(error);
        Assert.StartsWith(expectedLabel, error);
    }

    [Theory]
    [InlineData("organizationName", "Organization Name")]
    [InlineData("orgName", "Organization Name")]
    [InlineData("doingBusinessAs", "Doing Business As")]
    [InlineData("dbaName", "Doing Business As")]
    public void Rejects_organization_values_over_75_characters(string field, string expectedLabel)
    {
        var json = JsonSerializer.Serialize(new
        {
            form = new Dictionary<string, string> { [field] = new string('X', 76) },
        });

        var error = AddressLengthValidator.ValidateJson(json);

        Assert.NotNull(error);
        Assert.StartsWith(expectedLabel, error);
    }

    [Theory]
    [InlineData("firstName")]
    [InlineData("middleName")]
    [InlineData("lastName")]
    public void Rejects_invalid_primary_named_insured_values(string field)
    {
        foreach (var invalidValue in new[] { new string('A', 51), "Name1", "Name!" })
        {
            var json = JsonSerializer.Serialize(new
            {
                form = new Dictionary<string, string> { [field] = invalidValue },
            });

            Assert.NotNull(AddressLengthValidator.ValidateJson(json));
        }
    }

    [Fact]
    public void Accepts_primary_named_insured_allowed_characters()
    {
        var json = JsonSerializer.Serialize(new
        {
            form = new
            {
                firstName = "Anne-Marie",
                middleName = "O'Neil @ Home",
                lastName = "Smith.Jr & Co",
            },
        });

        Assert.Null(AddressLengthValidator.ValidateJson(json));
    }
}
