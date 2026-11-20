// AI_GENERATED | HUMAN_VALIDATION_REQUIRED
// Bulk Upload (Quotes & Policies) DTOs — history rows + per-file upload result.
namespace InsureEdge.Application.DTOs.QuotesPolicies;

public record BulkUploadAuditDto(
    long Id,
    string Module,
    string FileName,
    int TotalRecords,
    int ProcessedRecords,
    string Status,
    bool HasErrorFile,
    DateTime CreatedOn
);

public record BulkUploadResultDto(
    long AuditId,
    int TotalRecords,
    int SuccessCount,
    int FailureCount,
    string Status
);

// Keeps the physical worksheet row attached to its parsed values so blank rows do
// not shift the row reported in validation/error files.
public record BulkUploadRow(int RowNumber, string?[] Values);
