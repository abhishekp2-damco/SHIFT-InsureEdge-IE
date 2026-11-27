using InsureEdge.Application.DTOs.ReportManagement;
using InsureEdge.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InsureEdge.API.Controllers;

[ApiController]
[Route("api/report-management")]
[Authorize]
public sealed class ReportManagementController(IReportManagementService reports) : ControllerBase
{
    [HttpGet("catalog")]
    public async Task<IActionResult> Catalog(CancellationToken ct) => Ok(await reports.GetCatalogAsync(ct));

    [HttpGet("items/{itemCode}/years")]
    public async Task<IActionResult> Years(string itemCode, CancellationToken ct) => Ok(await reports.GetYearsAsync(itemCode, ct));

    [HttpGet("items/{itemCode}/files")]
    public async Task<IActionResult> Files(string itemCode, [FromQuery] int year, [FromQuery] string? search = null,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 10, CancellationToken ct = default) =>
        await Guard(() => reports.GetFilesAsync(itemCode, year, search, page, pageSize, ct));

    [HttpGet("files/{id:long}")]
    public async Task<IActionResult> File(long id, [FromQuery] string action = "View", CancellationToken ct = default)
    {
        try { var file = await reports.GetReportFileAsync(id, action, ct); return PhysicalFileResult(file); }
        catch (Exception ex) { return Error(ex); }
    }

    [HttpGet("reports/{reportCode}/generated")]
    public async Task<IActionResult> Generated(string reportCode, [FromQuery] string? search = null,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 10, CancellationToken ct = default) =>
        await Guard(() => reports.GetGeneratedAsync(reportCode, search, page, pageSize, ct));

    [HttpGet("reports/{reportCode}/definitions")]
    public async Task<IActionResult> Definitions(string reportCode, [FromQuery] string? search = null,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 10, CancellationToken ct = default) =>
        await Guard(() => reports.GetDefinitionsAsync(reportCode, search, page, pageSize, ct));

    [HttpGet("reports/{reportCode}/definitions/{id:long}")]
    public async Task<IActionResult> Definition(string reportCode, long id, CancellationToken ct) =>
        await Guard(() => reports.GetDefinitionAsync(reportCode, id, ct));

    [HttpGet("reports/{reportCode}/metadata")]
    public async Task<IActionResult> Metadata(string reportCode, CancellationToken ct) =>
        await Guard(() => reports.GetMetadataAsync(reportCode, ct));

    [HttpPost("reports/{reportCode}/preview")]
    public async Task<IActionResult> Preview(string reportCode, [FromBody] SaveReportDefinitionRequest request, CancellationToken ct) =>
        await Guard(() => reports.PreviewAsync(reportCode, request, ct));

    [HttpPost("reports/{reportCode}/definitions")]
    public async Task<IActionResult> Create(string reportCode, [FromBody] SaveReportDefinitionRequest request, CancellationToken ct) =>
        await Guard(async () => new { id = await reports.CreateAsync(reportCode, request, ct) });

    [HttpPut("reports/{reportCode}/definitions/{id:long}")]
    public async Task<IActionResult> Update(string reportCode, long id, [FromBody] SaveReportDefinitionRequest request, CancellationToken ct)
    {
        try { await reports.UpdateAsync(reportCode, id, request, ct); return NoContent(); }
        catch (Exception ex) { return Error(ex); }
    }

    [HttpDelete("reports/{reportCode}/definitions/{id:long}")]
    public async Task<IActionResult> Delete(string reportCode, long id, CancellationToken ct)
    {
        try { await reports.DeleteAsync(reportCode, id, ct); return NoContent(); }
        catch (Exception ex) { return Error(ex); }
    }

    [HttpGet("generated/{id:long}/file")]
    public async Task<IActionResult> GeneratedFile(long id, [FromQuery] string action = "View", CancellationToken ct = default)
    {
        try { var file = await reports.GetGeneratedFileAsync(id, action, ct); return PhysicalFileResult(file); }
        catch (Exception ex) { return Error(ex); }
    }

    [HttpPost("generated/{id:long}/share")]
    public async Task<IActionResult> Share(long id, [FromBody] ShareGeneratedRequest request, CancellationToken ct)
    {
        try { await reports.ShareGeneratedAsync(id, request, ct); return NoContent(); }
        catch (Exception ex) { return Error(ex); }
    }

    [HttpPost("emails")]
    public async Task<IActionResult> Email([FromBody] SendReportEmailRequest request, CancellationToken ct)
    {
        try { await reports.SendEmailAsync(request, ct); return NoContent(); }
        catch (Exception ex) { return Error(ex); }
    }

    [HttpGet("users")]
    public async Task<IActionResult> Users(CancellationToken ct) => Ok(await reports.GetUsersAsync(ct));

    [HttpGet("recent-activity")]
    public async Task<IActionResult> RecentActivity(CancellationToken ct) => Ok(await reports.GetRecentActivityAsync(ct));

    private FileContentResult PhysicalFileResult((string FileName, string ContentType, byte[] Content) file) =>
        File(file.Content, file.ContentType, file.FileName, enableRangeProcessing: true);

    private async Task<IActionResult> Guard<T>(Func<Task<T>> action)
    {
        try { return Ok(await action()); }
        catch (Exception ex) { return Error(ex); }
    }

    private IActionResult Error(Exception ex) => ex switch
    {
        ArgumentException => BadRequest(new { error = ex.Message }),
        KeyNotFoundException => NotFound(new { error = ex.Message }),
        UnauthorizedAccessException => StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message }),
        InvalidOperationException => Conflict(new { error = ex.Message }),
        _ => throw ex
    };
}
