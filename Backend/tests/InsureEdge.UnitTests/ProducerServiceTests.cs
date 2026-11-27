using FluentAssertions;
using InsureEdge.Infrastructure.Services;
using Xunit;

namespace InsureEdge.UnitTests;

public class ProducerServiceTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void ResolveDefaultPassword_uses_fallback_when_configuration_is_missing_or_blank(string? configuredPassword)
    {
        ProducerService.ResolveDefaultPassword(configuredPassword).Should().Be("Producer@123");
    }

    [Fact]
    public void ResolveDefaultPassword_preserves_a_configured_password()
    {
        ProducerService.ResolveDefaultPassword("Configured-password").Should().Be("Configured-password");
    }
}
