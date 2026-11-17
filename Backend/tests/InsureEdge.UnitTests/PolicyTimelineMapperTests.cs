using FluentAssertions;
using InsureEdge.Infrastructure.Repositories;
using Xunit;

namespace InsureEdge.UnitTests;

public class PolicyTimelineMapperTests
{
    private static readonly DateTime FirstCreated = new(2026, 7, 17, 9, 5, 0, DateTimeKind.Utc);

    [Fact]
    public void Transaction_with_an_audit_is_returned_once_with_transaction_details()
    {
        var source = Source(
            transactionId: 10,
            transactionType: "NewBusiness",
            transactionTypeLabel: "New Business",
            transactionCreator: "Alex Mercer",
            auditDescription: "New Business Issuance",
            auditCreator: "Audit User");

        var result = PolicyTimelineMapper.Map([source], clientId: 1, policyIds: [100]);

        result.Should().ContainSingle();
        result[0].ActivityDescription.Should().Be("New Business");
        result[0].CreatedByName.Should().Be("Alex Mercer");
        result[0].CreatedDate.Should().Be("07-17-2026");
        result[0].CreatedTime.Should().Be("09:05");
    }

    [Fact]
    public void DoNotRenew_transaction_without_an_audit_is_not_dropped()
    {
        var source = Source(
            transactionId: 11,
            transactionType: "DoNotRenew",
            transactionTypeLabel: "Non-Renewed",
            transactionCreator: "Priya Nadkarni");

        var result = PolicyTimelineMapper.Map([source], clientId: 1, policyIds: [100]);

        result.Should().ContainSingle();
        result[0].ActivityDescription.Should().Be("Non-Renewed");
        result[0].CreatedByName.Should().Be("Priya Nadkarni");
    }

    [Fact]
    public void Completed_endorsement_without_an_audit_returns_type_creator_and_transaction_timestamp_once()
    {
        var endorsement = Source(
            transactionId: 12,
            transactionType: "EndorsementIndividual",
            transactionTypeLabel: "Endorsement",
            transactionCreator: "Alex Mercer");

        var result = PolicyTimelineMapper.Map(
            [endorsement, endorsement],
            clientId: 1,
            policyIds: [100]);

        result.Should().ContainSingle();
        result[0].ActivityDescription.Should().Be("Endorsement");
        result[0].CreatedByName.Should().Be("Alex Mercer");
        result[0].CreatedDate.Should().Be("07-17-2026");
        result[0].CreatedTime.Should().Be("09:05");
    }

    [Fact]
    public void New_business_renewal_and_do_not_renew_transactions_remain_visible()
    {
        var newBusiness = Source(13, "NewBusiness", "New Business", "Alex Mercer");
        var renewal = Source(14, "RenewalIndividual", "Renewal", "Alex Mercer") with
        {
            CreatedOn = FirstCreated.AddDays(1),
        };
        var doNotRenew = Source(15, "DoNotRenew", "Non-Renewed", "Alex Mercer") with
        {
            CreatedOn = FirstCreated.AddDays(2),
        };

        var result = PolicyTimelineMapper.Map(
            [doNotRenew, renewal, newBusiness],
            clientId: 1,
            policyIds: [100]);

        result.Select(entry => entry.ActivityDescription)
            .Should().Equal("New Business", "Renewal", "Non-Renewed");
    }

    [Fact]
    public void Multiple_transactions_are_chronological_and_duplicate_join_rows_are_removed()
    {
        var later = Source(22, "EndorsementIndividual", "Endorsement", "Jamie Rivera") with
        {
            CreatedOn = FirstCreated.AddDays(2),
        };
        var earlier = Source(21, "RenewalIndividual", "Renewal", null, auditCreator: "System Operator");

        var result = PolicyTimelineMapper.Map([later, earlier, later], clientId: 1, policyIds: [100]);

        result.Should().HaveCount(2);
        result.Select(entry => entry.ActivityDescription).Should().Equal("Renewal", "Endorsement");
        result[0].CreatedByName.Should().Be("System Operator");
        result[1].CreatedDate.Should().Be("07-19-2026");
    }

    [Fact]
    public void Empty_source_returns_an_empty_timeline()
    {
        PolicyTimelineMapper.Map([], clientId: 1, policyIds: [100]).Should().BeEmpty();
    }

    [Fact]
    public void Timeline_is_filtered_to_the_requested_tenant_and_policy_rows()
    {
        var expected = Source(31, "CancelPolicy", "Cancellation", "Alex Mercer");
        var otherPolicy = Source(32, "RenewalIndividual", "Renewal", "Alex Mercer") with { MainPolicyId = 999 };
        var otherTenant = Source(33, "NewBusiness", "New Business", "Other User") with { ClientId = 2 };

        var result = PolicyTimelineMapper.Map([expected, otherPolicy, otherTenant], clientId: 1, policyIds: [100]);

        result.Should().ContainSingle();
        result[0].ActivityDescription.Should().Be("Cancellation");
    }

    private static PolicyTimelineSource Source(
        long transactionId,
        string? transactionType,
        string? transactionTypeLabel,
        string? transactionCreator,
        string? auditDescription = null,
        string? auditCreator = null) => new(
            transactionId,
            ClientId: 1,
            MainPolicyId: 100,
            transactionType,
            transactionTypeLabel,
            FirstCreated,
            transactionCreator,
            auditDescription,
            auditCreator);
}
