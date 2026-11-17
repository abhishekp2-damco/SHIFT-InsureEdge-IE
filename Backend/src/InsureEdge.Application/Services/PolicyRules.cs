// AI_GENERATED | HUMAN_VALIDATION_REQUIRED
using System.Globalization;
using System.Text.RegularExpressions;

namespace InsureEdge.Application.Services;

/// <summary>
/// QA IP-08 / IP-16: endorsements and rewrites share the original PolicyNumber, so one policy
/// number can have several rows. These rules decide which row *is* the policy, so the listing,
/// KPIs, Policy Summary and View Policy all show the same status.
/// </summary>
public static class PolicyRules
{
    public const string StatusDoNotRenew = "DONOTRENEW";
    private static readonly Regex OutsystemsPolicyNumber = new(
        @"^\d{3}-\d{5}-(\d{7})-\d{2}$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex LegacyPolicyNumber = new(
        @"^HB-\d{4}-(\d+)$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    /// <summary>
    /// Builds the IE US H&amp;B OutSystems identifier:
    /// client-intermediary-policy-sequence-base-suffix.
    /// </summary>
    public static string FormatPolicyNumber(long clientId, long intermediaryId, int sequence)
    {
        if (clientId is < 0 or > 999)
            throw new ArgumentOutOfRangeException(nameof(clientId), "Client ID must fit the 3-digit policy-number segment.");
        if (intermediaryId is < 0 or > 99_999)
            throw new ArgumentOutOfRangeException(nameof(intermediaryId), "Intermediary ID must fit the 5-digit policy-number segment.");
        if (sequence is < 1 or > 9_999_999)
            throw new ArgumentOutOfRangeException(nameof(sequence), "Policy sequence must be between 1 and 9,999,999.");

        return $"{clientId:D3}-{intermediaryId:D5}-{sequence:D7}-00";
    }

    /// <summary>
    /// Reads the sequence from both the current OutSystems shape and legacy HB-year values.
    /// Accepting the legacy shape keeps allocation collision-free while a data migration is pending.
    /// </summary>
    public static bool TryGetPolicySequence(string? policyNumber, out int sequence)
    {
        sequence = 0;
        if (string.IsNullOrWhiteSpace(policyNumber)) return false;

        var value = policyNumber.Trim();
        var match = OutsystemsPolicyNumber.Match(value);
        if (!match.Success) match = LegacyPolicyNumber.Match(value);
        return match.Success && int.TryParse(match.Groups[1].Value, NumberStyles.None, CultureInfo.InvariantCulture, out sequence);
    }

    // Is this row a candidate for "the policy"? Drafts are unfinished work and Inactive rows
    // are versions already replaced by an endorsement.
    public static bool IsCurrentCandidate(string? policyType, string? status) =>
        status != "Draft" && status != "Inactive" && (policyType == "POLICY" || status == "Bound");

    // Lower wins: a live row beats anything else, and a Cancelled row only wins when nothing
    // replaced it.
    public static int StatusRank(string? status) => status switch
    {
        "Active" or "Bound" or StatusDoNotRenew => 0,
        "Cancelled" => 2,
        _ => 1,
    };

    public static T? PickCurrent<T>(IEnumerable<T> rows, Func<T, string?> status, Func<T, long> id) where T : class =>
        rows.OrderBy(r => StatusRank(status(r))).ThenByDescending(id).FirstOrDefault();

    // QA IP-01: the wizard stores MM-DD-YYYY, and reading that as DD-MM swapped month and day
    // when a quote was issued. DD-MM-YYYY stays as the fallback for older values that can't be
    // month-first, such as "25-06-2026".
    public static DateOnly? ParseFormDate(string? value)
    {
        var text = value?.Trim().Split(' ')[0];
        if (string.IsNullOrEmpty(text)) return null;
        string[] formats = { "MM-dd-yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "dd-MM-yyyy", "dd/MM/yyyy" };
        return DateOnly.TryParseExact(text, formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ? date : null;
    }

    // QA IP-15: days since the oldest unpaid instalment fell due; 0 when nothing is overdue.
    public static int OverdueDays(IEnumerable<(DateOnly DueDate, bool IsPaid)> instalments, DateOnly today)
    {
        var oldest = instalments.Where(i => !i.IsPaid && i.DueDate < today).Select(i => (DateOnly?)i.DueDate).Min();
        return oldest == null ? 0 : today.DayNumber - oldest.Value.DayNumber;
    }

    // Matches OutSystems GetPolicyBillingSummary: the amount shown below the chart is the
    // total due on the earliest unpaid payment date, not the balance of every future instalment.
    public static decimal NextPaymentDueAmount(IEnumerable<(DateOnly DueDate, decimal AmountDue, bool IsPaid)> instalments)
    {
        var unpaid = instalments.Where(i => !i.IsPaid).ToList();
        if (unpaid.Count == 0) return 0m;

        var nextDueDate = unpaid.Min(i => i.DueDate);
        return unpaid.Where(i => i.DueDate == nextDueDate).Sum(i => i.AmountDue);
    }
}
