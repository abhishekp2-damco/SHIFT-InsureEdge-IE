using System.Security.Claims;
using FluentAssertions;
using InsureEdge.API.Controllers;
using InsureEdge.API.Filters;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Xunit;

namespace InsureEdge.UnitTests;

// QA IP-19 / IP-20 / IP-27.
public class ProducerForbiddenAttributeTests
{
    private static AuthorizationFilterContext Context(params Claim[] claims)
    {
        var http = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test")) };
        var action = new ActionContext(http, new RouteData(), new ActionDescriptor());
        return new AuthorizationFilterContext(action, new List<IFilterMetadata>());
    }

    [Fact]
    public void Producer_gets_403()
    {
        var context = Context(new Claim("producer_id", "5"));
        new ProducerForbiddenAttribute().OnAuthorization(context);
        context.Result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public void Staff_are_not_affected()
    {
        var context = Context(new Claim("client_id", "1"));
        new ProducerForbiddenAttribute().OnAuthorization(context);
        context.Result.Should().BeNull();
    }

    [Theory]
    [InlineData(nameof(PoliciesController.CancelPolicy))]
    [InlineData(nameof(PoliciesController.CancelRewritePolicy))]
    [InlineData(nameof(PoliciesController.SubmitDoNotRenew))]
    [InlineData(nameof(PoliciesController.RemoveDoNotRenew))]
    [InlineData(nameof(PoliciesController.CreateNote))]
    [InlineData(nameof(PoliciesController.UpdateNote))]
    [InlineData(nameof(PoliciesController.DeleteNote))]
    public void Restricted_policy_actions_carry_the_attribute(string action)
    {
        typeof(PoliciesController).GetMethod(action)!
            .GetCustomAttributes(typeof(ProducerForbiddenAttribute), false).Should().NotBeEmpty();
    }

    [Fact]
    public void Producers_keep_endorse()
    {
        typeof(PoliciesController).GetMethod(nameof(PoliciesController.EndorsePolicy))!
            .GetCustomAttributes(typeof(ProducerForbiddenAttribute), false).Should().BeEmpty();
    }
}
