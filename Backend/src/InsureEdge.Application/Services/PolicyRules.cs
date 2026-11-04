// AI_GENERATED | HUMAN_VALIDATION_REQUIRED
using System.Globalization;

namespace InsureEdge.Application.Services;

/// <summary>
/// QA IP-08 / IP-16: endorsements and rewrites share the original PolicyNumber, so one policy
/// number can have several rows. These rules decide which row *is* the policy, so the listing,
/// KPIs, Policy Summary and View Policy all show the same status.
/// </summary>
public static class PolicyRules
{
    public const string StatusDoNotRenew = "DONOTRENEW";

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
}
