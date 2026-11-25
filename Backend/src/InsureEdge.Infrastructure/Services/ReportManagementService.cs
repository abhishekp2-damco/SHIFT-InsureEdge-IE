using System.Globalization;
using System.Net.Mail;
using System.Text.Json;
using System.Text.RegularExpressions;
using ClosedXML.Excel;
using InsureEdge.Application.DTOs.ReportManagement;
using InsureEdge.Application.Interfaces;
using InsureEdge.Domain.Entities;
using InsureEdge.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace InsureEdge.Infrastructure.Services;

public sealed class ReportManagementService(
    InsureEdgeDbContext db,
    ICurrentTenantService tenant,
    IServiceProvider services,
    IConfiguration configuration,
    ILogger<ReportManagementService> log) : IReportManagementService
{
    private const string Xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    private static readonly HashSet<string> ImplementedCodes = new(StringComparer.OrdinalIgnoreCase)
        { "CLAIM_REGISTER", "PAID_CLAIMS", "OUTSTANDING_RESERVES", "PAYEE_REGISTER", "RECOVERIES_SUMMARY" };
    private bool SecureProducerScope => configuration.GetValue("ReportManagement:SecureProducerScope", true);
    private bool OwnerOnlyDefinitions => configuration.GetValue("ReportManagement:OwnerOnlyDefinitions", true);
    // SMTP configuration is optional for read/preview workflows; resolve it only when a send is requested.
    private IEmailService Email => services.GetRequiredService<IEmailService>();

    public async Task<ReportCatalogDto> GetCatalogAsync(CancellationToken ct)
    {
        var producer = tenant.ProducerId.HasValue;
        var groups = await db.ReportGroups.AsNoTracking().OrderBy(x => x.SortOrder)
            .Select(g => new ReportGroupDto(g.Id, g.Name, g.SortOrder,
                g.Items.Where(i => i.RoleVisibility == "All" || (producer ? i.RoleVisibility == "Producer" : i.RoleVisibility == "Admin"))
                    .OrderBy(i => i.SortOrder)
                    .Select(i => new ReportItemDto(i.Id, i.Code, i.Label, i.PageTitle, i.ItemType, i.SortOrder,
                        i.Cards.OrderBy(c => c.SortOrder).Select(c => new ReportCardDto(c.Id, c.ReportCode, c.Title, c.Description, c.DefaultReportName, c.IsImplemented, c.SortOrder)).ToList()))
                    .ToList())).ToListAsync(ct);
        return new ReportCatalogDto(groups);
    }

    public async Task<IReadOnlyList<int>> GetYearsAsync(string itemCode, CancellationToken ct)
    {
        var q = ScopeFiles(db.ReportFiles.AsNoTracking().Where(x => x.ClientId == tenant.ClientId && x.Item.Code == itemCode));
        return await q.Select(x => x.ReportingPeriod.Year).Distinct().OrderByDescending(x => x).ToListAsync(ct);
    }

    public async Task<PagedResult<ReportFileDto>> GetFilesAsync(string itemCode, int year, string? search, int page, int pageSize, CancellationToken ct)
    {
        ValidatePaging(page, pageSize);
        var q = ScopeFiles(db.ReportFiles.AsNoTracking().Where(x => x.ClientId == tenant.ClientId && x.Item.Code == itemCode && x.ReportingPeriod.Year == year));
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            q = q.Where(x => x.ReportName.ToLower().Contains(term) || (x.IssuingCarrier != null && x.IssuingCarrier.ToLower().Contains(term)) || x.ReportingPeriod.ToString().Contains(term));
        }
        var total = await q.CountAsync(ct);
        var asc = itemCode == "ALL_BROKERAGE";
        q = asc ? q.OrderBy(x => x.CreatedOn) : q.OrderByDescending(x => x.CreatedOn);
        var rows = await q.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new ReportFileDto(x.Id, x.Item.Code, x.ReportName, x.ReportingPeriod.ToString("MM-yyyy"), x.IssuingCarrier, x.CreatedOn)).ToListAsync(ct);
        return new(rows, total, page, pageSize);
    }

    public async Task<(string FileName, string ContentType, byte[] Content)> GetReportFileAsync(long id, string action, CancellationToken ct)
    {
        var q = ScopeFiles(db.ReportFiles.Include(x => x.StoredFile).Include(x => x.Item).Where(x => x.ClientId == tenant.ClientId && x.Id == id));
        var row = await q.SingleOrDefaultAsync(ct) ?? throw new KeyNotFoundException("Report file not found.");
        var content = row.StoredFile?.Content ?? CreateSystemWorkbook(row);
        await LogActivityAsync(action, "ReportFile", row.Id, row.ReportName, ct);
        return (EnsureXlsx(row.ReportName), Xlsx, content);
    }

    public async Task<PagedResult<GeneratedReportDto>> GetGeneratedAsync(string reportCode, string? search, int page, int pageSize, CancellationToken ct)
    {
        ValidateCode(reportCode); ValidatePaging(page, pageSize);
        var q = db.GeneratedReports.AsNoTracking().Where(x => x.ClientId == tenant.ClientId && x.Card.ReportCode == reportCode);
        q = ScopeGenerated(q);
        if (!string.IsNullOrWhiteSpace(search)) { var term = search.Trim().ToLower(); q = q.Where(x => x.StoredFile.FileName.ToLower().Contains(term)); }
        var total = await q.CountAsync(ct);
        var raw = await q.OrderByDescending(x => x.CreatedOn).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new { x.Id, x.StoredFile.FileName, x.RunBy, x.CreatedOn, x.IsScheduled }).ToListAsync(ct);
        var userIds = raw.Select(x => x.RunBy).Distinct().ToArray();
        var names = await db.Users.AsNoTracking().Where(x => userIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.FirstName + " " + x.LastName, ct);
        return new(raw.Select(x => new GeneratedReportDto(x.Id, x.FileName, names.GetValueOrDefault(x.RunBy, "Scheduler"), x.CreatedOn, x.IsScheduled)).ToList(), total, page, pageSize);
    }

    public async Task<PagedResult<ReportDefinitionDto>> GetDefinitionsAsync(string reportCode, string? search, int page, int pageSize, CancellationToken ct)
    {
        ValidateCode(reportCode); ValidatePaging(page, pageSize);
        var q = db.ReportDefinitions.AsNoTracking().Include(x => x.Card).Include(x => x.Schedule)
            .Where(x => x.ClientId == tenant.ClientId && x.Card.ReportCode == reportCode && x.Status == "Active" && x.Schedule != null);
        q = ScopeDefinitions(q);
        if (!string.IsNullOrWhiteSpace(search)) { var term = search.Trim().ToLower(); q = q.Where(x => x.ReportName.ToLower().Contains(term) || (x.Schedule!.Frequency != null && x.Schedule.Frequency.ToLower().Contains(term))); }
        var total = await q.CountAsync(ct);
        var defs = await q.OrderByDescending(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return new(await MapDefinitionsAsync(defs, ct), total, page, pageSize);
    }

    public async Task<ReportDefinitionDto> GetDefinitionAsync(string reportCode, long id, CancellationToken ct)
    {
        ValidateCode(reportCode);
        var def = await ScopeDefinitions(db.ReportDefinitions.AsNoTracking().Include(x => x.Card).Include(x => x.Schedule)
            .Where(x => x.ClientId == tenant.ClientId && x.Id == id && x.Card.ReportCode == reportCode && x.Status == "Active"))
            .SingleOrDefaultAsync(ct) ?? throw new KeyNotFoundException("Report definition not found.");
        if (def.CreatedBy != tenant.UserId) throw new UnauthorizedAccessException("Only the owner can view recipient and schedule details.");
        return (await MapDefinitionsAsync([def], ct))[0];
    }

    public async Task<ReportFormMetadataDto> GetMetadataAsync(string reportCode, CancellationToken ct)
    {
        ValidateCode(reportCode);
        var card = await db.ReportCards.AsNoTracking().SingleOrDefaultAsync(x => x.ReportCode == reportCode, ct) ?? throw new KeyNotFoundException("Report not found.");
        var fields = MetadataFields(reportCode);
        var users = await db.Users.AsNoTracking().Where(x => x.ClientId == tenant.ClientId && x.IsActive).OrderBy(x => x.FirstName).Select(x => new LookupDto(x.Id.ToString(), x.FirstName + " " + x.LastName)).ToListAsync(ct);
        var payees = new List<LookupDto>();
        if (reportCode is "PAID_CLAIMS" or "PAYEE_REGISTER")
        {
            try
            {
                payees = await db.Payees.AsNoTracking().Where(x => x.ClientId == tenant.ClientId).OrderBy(x => x.BusinessName).ThenBy(x => x.FirstName)
                    .Select(x => new LookupDto(x.Id.ToString(), x.BusinessName ?? ((x.FirstName ?? "") + " " + (x.LastName ?? "")).Trim())).ToListAsync(ct);
            }
            catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UndefinedTable)
            {
                log.LogWarning("Payee lookup is empty because the optional payee table has not been installed.");
            }
        }
        var lookups = SharedLookups();
        lookups["assignedTo"] = users; lookups["wsApprovedBy"] = users; lookups["payeeName"] = payees;
        return new(reportCode, card.DefaultReportName, fields, lookups);
    }

    public async Task<PreviewResultDto> PreviewAsync(string reportCode, SaveReportDefinitionRequest request, CancellationToken ct)
    {
        ValidateRequest(reportCode, request, false);
        var generated = await GenerateAsync(reportCode, request, ct);
        return new(EnsureXlsx(ExpectedName(reportCode)), Convert.ToBase64String(generated.Content), generated.RowCount);
    }

    public async Task<long> CreateAsync(string reportCode, SaveReportDefinitionRequest request, CancellationToken ct)
    {
        ValidateRequest(reportCode, request, true);
        var card = await db.ReportCards.SingleAsync(x => x.ReportCode == reportCode && x.IsImplemented, ct);
        var def = new ReportDefinition
        {
            CardId = card.Id, ClientId = tenant.ClientId, IntermediaryId = tenant.IntermediaryId, ProducerId = tenant.ProducerId,
            ReportName = card.DefaultReportName, DateCriteria = request.IsScheduleReport ? null : request.DateCriteria,
            PeriodFrom = request.IsScheduleReport ? null : request.PeriodFrom, PeriodTo = request.IsScheduleReport ? null : request.PeriodTo,
            FiltersJson = JsonSerializer.Serialize(request.Filters), CreatedBy = tenant.UserId
        };
        db.ReportDefinitions.Add(def);
        if (request.IsScheduleReport) def.Schedule = BuildSchedule(request);
        await db.SaveChangesAsync(ct);
        if (!request.IsScheduleReport) await PersistGenerationAsync(def, reportCode, request, false, ct);
        return def.Id;
    }

    public async Task UpdateAsync(string reportCode, long id, SaveReportDefinitionRequest request, CancellationToken ct)
    {
        ValidateRequest(reportCode, request, true);
        var def = await db.ReportDefinitions.Include(x => x.Card).Include(x => x.Schedule)
            .SingleOrDefaultAsync(x => x.Id == id && x.ClientId == tenant.ClientId && x.Card.ReportCode == reportCode && x.Status == "Active", ct)
            ?? throw new KeyNotFoundException("Report definition not found.");
        if (def.CreatedBy != tenant.UserId) throw new UnauthorizedAccessException("Only the owner can edit this report schedule.");
        def.FiltersJson = JsonSerializer.Serialize(request.Filters); def.DateCriteria = null; def.PeriodFrom = null; def.PeriodTo = null;
        def.UpdatedBy = tenant.UserId; def.UpdatedOn = DateTime.UtcNow;
        if (def.Schedule is null) throw new InvalidOperationException("Only scheduled definitions can be edited.");
        ApplySchedule(def.Schedule, request);
        await db.SaveChangesAsync(ct);
    }

    public async Task DeleteAsync(string reportCode, long id, CancellationToken ct)
    {
        var def = await db.ReportDefinitions.Include(x => x.Card).Include(x => x.Schedule)
            .SingleOrDefaultAsync(x => x.Id == id && x.ClientId == tenant.ClientId && x.Card.ReportCode == reportCode && x.Status == "Active", ct)
            ?? throw new KeyNotFoundException("Report definition not found.");
        if (def.CreatedBy != tenant.UserId) throw new UnauthorizedAccessException("Only the owner can delete this report schedule.");
        def.Status = "Deleted"; def.UpdatedBy = tenant.UserId; def.UpdatedOn = DateTime.UtcNow;
        if (def.Schedule != null) def.Schedule.Status = "Deleted";
        await db.SaveChangesAsync(ct);
    }

    public async Task<(string FileName, string ContentType, byte[] Content)> GetGeneratedFileAsync(long id, string action, CancellationToken ct)
    {
        var row = await ScopeGenerated(db.GeneratedReports.Include(x => x.StoredFile).Where(x => x.ClientId == tenant.ClientId && x.Id == id))
            .SingleOrDefaultAsync(ct) ?? throw new KeyNotFoundException("Generated report not found.");
        await LogActivityAsync(action, "GeneratedReport", row.Id, row.StoredFile.FileName, ct);
        return (row.StoredFile.FileName, row.StoredFile.MimeType, row.StoredFile.Content ?? []);
    }

    public async Task SendEmailAsync(SendReportEmailRequest request, CancellationToken ct)
    {
        ValidateEmailRequest(request);
        var attachments = new List<EmailAttachment>();
        if (request.ReportFileId.HasValue)
        {
            var f = await GetReportFileAsync(request.ReportFileId.Value, "Share", ct);
            attachments.Add(new(f.FileName, f.ContentType, f.Content));
        }
        if (request.GeneratedReportId.HasValue)
        {
            var f = await GetGeneratedFileAsync(request.GeneratedReportId.Value, "Share", ct);
            attachments.Add(new(f.FileName, f.ContentType, f.Content));
        }
        foreach (var upload in request.Uploads ?? [])
        {
            var bytes = Convert.FromBase64String(upload.ContentBase64);
            if (bytes.Length < 10 * 1024 || bytes.Length > 10 * 1024 * 1024) throw new ArgumentException("File size must be between 10 KB and 10 MB");
            if (!AllowedExtension(upload.FileName)) throw new ArgumentException("Unsupported file format");
            attachments.Add(new(upload.FileName, upload.ContentType, bytes));
        }
        var body = Regex.Replace(request.Body, "<script.*?</script>", "", RegexOptions.IgnoreCase | RegexOptions.Singleline);
        await Email.SendQueryAsync(request.From, request.To, request.Cc, request.Bcc, request.Subject, Regex.Replace(body, "<[^>]+>", " "), attachments);
    }

    public async Task ShareGeneratedAsync(long id, ShareGeneratedRequest request, CancellationToken ct)
    {
        if (request.UserIds.Count == 0) throw new ArgumentException("Select at least one user.");
        var file = await GetGeneratedFileAsync(id, "Share", ct);
        var current = await db.Users.AsNoTracking().SingleAsync(x => x.Id == tenant.UserId && x.ClientId == tenant.ClientId, ct);
        var users = await db.Users.AsNoTracking().Where(x => x.ClientId == tenant.ClientId && request.UserIds.Contains(x.Id) && x.IsActive).ToListAsync(ct);
        if (users.Count != request.UserIds.Distinct().Count()) throw new ArgumentException("One or more selected users are invalid.");
        await Email.SendQueryAsync(current.Email, users.Select(x => x.Email), [], [], $"Shared report: {file.FileName}", "A report has been shared with you.", [new(file.FileName, file.ContentType, file.Content)]);
    }

    public async Task<IReadOnlyList<UserLookupDto>> GetUsersAsync(CancellationToken ct) =>
        await db.Users.AsNoTracking().Where(x => x.ClientId == tenant.ClientId && x.IsActive).OrderBy(x => x.FirstName)
            .Select(x => new UserLookupDto(x.Id, x.FirstName + " " + x.LastName, x.Email)).ToListAsync(ct);

    public async Task<IReadOnlyList<RecentActivityDto>> GetRecentActivityAsync(CancellationToken ct) =>
        await db.ReportRecentActivities.AsNoTracking().Where(x => x.ClientId == tenant.ClientId && x.UserId == tenant.UserId)
            .OrderByDescending(x => x.OccurredOn).Take(10).Select(x => new RecentActivityDto(x.Id, x.Action, x.TargetType, x.TargetName, x.OccurredOn)).ToListAsync(ct);

    public async Task RunDueSchedulesAsync(CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var schedules = await db.ReportSchedules.Include(x => x.Definition).ThenInclude(x => x.Card)
            .Where(x => x.Status == "Active" && x.NextRunDate <= today && x.Definition.Status == "Active").ToListAsync(ct);
        foreach (var schedule in schedules)
        {
            var run = new ReportRunLog { DefinitionId = schedule.DefinitionId, StartedOn = DateTime.UtcNow };
            db.ReportRunLogs.Add(run); await db.SaveChangesAsync(ct);
            try
            {
                var request = ToRequest(schedule.Definition, schedule);
                var generated = await PersistGenerationAsync(schedule.Definition, schedule.Definition.Card.ReportCode, request, true, ct);
                run.GeneratedReportId = generated.Id; run.Status = "Succeeded"; run.EndedOn = DateTime.UtcNow;
                schedule.LastRunOn = DateTime.UtcNow;
                AdvanceSchedule(schedule, today);
                var owner = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == schedule.Definition.CreatedBy, ct);
                if (owner != null)
                {
                    var recipients = SplitEmails(schedule.Recipients);
                    await Email.SendQueryAsync(owner.Email, recipients, [], [], schedule.Definition.ReportName, "Your scheduled report is attached.",
                        [new(generated.StoredFile.FileName, Xlsx, generated.StoredFile.Content ?? [])]);
                }
            }
            catch (Exception ex)
            {
                run.Status = "Failed"; run.Error = ex.Message; run.EndedOn = DateTime.UtcNow;
                log.LogError(ex, "Report schedule {ScheduleId} failed", schedule.Id);
            }
            await db.SaveChangesAsync(ct);
        }
    }

    private IQueryable<ReportFile> ScopeFiles(IQueryable<ReportFile> q)
    {
        if (!tenant.ProducerId.HasValue) return q.Where(x => x.Item.RoleVisibility != "Producer");
        return q.Where(x => x.Item.Code == "MGA_TO_ISSUER" ||
            (x.Item.Code == "MY_COMMISSIONS" && x.IntermediaryId == tenant.IntermediaryId) ||
            (x.Item.Group.Name == "Policy" && (x.ProducerId == tenant.ProducerId || x.IntermediaryId == tenant.IntermediaryId)));
    }

    private IQueryable<GeneratedReport> ScopeGenerated(IQueryable<GeneratedReport> q) =>
        SecureProducerScope && tenant.ProducerId.HasValue ? q.Where(x => x.ProducerId == tenant.ProducerId || x.IntermediaryId == tenant.IntermediaryId) : q;

    private IQueryable<ReportDefinition> ScopeDefinitions(IQueryable<ReportDefinition> q) =>
        OwnerOnlyDefinitions && tenant.ProducerId.HasValue ? q.Where(x => x.CreatedBy == tenant.UserId) : q;

    private async Task<IReadOnlyList<ReportDefinitionDto>> MapDefinitionsAsync(IReadOnlyList<ReportDefinition> defs, CancellationToken ct)
    {
        var ids = defs.Select(x => x.CreatedBy).Distinct().ToArray();
        var names = await db.Users.AsNoTracking().Where(x => ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.FirstName + " " + x.LastName, ct);
        return defs.Select(x => new ReportDefinitionDto(x.Id, x.Card.ReportCode, x.ReportName, names.GetValueOrDefault(x.CreatedBy, "Unknown"), x.DateCriteria,
            x.PeriodFrom, x.PeriodTo, ReportJson.Read(x.FiltersJson), x.Schedule?.ScheduleType, x.Schedule?.Frequency, x.Schedule?.ScheduledDate,
            x.Schedule?.StartDate, x.Schedule?.EndDate, x.Schedule?.DeliveryMethod, x.CreatedBy == tenant.UserId ? x.Schedule?.Recipients : null,
            x.CreatedBy == tenant.UserId, x.CreatedBy == tenant.UserId)).ToList();
    }

    private async Task<GeneratedReport> PersistGenerationAsync(ReportDefinition def, string reportCode, SaveReportDefinitionRequest request, bool scheduled, CancellationToken ct)
    {
        var output = await GenerateAsync(reportCode, request, ct);
        var file = new StoredReportFile { FileName = EnsureXlsx(ExpectedName(reportCode)), Content = output.Content, SizeBytes = output.Content.LongLength };
        var row = new GeneratedReport { Definition = def, CardId = def.CardId, ClientId = def.ClientId, IntermediaryId = def.IntermediaryId,
            ProducerId = def.ProducerId, RunBy = scheduled ? def.CreatedBy : tenant.UserId, IsScheduled = scheduled, StoredFile = file, RowCount = output.RowCount };
        db.GeneratedReports.Add(row); await db.SaveChangesAsync(ct); return row;
    }

    private async Task<(byte[] Content, int RowCount)> GenerateAsync(string code, SaveReportDefinitionRequest request, CancellationToken ct)
    {
        var claims = db.Claims.AsNoTracking().Include(x => x.Policy).Include(x => x.AssignedToUser).Where(x => x.ClientId == tenant.ClientId);
        if (SecureProducerScope && tenant.ProducerId.HasValue)
            claims = claims.Where(x => x.Policy!.ProducerId == tenant.ProducerId || x.Policy.IntermediaryId == tenant.IntermediaryId);
        claims = ApplyClaimFilters(claims, request);
        var list = await claims.OrderByDescending(x => x.CreatedOn).Take(10000).ToListAsync(ct);
        var claimIds = list.Select(x => x.Id).ToArray();
        var worksheets = new List<ClaimWorksheet>();
        var payees = new List<Payee>();
        try
        {
            worksheets = await db.Worksheets.AsNoTracking().Include(x => x.Payments).Include(x => x.Reserves).Include(x => x.ApprovedByUser)
                .Where(x => x.ClientId == tenant.ClientId && claimIds.Contains(x.ClaimId)).ToListAsync(ct);
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UndefinedTable)
        {
            log.LogWarning("Worksheet financials are omitted because the optional worksheet tables have not been installed.");
        }
        if (code is "PAID_CLAIMS" or "PAYEE_REGISTER")
        {
            try
            {
                payees = await db.Payees.AsNoTracking().Include(x => x.BankDetails).Where(x => x.ClientId == tenant.ClientId && x.ClaimId != null && claimIds.Contains(x.ClaimId.Value)).ToListAsync(ct);
            }
            catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UndefinedTable)
            {
                log.LogWarning("Payee rows are omitted because the optional payee tables have not been installed.");
            }
        }

        var rows = code switch
        {
            "CLAIM_REGISTER" => ClaimRegisterRows(list, worksheets),
            "PAID_CLAIMS" => PaidRows(list, worksheets, payees),
            "OUTSTANDING_RESERVES" => OutstandingRows(list, worksheets, request),
            "PAYEE_REGISTER" => PayeeRows(list, worksheets, payees),
            "RECOVERIES_SUMMARY" => RecoveryRows(list, worksheets),
            _ => throw new ArgumentException("Report type not supported")
        };
        return (ToWorkbook(rows.Columns, rows.Rows), rows.Rows.Count);
    }

    private IQueryable<Claim> ApplyClaimFilters(IQueryable<Claim> q, SaveReportDefinitionRequest r)
    {
        if (!string.IsNullOrWhiteSpace(r.DateCriteria) && r.PeriodFrom.HasValue && r.PeriodTo.HasValue)
        {
            q = r.DateCriteria switch
            {
                "Date of Loss" => q.Where(x => x.DateOfLoss >= r.PeriodFrom && x.DateOfLoss <= r.PeriodTo),
                "Claim Closure Date" => q.Where(x => x.ClaimClosureDate >= r.PeriodFrom && x.ClaimClosureDate <= r.PeriodTo),
                _ => q.Where(x => DateOnly.FromDateTime(x.CreatedOn) >= r.PeriodFrom && DateOnly.FromDateTime(x.CreatedOn) <= r.PeriodTo)
            };
        }
        if (Values(r, "lineOfBusiness") is { Length: > 0 } lob) q = q.Where(x => x.Policy != null && x.Policy.Lob != null && lob.Contains(x.Policy.Lob));
        if (Values(r, "claimStatus") is { Length: > 0 } status) q = q.Where(x => status.Contains(x.Status));
        if (Values(r, "claimType") is { Length: > 0 } type) q = q.Where(x => x.ClaimType != null && type.Contains(x.ClaimType));
        if (Values(r, "channel") is { Length: > 0 } channel) q = q.Where(x => x.ClaimInitiationChannel != null && channel.Contains(x.ClaimInitiationChannel));
        if (Values(r, "assignedTo") is { Length: > 0 } assigned) { var ids = assigned.Select(long.Parse).ToArray(); q = q.Where(x => x.AssignedTo != null && ids.Contains(x.AssignedTo.Value)); }
        return q;
    }

    private static (string[] Columns, List<object?[]> Rows) ClaimRegisterRows(List<Claim> claims, List<ClaimWorksheet> ws)
    {
        var cols = Split("ClaimNumber|InsuredName|AdditionalInsuredList|AdditionalOrganizationList|PolicyNumber|PolicyEffectiveDate|PolicyExpiryDate|TimeOfLoss|ClaimantList|ClaimType|LineofBusiness|Currency|InitialReserve|CurrentReserve|PaidAmountIndemnity|PaidAmountFees|TotalIncurred|Carrier Name|ClaimStatus|ClaimRembursementType|CatastrophicEvent|CoverageLevel|CauseOfLoss|OtherCoverage|OtherCauseOfLoss|Assets|IncidentSeverity|LossLocation|LossDescription|WrittingCompany|ClaimInitiationChannel|AdjusterType|FraudIndicator|Adjuster|DateOfLoss|ClaimCreatedDate|ReportedBy|RelationshipWithInsured|NoOfDays|Limit|ClaimClosureDate|Subproduct");
        var rows = claims.Select(c => { var w = ws.Where(x => x.ClaimId == c.Id).ToList(); var reserves = w.SelectMany(x => x.Reserves).Sum(x => x.ReserveAmount); var paid = w.SelectMany(x => x.Payments).Sum(x => x.PaymentAmount); return new object?[]
        { c.ClaimNumber, c.Policy?.InsuredName, "", "", c.Policy?.PolicyNumber, c.Policy?.EffectiveDate, c.Policy?.ExpiryDate, c.TimeOfLoss?.ToString("HH:mm"), "", c.ClaimType, c.Policy?.Lob, "USD", reserves, reserves, paid, 0m, reserves + paid, "Sierra Specialty Insurance Company", c.Status, c.ClaimReimbursementType, c.CatastrophicEvent, "", c.MainCauseOfLoss, "", c.ConsequencesOfLoss, c.ListOfDamageFirstParty, "", string.Join(", ", new[]{c.LossAddressLine1,c.LossCity,c.LossState,c.LossZipCode}.Where(x=>!string.IsNullOrWhiteSpace(x))), c.LossDescription, c.Policy?.WritingCompany, c.ClaimInitiationChannel, "", "", c.AssignedToUser?.FullName, c.DateOfLoss, DateOnly.FromDateTime(c.CreatedOn), c.ReporterFirstName + " " + c.ReporterLastName, c.ReporterRelationship, ((c.ClaimClosureDate ?? DateOnly.FromDateTime(DateTime.UtcNow)).DayNumber - DateOnly.FromDateTime(c.CreatedOn).DayNumber), reserves, c.ClaimClosureDate, c.Policy?.SubProduct }; }).ToList();
        return (cols, rows);
    }

    private static (string[] Columns, List<object?[]> Rows) PaidRows(List<Claim> claims, List<ClaimWorksheet> ws, List<Payee> payees)
    {
        var cols = Split("ClaimNumber|InsuredName|AdditionalInsuredList|AdditionalOrganizationList|PolicyNumber|ClaimType|LineofBusiness|Currency|Carrier Name|ClaimStatus|Worksheet|BookingDate|ApprovedOn|PaymentType|PayeeName|PaymentMethod|PayeeType|PaidAmountIndemnity|PaidAmountFees|Deductible|NetPaidAmount|CoverageLevel|MortgageName|LoanNumber|MortgageeServiceCompany|MortgageClientID|LenderType|Loantype|ClaimCreatedDate|ClaimClosureDate|WSApprovedBy|Limit|Address|Email");
        var rows = new List<object?[]>(); foreach (var c in claims) foreach (var w in ws.Where(x => x.ClaimId == c.Id)) foreach (var p in w.Payments)
        { var payee = payees.FirstOrDefault(x => x.ClaimId == c.Id && (x.BusinessName == p.PayeeName || x.FullName() == p.PayeeName)); rows.Add([c.ClaimNumber,c.Policy?.InsuredName,"","",c.Policy?.PolicyNumber,c.ClaimType,c.Policy?.Lob,"USD","Sierra Specialty Insurance Company",c.Status,w.WsNumber,w.CreatedOn.Date,w.ApprovedOn(),"Indemnity",p.PayeeName,payee?.BankDetails.FirstOrDefault()?.PaymentMethod,p.PayeeType,p.PaymentAmount,0m,0m,p.PaymentAmount,p.Coverage,"","","","","","",DateOnly.FromDateTime(c.CreatedOn),c.ClaimClosureDate,w.ApprovedByUser?.FullName,w.Reserves.Sum(x=>x.ReserveAmount),c.Policy?.Address,payee?.Email]); }
        return (cols, rows);
    }

    private static (string[] Columns, List<object?[]> Rows) OutstandingRows(List<Claim> claims, List<ClaimWorksheet> ws, SaveReportDefinitionRequest request)
    {
        var cols = Split("ClaimID|InsuredName|AdditionalInsuredList|AdditionalOrganizationList|Policy ID|Line of Business|Claim Status|Coverage Level|Currency|InitialReserve|CurrentReserve|PaidAmountIndemnity|PaidAmountFees|TotalIncurred|Carrier Name|DateOfLoss|ClaimCreatedDate|ClaimClosureDate|NoOfDays");
        decimal? from = DecimalFilter(request,"outstandingFrom"), to = DecimalFilter(request,"outstandingTo"); var rows = new List<object?[]>();
        foreach(var c in claims){var w=ws.Where(x=>x.ClaimId==c.Id).ToList();var reserve=w.SelectMany(x=>x.Reserves).Sum(x=>x.ReserveAmount);if(from.HasValue&&reserve<from||to.HasValue&&reserve>to)continue;var paid=w.SelectMany(x=>x.Payments).Sum(x=>x.PaymentAmount);rows.Add([c.ClaimNumber,c.Policy?.InsuredName,"","",c.Policy?.PolicyNumber,c.Policy?.Lob,c.Status,"","USD",reserve,reserve,paid,0m,reserve+paid,"Sierra Specialty Insurance Company",c.DateOfLoss,DateOnly.FromDateTime(c.CreatedOn),c.ClaimClosureDate,(c.ClaimClosureDate??DateOnly.FromDateTime(DateTime.UtcNow)).DayNumber-DateOnly.FromDateTime(c.CreatedOn).DayNumber]);}
        return(cols,rows);
    }

    private static (string[] Columns, List<object?[]> Rows) PayeeRows(List<Claim> claims, List<ClaimWorksheet> ws, List<Payee> payees)
    {
        var cols=Split("ClaimID|WorksheetId|PayeeType|PayeeName|InsuredName|AdditionalInsuredList|AdditionalOrganizationList|Line of Business|Claim Status|Policy ID|WSApprovalBY|PaymentDate|PaymentType|PaymentMethod|PaymentREferenceNumber|Currency|PaidAmount|PaymentStatus|TelephoneNumber|EMailID|BankName|AccountNumberMasked|RoutingNumber|KYCStatus|BankValidationStatus|PayeeStatus|Carrier Name|DateOfLoss|ClaimCreatedDate|ClaimClosureDate");var rows=new List<object?[]>();
        foreach(var p in payees){var c=claims.FirstOrDefault(x=>x.Id==p.ClaimId);if(c==null)continue;var w=ws.FirstOrDefault(x=>x.ClaimId==c.Id);var payment=w?.Payments.FirstOrDefault(x=>x.PayeeName==p.BusinessName||x.PayeeName==p.FullName());var bank=p.BankDetails.FirstOrDefault();rows.Add([c.ClaimNumber,w?.WsNumber,p.PayeeType,p.BusinessName??p.FullName(),c.Policy?.InsuredName,"","",c.Policy?.Lob,c.Status,c.Policy?.PolicyNumber,w?.ApprovedByUser?.FullName,payment==null?null:w?.CreatedOn.Date,"Indemnity",bank?.PaymentMethod,"","USD",payment?.PaymentAmount,p.Status,p.TelephoneNumber,p.Email,bank?.BankName,Mask(bank?.AccountNumber),bank?.AbaRoutingNumber,p.OFACChecks,p.BankDetailsValidation,p.Status,"Sierra Specialty Insurance Company",c.DateOfLoss,DateOnly.FromDateTime(c.CreatedOn),c.ClaimClosureDate]);}
        return(cols,rows);
    }

    private static (string[] Columns, List<object?[]> Rows) RecoveryRows(List<Claim> claims,List<ClaimWorksheet> ws)
    { var cols=Split("ClaimNumber|PolicyNumber|InsuredName|LOB|RecoveryType|RecoveryDate|RecoveredAmount|PaidAmount|NetLoss|Carrier Name");var rows=claims.Select(c=>{var paid=ws.Where(x=>x.ClaimId==c.Id).SelectMany(x=>x.Payments).Sum(x=>x.PaymentAmount);return new object?[]{c.ClaimNumber,c.Policy?.PolicyNumber,c.Policy?.InsuredName,c.Policy?.Lob,"",null,0m,paid,paid,"Sierra Specialty Insurance Company"};}).ToList();return(cols,rows); }

    private static byte[] ToWorkbook(string[] columns, List<object?[]> rows)
    { using var wb=new XLWorkbook();var sheet=wb.Worksheets.Add("Sheet1");for(var i=0;i<columns.Length;i++)sheet.Cell(1,i+1).Value=columns[i];sheet.Row(1).Style.Font.Bold=true;sheet.Row(1).Style.Fill.BackgroundColor=XLColor.FromHtml("#D9EEF8");for(var r=0;r<rows.Count;r++)for(var c=0;c<columns.Length;c++){var value=c<rows[r].Length?rows[r][c]:null;if(value!=null)sheet.Cell(r+2,c+1).Value=XLCellValue.FromObject(value);}sheet.SheetView.FreezeRows(1);sheet.Columns().AdjustToContents(8,40);using var ms=new MemoryStream();wb.SaveAs(ms);return ms.ToArray(); }

    private static byte[] CreateSystemWorkbook(ReportFile row) => ToWorkbook(["Report Name","Reporting Period","Issuing Carrier","Creation Date"], [[row.ReportName,row.ReportingPeriod,row.IssuingCarrier,row.CreatedOn]]);
    private async Task LogActivityAsync(string action,string type,long id,string name,CancellationToken ct){db.ReportRecentActivities.Add(new(){ClientId=tenant.ClientId,UserId=tenant.UserId,Action=action,TargetType=type,TargetId=id,TargetName=name});await db.SaveChangesAsync(ct);}

    private static ReportSchedule BuildSchedule(SaveReportDefinitionRequest r){var s=new ReportSchedule();ApplySchedule(s,r);return s;}
    private static void ApplySchedule(ReportSchedule s,SaveReportDefinitionRequest r){s.ScheduleType=r.ScheduleType!;s.Frequency=r.ScheduleType=="Recurring"?r.Frequency:null;s.ScheduledDate=r.ScheduledDate!.Value;s.StartDate=r.ScheduleType=="Recurring"?r.StartDate:null;s.EndDate=r.ScheduleType=="Recurring"?r.EndDate:null;s.DeliveryMethod="Email";s.Recipients=r.Recipients!.Trim();s.NextRunDate=r.ScheduleType=="Recurring"?r.StartDate!.Value:r.ScheduledDate.Value;s.Status="Active";}
    private static SaveReportDefinitionRequest ToRequest(ReportDefinition d,ReportSchedule s)=>new(){ReportName=d.ReportName,Filters=ReportJson.Read(d.FiltersJson),IsScheduleReport=true,ScheduleType=s.ScheduleType,Frequency=s.Frequency,ScheduledDate=s.ScheduledDate,StartDate=s.StartDate,EndDate=s.EndDate,DeliveryMethod=s.DeliveryMethod,Recipients=s.Recipients};
    private static void AdvanceSchedule(ReportSchedule s,DateOnly today){if(s.ScheduleType=="One-time"){s.Status="Completed";s.Definition.Status="Completed";return;}var next=s.Frequency=="Daily"?today.AddDays(1):s.NextRunDate.AddMonths(1);if(s.EndDate.HasValue&&next>s.EndDate){s.Status="Completed";s.Definition.Status="Completed";}else s.NextRunDate=next;}

    private static void ValidateRequest(string code,SaveReportDefinitionRequest r,bool submit){ValidateCode(code);if(!string.IsNullOrWhiteSpace(r.DateCriteria)&&(!r.PeriodFrom.HasValue||!r.PeriodTo.HasValue))throw new ArgumentException("Period From and Period To are required when Date criteria is selected");if(r.PeriodFrom>r.PeriodTo)throw new ArgumentException("Period From must be less than or equal to Period To");var from=DecimalFilter(r,"outstandingFrom");var to=DecimalFilter(r,"outstandingTo");if(from>to)throw new ArgumentException("From amount must be less than or equal to To amount");if(!submit||!r.IsScheduleReport)return;if(string.IsNullOrWhiteSpace(r.ScheduleType)||r.ScheduleType is not ("One-time" or "Recurring"))throw new ArgumentException("Provide Schedule Type to continue");if(!r.ScheduledDate.HasValue)throw new ArgumentException("Provide Date to continue");if(r.ScheduledDate<DateOnly.FromDateTime(DateTime.UtcNow))throw new ArgumentException("Date must be today or later");if(r.ScheduleType=="Recurring"){if(r.Frequency is not ("Daily" or "Monthly"))throw new ArgumentException("Provide Frequency to continue");if(!r.StartDate.HasValue)throw new ArgumentException("Provide Start Date to continue");if(!r.EndDate.HasValue)throw new ArgumentException("Provide End Date to continue");if(r.StartDate>r.EndDate)throw new ArgumentException("End Date must be after Start Date");}if(r.DeliveryMethod!="Email")throw new ArgumentException("Provide Delivery Method to continue");if(SplitEmails(r.Recipients).Count==0)throw new ArgumentException("Provide Recipients Email ID to continue");}
    private static void ValidateEmailRequest(SendReportEmailRequest r){if(r.To.Count==0||string.IsNullOrWhiteSpace(r.Subject)||string.IsNullOrWhiteSpace(r.Body))throw new ArgumentException("This field is required.");try{foreach(var a in r.To.Concat(r.Cc).Concat(r.Bcc))_ = new MailAddress(a);}catch{throw new ArgumentException("Provide valid Email ID to continue");}}
    private static IReadOnlyList<string> SplitEmails(string? raw){if(string.IsNullOrWhiteSpace(raw))return[];var list=raw.Split([',',';'],StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries);try{foreach(var x in list)_=new MailAddress(x);}catch{throw new ArgumentException("Provide Recipients Email ID to continue");}return list;}
    private static bool AllowedExtension(string f)=>new[]{".xlsx",".xls",".jpeg",".jpg",".png",".pdf",".doc",".docx",".pages"}.Contains(Path.GetExtension(f).ToLowerInvariant());
    private static void ValidateCode(string code){if(!ImplementedCodes.Contains(code))throw new ArgumentException("Report type not supported");}
    private static void ValidatePaging(int page,int size){if(page<1||size is not(10 or 25 or 50))throw new ArgumentException("Invalid paging values.");}
    private static string ExpectedName(string code)=>code switch{"CLAIM_REGISTER"=>"Claim Register Report","PAID_CLAIMS"=>"Paid Claim Summary","OUTSTANDING_RESERVES"=>"Outstanding Reserve Report","PAYEE_REGISTER"=>"Claim Payee Register","RECOVERIES_SUMMARY"=>"Recoveries Summary",_=>"Report"};
    private static string EnsureXlsx(string n)=>n.EndsWith(".xlsx",StringComparison.OrdinalIgnoreCase)?n:n+".xlsx";
    private static string[] Split(string s)=>s.Split('|');
    private static string[] Values(SaveReportDefinitionRequest r,string key)=>r.Filters.TryGetValue(key,out var v)?v:[];
    private static decimal? DecimalFilter(SaveReportDefinitionRequest r,string key)=>Values(r,key).FirstOrDefault() is {Length:>0} v&&decimal.TryParse(v,NumberStyles.Number,CultureInfo.InvariantCulture,out var d)?d:null;
    private static string Mask(string? value)=>string.IsNullOrWhiteSpace(value)?"":new string('*',Math.Max(0,value.Length-4))+value[^Math.Min(4,value.Length)..];

    private static IReadOnlyList<ReportFieldDto> MetadataFields(string code)
    {
        var common=new List<ReportFieldDto>{new("dateCriteria","Date criteria","select"),new("periodFrom","Period From","date"),new("periodTo","Period To","date"),new("lineOfBusiness","Line of Business","multi"),new("claimStatus","Claim Status","multi"),new("carrierName","Carrier Name","multi")};
        if(code=="CLAIM_REGISTER")common.AddRange([new("productType","Product Type","multi"),new("assignedTo","Assigned To","multi"),new("assignedToGroup","Assigned to Group","multi"),new("channel","Channel","multi"),new("claimType","ClaimType","multi"),new("causeOfLoss","Cause of Loss","multi"),new("claimFlagIndicator","Claim Flag Indicator","multi")]);
        if(code is "PAID_CLAIMS" or "PAYEE_REGISTER")common.AddRange([new("wsApprovedBy","WS Approved By","multi"),new("paymentType","Payment Type","multi"),new("paymentMethod","Payment Method","multi"),new("payeeType","Payee Type","multi"),new("payeeName","Payee Name","multi"),new("paymentStatus","Payment Status","multi")]);
        if(code=="PAYEE_REGISTER")common.Add(new("payeeStatus","Payee Status","multi"));
        if(code=="OUTSTANDING_RESERVES")common.AddRange([new("outstandingFrom","Outstanding Amount From","number"),new("outstandingTo","Outstanding Amount To","number")]);
        if(code=="RECOVERIES_SUMMARY")common.AddRange([new("recoveryType","Recovery Type","multi"),new("recoveryStatus","Recovery Status","multi")]);
        return common;
    }

    private static Dictionary<string,IReadOnlyList<LookupDto>> SharedLookups()=>new(StringComparer.OrdinalIgnoreCase)
    {
        ["dateCriteria"]=[new("Date of Loss","Date of Loss"),new("Claim Created Date","Claim Created Date"),new("Claim Closure Date","Claim Closure Date")],
        ["lineOfBusiness"]=Lookup("Auto","Dwelling Fire","Homeowners","Inland Marine","Umbrella","E&S Homeowners"),
        ["claimStatus"]=Lookup("Open - Unassigned","Open","Open - Escalation","Open - Claim Disputed","Open - Under query","Open - Send Back","Claim Closed"),
        ["carrierName"]=Lookup("Sierra Specialty Insurance Company"), ["channel"]=Lookup("PHONE","EMAIL","MOBILEAPP"),
        ["claimType"]=Lookup("HO_Dwelling damage","HO-Other structure damage","HO-Content damage","HO-Loss of use","HO-Third party damage","HO-Personal Liability","HO-Medical expense","HO-Theft claim","HO-Liability for pets","HO-Water damage","HO-Fire damage","HO-Windstorm","HO-Lightning strike","HO-Vandalism","HO-Falling objects","HO-Wildfire","HO-Hurricane","HO-Tornado","HO-Weight of Ice/Snow","HO-Explosion","HO - Physical Damage"),
        ["paymentType"]=Lookup("Expense","Indemnity"),["paymentMethod"]=Lookup("CHECK","EFT/ACH","WIRETRANSFER"),
        ["payeeType"]=Lookup("Insured","Beneficiary","Adjuster - External","Third-Party Claimant","Employer","Service Provider","Contractor","Vendor","Attorney or law firm","Lienholder","Court","Government Authority","Co-Insurer","Reinsurer"),
        ["payeeStatus"]=Lookup("PENDINGFORAPPROVAL","INACTIVE","SUSPENDED","BLOCKED","ARCHIVED","APPROVED","REJECTED"),
        ["recoveryType"]=Lookup("Salvage","Subrogation")
    };
    private static IReadOnlyList<LookupDto> Lookup(params string[] v)=>v.Select(x=>new LookupDto(x,x)).ToList();
}

file static class ReportEntityExtensions
{
    public static string FullName(this Payee p)=>string.Join(" ",new[]{p.FirstName,p.MiddleName,p.LastName}.Where(x=>!string.IsNullOrWhiteSpace(x)));
    public static DateTimeOffset? ApprovedOn(this ClaimWorksheet w)=>w.UpdatedOn;
}
