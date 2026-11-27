using InsureEdge.Application.Services;
using Xunit;

namespace InsureEdge.UnitTests;

// QA IP-08 / IP-15 / IP-16.
public class PolicyRulesTests
{
    private sealed record Row(long Id, string? Type, string? Status);

    private static long? Pick(params Row[] rows) =>
        PolicyRules.PickCurrent(
            rows.Where(r => PolicyRules.IsCurrentCandidate(r.Type, r.Status)), r => r.Status, r => r.Id)?.Id;

    [Fact]
    public void Policy_number_matches_the_outsystems_four_segment_format() =>
        Assert.Equal("001-00004-0000015-00", PolicyRules.FormatPolicyNumber(1, 4, 15));

    [Theory]
    [InlineData("001-00004-0000015-00", 15)]
    [InlineData("HB-2026-000022", 22)]
    public void Policy_sequence_is_read_from_current_and_legacy_numbers(string value, int expected)
    {
        Assert.True(PolicyRules.TryGetPolicySequence(value, out var actual));
        Assert.Equal(expected, actual);
    }

    [Theory]
    [InlineData("HB-2026")]
    [InlineData("001-00004-15-00")]
    [InlineData("")]
    public void Invalid_policy_numbers_do_not_supply_a_sequence(string value) =>
        Assert.False(PolicyRules.TryGetPolicySequence(value, out _));

    [Fact]
    public void Endorsed_policy_resolves_to_the_active_row_not_the_replaced_one() =>
        Assert.Equal(2, Pick(new Row(1, "POLICY", "Inactive"), new Row(2, "POLICY", "Active")));

    [Fact]
    public void Older_active_row_beats_a_newer_cancelled_row() =>
        Assert.Equal(1, Pick(new Row(1, "POLICY", "Active"), new Row(2, "POLICY", "Cancelled")));

    [Fact]
    public void Rewritten_policy_resolves_to_the_replacement() =>
        Assert.Equal(2, Pick(new Row(1, "POLICY", "Cancelled"), new Row(2, "POLICY", "Active")));

    [Fact]
    public void Cancelled_policy_with_no_replacement_stays_cancelled() =>
        Assert.Equal(1, Pick(new Row(1, "POLICY", "Cancelled")));

    [Fact]
    public void Drafts_of_any_type_are_never_the_policy() =>
        Assert.Equal(1, Pick(new Row(1, "POLICY", "Active"), new Row(2, "ENDORSEMENT", "Draft"), new Row(3, "ENDORSEMENT", "Submitted")));

    [Fact]
    public void Bound_quote_counts_as_the_policy() =>
        Assert.Equal(1, Pick(new Row(1, "NEWBUSINESS", "Bound")));

    [Fact]
    public void Newest_row_wins_between_equal_statuses() =>
        Assert.Equal(2, Pick(new Row(1, "POLICY", "Active"), new Row(2, "POLICY", "DONOTRENEW")));

    [Theory]
    [InlineData("11-07-2026", 2026, 11, 7)]
    [InlineData("11-07-2026 00:00:00", 2026, 11, 7)]
    [InlineData("2026-11-07", 2026, 11, 7)]
    [InlineData("25-06-2026", 2026, 6, 25)]
    public void Form_dates_read_month_first(string value, int year, int month, int day) =>
        Assert.Equal(new DateOnly(year, month, day), PolicyRules.ParseFormDate(value));

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("not a date")]
    public void Unreadable_form_dates_are_null(string? value) =>
        Assert.Null(PolicyRules.ParseFormDate(value));

    [Fact]
    public void Overdue_counts_from_the_oldest_unpaid_instalment()
    {
        var today = new DateOnly(2026, 11, 4);
        Assert.Equal(10, PolicyRules.OverdueDays(new[]
        {
            (new DateOnly(2026, 9, 1), true),
            (new DateOnly(2026, 10, 25), false),
            (new DateOnly(2026, 11, 1), false),
            (new DateOnly(2026, 12, 1), false),
        }, today));
    }

    [Fact]
    public void Nothing_overdue_when_unpaid_instalments_are_not_yet_due()
    {
        var today = new DateOnly(2026, 11, 4);
        Assert.Equal(0, PolicyRules.OverdueDays(new[] { (new DateOnly(2026, 11, 4), false), (new DateOnly(2026, 9, 1), true) }, today));
    }

    [Fact]
    public void Next_payment_due_amount_sums_only_the_earliest_unpaid_due_date()
    {
        Assert.Equal(17540.60m, PolicyRules.NextPaymentDueAmount(new[]
        {
            (new DateOnly(2026, 10, 25), 500m, true),
            (new DateOnly(2026, 11, 1), 17000m, false),
            (new DateOnly(2026, 11, 1), 540.60m, false),
            (new DateOnly(2026, 12, 1), 17540.60m, false),
        }));
    }

    [Fact]
    public void Next_payment_due_amount_is_zero_when_the_policy_is_fully_paid() =>
        Assert.Equal(0m, PolicyRules.NextPaymentDueAmount(new[]
        {
            (new DateOnly(2026, 11, 1), 17540.60m, true),
        }));
}
