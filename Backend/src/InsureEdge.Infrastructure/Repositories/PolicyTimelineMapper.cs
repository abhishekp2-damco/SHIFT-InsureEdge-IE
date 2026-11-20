using InsureEdge.Application.DTOs.QuotesPolicies;

namespace InsureEdge.Infrastructure.Repositories;

internal sealed record PolicyTimelineSource(
    long TransactionId,
    long ClientId,
    long MainPolicyId,
    string? TransactionType,
    string? TransactionTypeLabel,
    DateTime CreatedOn,
    string? TransactionCreatedByName,
    string? AuditActivityDescription,
    string? AuditCreatedByName);

internal static class PolicyTimelineMapper
{
    internal static List<PolicyTimelineEntryDto> Map(
        IEnumerable<PolicyTimelineSource> sources,
        long clientId,
        IReadOnlyCollection<long> policyIds)
    {
        var allowedPolicyIds = policyIds.ToHashSet();

        return sources
            .Where(source => source.ClientId == clientId && allowedPolicyIds.Contains(source.MainPolicyId))
            .GroupBy(source => source.TransactionId)
            .Select(group => group.OrderBy(source => source.CreatedOn).First())
            .OrderBy(source => source.CreatedOn)
            .ThenBy(source => source.TransactionId)
            .Select(source => new PolicyTimelineEntryDto(
                FirstAvailable(
                    source.TransactionTypeLabel,
                    source.TransactionType,
                    source.AuditActivityDescription,
                    "Policy Transaction"),
                FirstAvailable(
                    source.TransactionCreatedByName,
                    source.AuditCreatedByName,
                    "System"),
                source.CreatedOn.ToString("MM-dd-yyyy"),
                source.CreatedOn.ToString("HH:mm")))
            .ToList();
    }

    private static string FirstAvailable(params string?[] values) =>
        values.First(value => !string.IsNullOrWhiteSpace(value))!.Trim();
}
