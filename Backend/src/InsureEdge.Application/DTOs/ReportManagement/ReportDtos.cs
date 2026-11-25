using System.Text.Json;

namespace InsureEdge.Application.DTOs.ReportManagement;

public record ReportCatalogDto(IReadOnlyList<ReportGroupDto> Groups);
public record ReportGroupDto(long Id, string Name, int SortOrder, IReadOnlyList<ReportItemDto> Items);
public record ReportItemDto(long Id, string Code, string Label, string PageTitle, string ItemType, int SortOrder, IReadOnlyList<ReportCardDto> Cards);
public record ReportCardDto(long Id, string ReportCode, string Title, string Description, string DefaultReportName, bool IsImplemented, int SortOrder);
public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);
public record ReportFileDto(long Id, string ItemCode, string ReportName, string ReportingPeriod, string? IssuingCarrier, DateTime CreatedOn);
public record GeneratedReportDto(long Id, string ReportName, string ReportRunBy, DateTime ReportCreatedDate, bool ScheduledReport);
public record ReportDefinitionDto(long Id, string ReportCode, string ReportName, string ScheduledBy, string? DateCriteria,
    DateOnly? PeriodFrom, DateOnly? PeriodTo, Dictionary<string, string[]> Filters, string? ScheduleType,
    string? Frequency, DateOnly? ScheduledDate, DateOnly? StartDate, DateOnly? EndDate,
    string? DeliveryMethod, string? Recipients, bool CanEdit, bool CanDelete);

public class SaveReportDefinitionRequest
{
    public string ReportName { get; set; } = string.Empty;
    public string? DateCriteria { get; set; }
    public DateOnly? PeriodFrom { get; set; }
    public DateOnly? PeriodTo { get; set; }
    public Dictionary<string, string[]> Filters { get; set; } = [];
    public bool IsScheduleReport { get; set; }
    public string? ScheduleType { get; set; }
    public string? Frequency { get; set; }
    public DateOnly? ScheduledDate { get; set; }
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public string? DeliveryMethod { get; set; }
    public string? Recipients { get; set; }
}

public record ReportFormMetadataDto(string ReportCode, string ReportName, IReadOnlyList<ReportFieldDto> Fields, Dictionary<string, IReadOnlyList<LookupDto>> Lookups);
public record ReportFieldDto(string Key, string Label, string Type);
public record LookupDto(string Value, string Label);
public record PreviewResultDto(string FileName, string ContentBase64, int RowCount);
public record RecentActivityDto(long Id, string Action, string TargetType, string TargetName, DateTime OccurredOn);
public record UserLookupDto(long Id, string Name, string Email);
public record ShareGeneratedRequest(IReadOnlyList<long> UserIds);
public record SendReportEmailRequest(long? ReportFileId, long? GeneratedReportId, string From, IReadOnlyList<string> To,
    IReadOnlyList<string> Cc, IReadOnlyList<string> Bcc, string Subject, string Body,
    IReadOnlyList<EmailUploadDto>? Uploads);
public record EmailUploadDto(string FileName, string ContentType, string ContentBase64);

public static class ReportJson
{
    public static Dictionary<string, string[]> Read(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, string[]>>(json) ?? [];
}
