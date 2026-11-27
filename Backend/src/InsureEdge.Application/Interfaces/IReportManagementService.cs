using InsureEdge.Application.DTOs.ReportManagement;

namespace InsureEdge.Application.Interfaces;

public interface IReportManagementService
{
    Task<ReportCatalogDto> GetCatalogAsync(CancellationToken ct);
    Task<IReadOnlyList<int>> GetYearsAsync(string itemCode, CancellationToken ct);
    Task<PagedResult<ReportFileDto>> GetFilesAsync(string itemCode, int year, string? search, int page, int pageSize, CancellationToken ct);
    Task<(string FileName, string ContentType, byte[] Content)> GetReportFileAsync(long id, string action, CancellationToken ct);
    Task<PagedResult<GeneratedReportDto>> GetGeneratedAsync(string reportCode, string? search, int page, int pageSize, CancellationToken ct);
    Task<PagedResult<ReportDefinitionDto>> GetDefinitionsAsync(string reportCode, string? search, int page, int pageSize, CancellationToken ct);
    Task<ReportDefinitionDto> GetDefinitionAsync(string reportCode, long id, CancellationToken ct);
    Task<ReportFormMetadataDto> GetMetadataAsync(string reportCode, CancellationToken ct);
    Task<PreviewResultDto> PreviewAsync(string reportCode, SaveReportDefinitionRequest request, CancellationToken ct);
    Task<long> CreateAsync(string reportCode, SaveReportDefinitionRequest request, CancellationToken ct);
    Task UpdateAsync(string reportCode, long id, SaveReportDefinitionRequest request, CancellationToken ct);
    Task DeleteAsync(string reportCode, long id, CancellationToken ct);
    Task<(string FileName, string ContentType, byte[] Content)> GetGeneratedFileAsync(long id, string action, CancellationToken ct);
    Task SendEmailAsync(SendReportEmailRequest request, CancellationToken ct);
    Task ShareGeneratedAsync(long id, ShareGeneratedRequest request, CancellationToken ct);
    Task<IReadOnlyList<UserLookupDto>> GetUsersAsync(CancellationToken ct);
    Task<IReadOnlyList<RecentActivityDto>> GetRecentActivityAsync(CancellationToken ct);
    Task RunDueSchedulesAsync(CancellationToken ct);
}
