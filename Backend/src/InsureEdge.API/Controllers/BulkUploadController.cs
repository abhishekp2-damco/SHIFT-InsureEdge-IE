// AI_GENERATED | HUMAN_VALIDATION_REQUIRED
// Bulk Upload (Quotes & Policies): exact template download, multipart upload,
// history, and error-report download. Workbook parsing is centralized in
// BulkUploadWorkbook so template/header validation cannot drift from this route.
using InsureEdge.API.Filters;
using InsureEdge.API.Services;
using InsureEdge.Application.DTOs.QuotesPolicies;
using InsureEdge.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InsureEdge.API.Controllers;

[ApiController]
[Route("api/bulk-upload")]
[Authorize]
public class BulkUploadController : ControllerBase
{
    private readonly BulkUploadService _bulkUpload;

    public BulkUploadController(BulkUploadService bulkUpload) => _bulkUpload = bulkUpload;

    [HttpGet("template")]
    [ProducerOnly]
    public IActionResult DownloadTemplate()
        => File(
            BulkUploadWorkbook.GetTemplateBytes(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            BulkUploadWorkbook.DownloadFileName);

    [HttpPost]
    [ProducerOnly]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> Upload([FromForm] IFormFile file, [FromForm] string? module)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "No file uploaded." });

        List<BulkUploadRow> rows;
        try
        {
            using var stream = file.OpenReadStream();
            rows = BulkUploadWorkbook.Parse(stream);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = $"Unable to read Excel file: {ex.Message}" });
        }

        if (rows.Count == 0)
            return BadRequest(new { error = "The uploaded file has no data rows." });

        try
        {
            var result = await _bulkUpload.ProcessAsync(
                file.FileName,
                rows,
                string.IsNullOrWhiteSpace(module) ? BulkUploadService.QuotesPoliciesModule : module);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return Unauthorized(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Unexpected error in bulk upload: {ex}");
            return StatusCode(500, new
            {
                error = "An unexpected error occurred during bulk upload processing.",
                details = ex.Message,
            });
        }
    }

    [HttpGet("history")]
    [ProducerOnly]
    public async Task<IActionResult> History([FromQuery] string? module)
        => Ok(await _bulkUpload.GetHistoryAsync(
            string.IsNullOrWhiteSpace(module) ? BulkUploadService.QuotesPoliciesModule : module));

    [HttpGet("{auditId}/error-report")]
    [ProducerOnly]
    public async Task<IActionResult> ErrorReport(long auditId)
    {
        var bytes = await _bulkUpload.GetErrorReportAsync(auditId);
        if (bytes == null)
            return NotFound(new { error = "No upload report available for this upload." });

        var isXlsx = bytes.Length >= 4
            && bytes[0] == (byte)'P'
            && bytes[1] == (byte)'K';
        return isXlsx
            ? File(
                bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                $"BulkUpload_{auditId}_Report.xlsx")
            : File(bytes, "text/csv", $"BulkUpload_{auditId}_Report.csv");
    }
}
