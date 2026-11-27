namespace InsureEdge.Domain.Entities;

public class ReportGroup
{
    public long Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public ICollection<ReportItem> Items { get; set; } = [];
}

public class ReportItem
{
    public long Id { get; set; }
    public long GroupId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string PageTitle { get; set; } = string.Empty;
    public string ItemType { get; set; } = "FileList";
    public string RoleVisibility { get; set; } = "All";
    public int SortOrder { get; set; }
    public ReportGroup Group { get; set; } = null!;
    public ICollection<ReportCard> Cards { get; set; } = [];
}

public class ReportCard
{
    public long Id { get; set; }
    public long ItemId { get; set; }
    public string ReportCode { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string DefaultReportName { get; set; } = string.Empty;
    public bool IsImplemented { get; set; }
    public int SortOrder { get; set; }
    public ReportItem Item { get; set; } = null!;
}

public class StoredReportFile
{
    public long Id { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string MimeType { get; set; } = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    public long SizeBytes { get; set; }
    public byte[]? Content { get; set; }
    public DateTime CreatedOn { get; set; } = DateTime.UtcNow;
}

public class ReportFile
{
    public long Id { get; set; }
    public long ItemId { get; set; }
    public long ClientId { get; set; }
    public long? IntermediaryId { get; set; }
    public long? ProducerId { get; set; }
    public string ReportName { get; set; } = string.Empty;
    public DateOnly ReportingPeriod { get; set; }
    public string? IssuingCarrier { get; set; }
    public DateTime CreatedOn { get; set; }
    public long? StoredFileId { get; set; }
    public ReportItem Item { get; set; } = null!;
    public StoredReportFile? StoredFile { get; set; }
}

public class ReportDefinition
{
    public long Id { get; set; }
    public long CardId { get; set; }
    public long ClientId { get; set; }
    public long? IntermediaryId { get; set; }
    public long? ProducerId { get; set; }
    public string ReportName { get; set; } = string.Empty;
    public string? DateCriteria { get; set; }
    public DateOnly? PeriodFrom { get; set; }
    public DateOnly? PeriodTo { get; set; }
    public string FiltersJson { get; set; } = "{}";
    public long CreatedBy { get; set; }
    public DateTime CreatedOn { get; set; } = DateTime.UtcNow;
    public long? UpdatedBy { get; set; }
    public DateTime? UpdatedOn { get; set; }
    public string Status { get; set; } = "Active";
    public ReportCard Card { get; set; } = null!;
    public ReportSchedule? Schedule { get; set; }
}

public class ReportSchedule
{
    public long Id { get; set; }
    public long DefinitionId { get; set; }
    public string ScheduleType { get; set; } = string.Empty;
    public string? Frequency { get; set; }
    public DateOnly ScheduledDate { get; set; }
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public string DeliveryMethod { get; set; } = "Email";
    public string Recipients { get; set; } = string.Empty;
    public DateOnly NextRunDate { get; set; }
    public DateTime? LastRunOn { get; set; }
    public string Status { get; set; } = "Active";
    public ReportDefinition Definition { get; set; } = null!;
}

public class GeneratedReport
{
    public long Id { get; set; }
    public long? DefinitionId { get; set; }
    public long CardId { get; set; }
    public long ClientId { get; set; }
    public long? IntermediaryId { get; set; }
    public long? ProducerId { get; set; }
    public long RunBy { get; set; }
    public DateTime CreatedOn { get; set; } = DateTime.UtcNow;
    public bool IsScheduled { get; set; }
    public long StoredFileId { get; set; }
    public int RowCount { get; set; }
    public ReportDefinition? Definition { get; set; }
    public ReportCard Card { get; set; } = null!;
    public StoredReportFile StoredFile { get; set; } = null!;
}

public class ReportRecentActivity
{
    public long Id { get; set; }
    public long ClientId { get; set; }
    public long UserId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string TargetType { get; set; } = string.Empty;
    public long TargetId { get; set; }
    public string TargetName { get; set; } = string.Empty;
    public DateTime OccurredOn { get; set; } = DateTime.UtcNow;
}

public class ReportRunLog
{
    public long Id { get; set; }
    public long DefinitionId { get; set; }
    public DateTime StartedOn { get; set; }
    public DateTime? EndedOn { get; set; }
    public string Status { get; set; } = "Started";
    public string? Error { get; set; }
    public long? GeneratedReportId { get; set; }
}
