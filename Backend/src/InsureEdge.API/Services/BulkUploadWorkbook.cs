using System.Globalization;
using System.Reflection;
using System.Text.RegularExpressions;
using ClosedXML.Excel;
using InsureEdge.Application.DTOs.QuotesPolicies;
using InsureEdge.Application.Services;

namespace InsureEdge.API.Services;

/// <summary>
/// Loads the approved bulk-upload workbook verbatim and parses completed copies
/// against its fixed 157-column contract.
/// </summary>
public static class BulkUploadWorkbook
{
    public const string DownloadFileName = "E&S Homeowners Insurance Products Upload Template.xlsx";
    public const string ResourceName = "InsureEdge.API.Templates.BulkUploadTemplate.xlsx";

    public static byte[] GetTemplateBytes()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"Embedded bulk-upload template '{ResourceName}' was not found.");
        using var buffer = new MemoryStream();
        stream.CopyTo(buffer);
        return buffer.ToArray();
    }

    public static List<BulkUploadRow> Parse(Stream stream)
    {
        using var workbook = new XLWorkbook(stream);
        var firstSheet = workbook.Worksheets.FirstOrDefault()
            ?? throw new InvalidOperationException("The workbook does not contain any worksheets.");

        if (!string.Equals(firstSheet.Name, BulkUploadColumns.ImportSheetName, StringComparison.Ordinal))
            throw new InvalidOperationException($"The first worksheet must be named '{BulkUploadColumns.ImportSheetName}'.");

        ValidateHeaders(firstSheet);

        var rows = new List<BulkUploadRow>();
        var lastRow = firstSheet.LastRowUsed(XLCellsUsedOptions.Contents)?.RowNumber() ?? 0;
        for (var rowNumber = BulkUploadColumns.DataStartRow; rowNumber <= lastRow; rowNumber++)
        {
            var row = firstSheet.Row(rowNumber);
            var values = new string?[BulkUploadColumns.Headers.Length];
            var hasValue = false;

            for (var columnNumber = 1; columnNumber <= values.Length; columnNumber++)
            {
                var value = ReadCell(row.Cell(columnNumber));
                if (!string.IsNullOrWhiteSpace(value)) hasValue = true;
                values[columnNumber - 1] = value;
            }

            if (hasValue) rows.Add(new BulkUploadRow(rowNumber, values));
        }

        return rows;
    }

    private static void ValidateHeaders(IXLWorksheet sheet)
    {
        for (var index = 0; index < BulkUploadColumns.Headers.Length; index++)
        {
            var actual = NormalizeHeader(sheet.Cell(3, index + 1).GetString());
            var expected = NormalizeHeader(BulkUploadColumns.Headers[index]);
            if (string.Equals(actual, expected, StringComparison.Ordinal)) continue;

            var column = BulkUploadColumns.ExcelColumnName(index);
            throw new InvalidOperationException(
                $"Invalid column header at {column}3. Expected '{expected}' but found '{actual}'. Download a fresh template and do not rename or reorder columns.");
        }
    }

    private static string? ReadCell(IXLCell cell)
    {
        if (cell.IsEmpty()) return null;

        var value = cell.DataType switch
        {
            XLDataType.DateTime => cell.GetDateTime().ToString("MM/dd/yyyy", CultureInfo.InvariantCulture),
            XLDataType.Number => cell.GetDouble().ToString("G15", CultureInfo.InvariantCulture),
            XLDataType.Boolean => cell.GetBoolean() ? "True" : "False",
            _ => cell.GetString(),
        };

        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static string NormalizeHeader(string value)
        => Regex.Replace(value ?? string.Empty, @"\s+", " ").Trim();
}
