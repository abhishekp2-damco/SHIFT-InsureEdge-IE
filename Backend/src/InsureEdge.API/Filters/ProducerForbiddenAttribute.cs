using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace InsureEdge.API.Filters;

/// <summary>
/// Blocks an action for Producer logins (QA IP-19, IP-20, IP-27); staff sessions (no
/// <c>producer_id</c> claim) are never affected. Hiding the button isn't enough, so this
/// rejects direct API calls too.
/// </summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
public sealed class ProducerForbiddenAttribute : Attribute, IAuthorizationFilter
{
    public void OnAuthorization(AuthorizationFilterContext context)
    {
        if (context.HttpContext.User.FindFirst("producer_id") is null) return;

        context.Result = new ObjectResult(new { error = "You do not have access to this action." })
        {
            StatusCode = StatusCodes.Status403Forbidden,
        };
    }
}
