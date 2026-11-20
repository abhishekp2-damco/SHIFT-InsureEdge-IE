using System.Security.Cryptography;
using System.Text.RegularExpressions;
using ClosedXML.Excel;
using FluentAssertions;
using InsureEdge.API.Services;
using InsureEdge.Application.Services;
using Xunit;

namespace InsureEdge.UnitTests;

public class BulkUploadTemplateTests
{
    private const string ApprovedTemplateSha256 = "73DE85E6BF42BD117449F44522817F915CB3D4AD62F44131AF24969AC705892B";

    [Fact]
    public void Embedded_template_is_the_approved_workbook_verbatim()
    {
        var bytes = BulkUploadWorkbook.GetTemplateBytes();

        Convert.ToHexString(SHA256.HashData(bytes)).Should().Be(ApprovedTemplateSha256);
        using var stream = new MemoryStream(bytes);
        using var workbook = new XLWorkbook(stream);

        workbook.Worksheets.Select(sheet => sheet.Name)
            .Should().Equal("Import Data", "Instructions", "Data");
        workbook.Worksheet("Import Data").Cell(3, BulkUploadColumns.Headers.Length).GetString()
            .Should().Be(BulkUploadColumns.Headers[^1]);
    }

    [Fact]
    public void Parser_rejects_a_renamed_or_reordered_header()
    {
        using var workbook = OpenTemplate();
        workbook.Worksheet("Import Data").Cell(3, 1).Value = "Changed Effective Date";
        using var stream = Save(workbook);

        var act = () => BulkUploadWorkbook.Parse(stream);

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*Invalid column header at A3*Expected 'Effective Date'*");
    }

    [Fact]
    public void Parser_preserves_physical_row_numbers_and_typed_values_across_blank_rows()
    {
        using var workbook = OpenTemplate();
        var sheet = workbook.Worksheet("Import Data");
        sheet.Cell(4, 1).Value = new DateTime(2026, 11, 18);
        sheet.Cell(4, 26).Value = 400000;
        sheet.Cell(6, 1).Value = "11/20/2026";
        using var stream = Save(workbook);

        var rows = BulkUploadWorkbook.Parse(stream);

        rows.Select(row => row.RowNumber).Should().Equal(4, 6);
        rows[0].Values[BulkUploadColumns.EffectiveDate].Should().Be("11/18/2026");
        rows[0].Values[BulkUploadColumns.DwellingAssetLimit].Should().Be("400000");
    }

    [Fact]
    public void Column_contract_matches_every_header_in_the_approved_template()
    {
        using var workbook = OpenTemplate();
        var sheet = workbook.Worksheet("Import Data");

        for (var index = 0; index < BulkUploadColumns.Headers.Length; index++)
        {
            Normalize(sheet.Cell(3, index + 1).GetString())
                .Should().Be(Normalize(BulkUploadColumns.Headers[index]), $"column {BulkUploadColumns.ExcelColumnName(index)} must retain its business mapping");
        }
    }

    private static XLWorkbook OpenTemplate()
        => new(new MemoryStream(BulkUploadWorkbook.GetTemplateBytes()));

    private static MemoryStream Save(XLWorkbook workbook)
    {
        var stream = new MemoryStream();
        workbook.SaveAs(stream);
        stream.Position = 0;
        return stream;
    }

    private static string Normalize(string value)
        => Regex.Replace(value ?? string.Empty, @"\s+", " ").Trim();
}
