using ClosedXML.Excel;
using System.Text.Json;
using FluentAssertions;
using InsureEdge.Application.DTOs.QuotesPolicies;
using InsureEdge.Application.Interfaces;
using InsureEdge.Application.Services;
using InsureEdge.Domain.Entities;
using Moq;
using Xunit;

namespace InsureEdge.UnitTests;

public class BulkUploadServiceValidationTests
{
    [Fact]
    public async Task Invalid_and_duplicate_rows_fail_without_persisting_and_report_physical_rows_and_columns()
    {
        var auditRepository = new Mock<IBulkUploadRepository>();
        auditRepository
            .Setup(repository => repository.CreateAuditAsync(7, 11, BulkUploadService.QuotesPoliciesModule, "upload.xlsx", 3))
            .ReturnsAsync(new BulkUploadAudit { Id = 42, ClientId = 7 });

        byte[]? finalErrorFile = null;
        auditRepository
            .Setup(repository => repository.UpdateAuditAsync(7, 42, It.IsAny<int>(), It.IsAny<string>(), It.IsAny<byte[]?>()))
            .Callback<long, long, int, string, byte[]?>((_, _, _, _, errorFile) =>
            {
                if (errorFile != null) finalErrorFile = errorFile;
            })
            .Returns(Task.CompletedTask);

        var tenant = new Mock<ICurrentTenantService>();
        tenant.SetupGet(service => service.ClientId).Returns(7);
        tenant.SetupGet(service => service.UserId).Returns(11);

        var submissionRepository = new Mock<ISubmissionRepository>();
        var ratingService = new RatingService(Mock.Of<IRatingRepository>());
        var service = new BulkUploadService(auditRepository.Object, submissionRepository.Object, tenant.Object, ratingService);

        var missingRequired = new string?[BulkUploadColumns.Headers.Length];
        var invalidType = new string?[BulkUploadColumns.Headers.Length];
        invalidType[BulkUploadColumns.EffectiveDate] = "11/18/2026";
        invalidType[BulkUploadColumns.TypeOfPrimaryInsured] = "Invalid Insured Type";
        invalidType[BulkUploadColumns.MailAddressLine1] = "1 Main Street";
        invalidType[BulkUploadColumns.MailCity] = "Austin";
        invalidType[BulkUploadColumns.MailState] = "Texas";
        invalidType[BulkUploadColumns.MailZip] = "78701";
        invalidType[BulkUploadColumns.AddressSameAsMailing] = "Yes";

        var result = await service.ProcessAsync("upload.xlsx", new List<BulkUploadRow>
        {
            new(4, missingRequired),
            new(6, (string?[])missingRequired.Clone()),
            new(8, invalidType),
        });

        result.Status.Should().Be("Failed");
        result.SuccessCount.Should().Be(0);
        result.FailureCount.Should().Be(3);
        submissionRepository.Verify(
            repository => repository.CreateAsync(It.IsAny<long>(), It.IsAny<long>(), It.IsAny<CreateSubmissionRequest>()),
            Times.Never);

        finalErrorFile.Should().NotBeNull();
        using var reportStream = new MemoryStream(finalErrorFile!);
        using var report = new XLWorkbook(reportStream);
        var sheet = report.Worksheet("Report");
        sheet.Cell("A1").GetString().Should().Be("Row Number");
        sheet.Cell("B1").GetString().Should().Be("Status");
        sheet.Cell("C1").GetString().Should().Be("Message");
        sheet.Cell("A2").GetValue<int>().Should().Be(1);
        sheet.Cell("B2").GetString().Should().Be("Failed");
        sheet.Cell("C2").GetString().Should().Be("Column A (Effective Date): Effective Date is required.");
        sheet.Cell("C3").GetString().Should().Be("Duplicate record: this row repeats an earlier row in the same workbook.");
        sheet.Cell("C4").GetString().Should().Be("Column B (Type of Primary Insured): 'Invalid Insured Type' is not a valid Type of Primary Insured value.");
    }

    [Fact]
    public async Task Report_uses_business_validation_message_and_preserves_success_quote_number()
    {
        var auditRepository = new Mock<IBulkUploadRepository>();
        auditRepository
            .Setup(repository => repository.CreateAuditAsync(7, 11, BulkUploadService.QuotesPoliciesModule, "upload.xlsx", 2))
            .ReturnsAsync(new BulkUploadAudit { Id = 43, ClientId = 7 });

        byte[]? finalReportFile = null;
        auditRepository
            .Setup(repository => repository.UpdateAuditAsync(7, 43, It.IsAny<int>(), It.IsAny<string>(), It.IsAny<byte[]?>()))
            .Callback<long, long, int, string, byte[]?>((_, _, _, _, reportFile) =>
            {
                if (reportFile != null) finalReportFile = reportFile;
            })
            .Returns(Task.CompletedTask);

        var tenant = new Mock<ICurrentTenantService>();
        tenant.SetupGet(service => service.ClientId).Returns(7);
        tenant.SetupGet(service => service.UserId).Returns(11);
        tenant.SetupGet(service => service.ProducerId).Returns(101);
        tenant.SetupGet(service => service.IntermediaryId).Returns(202);

        var submissionRepository = new Mock<ISubmissionRepository>();
        CreateSubmissionRequest? createdSubmission = null;
        submissionRepository
            .Setup(repository => repository.CreateAsync(7, 11, It.IsAny<CreateSubmissionRequest>()))
            .Callback<long, long, CreateSubmissionRequest>((_, _, request) => createdSubmission = request)
            .ReturnsAsync(new SubmissionDto("00000003844", "Draft", DateTime.UtcNow, "{}"));

        var ratingRepository = new Mock<IRatingRepository>();
        ratingRepository
            .Setup(repository => repository.CalculatePlanComparisonAsync(It.IsAny<HbisPlanComparisonForm>()))
            .ThrowsAsync(new InvalidOperationException("Rating is not required for validation test."));

        var service = new BulkUploadService(
            auditRepository.Object,
            submissionRepository.Object,
            tenant.Object,
            new RatingService(ratingRepository.Object));

        var invalidRow = ValidRow();
        invalidRow[BulkUploadColumns.FirstName] = null;

        var validRow = ValidRow();
        validRow[BulkUploadColumns.Sinkhole] = "Yes";

        var result = await service.ProcessAsync("upload.xlsx", new List<BulkUploadRow>
        {
            new(4, invalidRow),
            new(5, validRow),
        });

        result.Status.Should().Be("CompletedWithErrors");
        result.SuccessCount.Should().Be(1);
        result.FailureCount.Should().Be(1);
        finalReportFile.Should().NotBeNull();
        createdSubmission.Should().NotBeNull();

        using (var submissionJson = JsonDocument.Parse(createdSubmission!.DataJson))
        {
            var form = submissionJson.RootElement.GetProperty("form");
            form.GetProperty("brokerageFirmId").GetInt64().Should().Be(202);
            form.GetProperty("producerId").GetInt64().Should().Be(101);
            form.GetProperty("isHBProducer").GetBoolean().Should().BeTrue();
            form.GetProperty("effectiveDate").GetString().Should().Be("11-18-2026");
            form.GetProperty("expirationDate").GetString().Should().Be("11-18-2027");
            form.GetProperty("policyTerm").GetString().Should().Be("Annual");
        }

        using var reportStream = new MemoryStream(finalReportFile!);
        using var report = new XLWorkbook(reportStream);
        var sheet = report.Worksheet("Report");
        sheet.Cell("A1").GetString().Should().Be("Row Number");
        sheet.Cell("B1").GetString().Should().Be("Status");
        sheet.Cell("C1").GetString().Should().Be("Message");
        sheet.Cell("A2").GetValue<int>().Should().Be(1);
        sheet.Cell("B2").GetString().Should().Be("Failed");
        sheet.Cell("C2").GetString().Should().Be("First Name is either empty or invalid.");
        sheet.Cell("A3").GetValue<int>().Should().Be(2);
        sheet.Cell("B3").GetString().Should().Be("Success");
        sheet.Cell("C3").GetString().Should().Be("00000003844");
        sheet.Cell("C3").DataType.Should().Be(XLDataType.Text);
        sheet.Column(3).Style.Alignment.WrapText.Should().BeTrue();
        sheet.Column(3).Width.Should().BeApproximately(12, 0.1);
        sheet.Row(2).Height.Should().BeGreaterThan(15);
    }

    private static string?[] ValidRow()
    {
        var row = new string?[BulkUploadColumns.Headers.Length];
        row[BulkUploadColumns.EffectiveDate] = "11/18/2026";
        row[BulkUploadColumns.TypeOfPrimaryInsured] = "Individual";
        row[BulkUploadColumns.FirstName] = "Test";
        row[BulkUploadColumns.LastName] = "User";
        row[BulkUploadColumns.MailAddressLine1] = "1 Main Street";
        row[BulkUploadColumns.MailCity] = "Austin";
        row[BulkUploadColumns.MailState] = "Texas";
        row[BulkUploadColumns.MailZip] = "78701";
        row[BulkUploadColumns.AddressSameAsMailing] = "Yes";
        row[BulkUploadColumns.DwellingAssetLimit] = "400000";
        row[BulkUploadColumns.PhysicalDamageDeductible] = "2500";
        row[BulkUploadColumns.LiabilityCoverage] = "100000";
        row[BulkUploadColumns.ExcessBlanketPl] = "No Coverage";
        row[BulkUploadColumns.Sinkhole] = "No";
        row[BulkUploadColumns.Earthquake] = "None";
        row[BulkUploadColumns.Flood] = "None";
        row[BulkUploadColumns.WindHail] = "Included";
        row[BulkUploadColumns.WildFire] = "Included";
        row[BulkUploadColumns.ResidentWorkerNfm] = "No";
        row[BulkUploadColumns.SmallScaleFarmingEndorsement] = "No";
        row[BulkUploadColumns.LandlordEndorsement] = "No";
        row[BulkUploadColumns.HomeOfficeEndorsement] = "No";
        row[BulkUploadColumns.PriorPolicyPremium] = "1000";
        return row;
    }
}
