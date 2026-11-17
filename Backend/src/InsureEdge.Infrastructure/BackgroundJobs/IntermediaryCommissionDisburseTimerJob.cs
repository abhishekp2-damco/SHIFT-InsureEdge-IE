// Ported from OutSystems IntermediaryCommissionDisburseCloud: monthly batch that pays out
// each ACTIVE intermediary's due commissions via DisburseCloud's CreateDisbursement API.
// It processes all clients and stores vendor references before sending to prevent duplicates.
using Dapper;
using InsureEdge.Application.Interfaces;
using InsureEdge.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;
using System.Data.Common;

namespace InsureEdge.Infrastructure.BackgroundJobs;

public interface IIntermediaryCommissionDisburseTimerJob
{
    Task SynchronizeStatusesAsync(CancellationToken cancellationToken = default);
    Task ExecuteAsync(DateOnly commissionPeriod, CancellationToken cancellationToken = default);
}

public class IntermediaryCommissionDisburseTimerJob : IIntermediaryCommissionDisburseTimerJob
{
    private readonly InsureEdgeDbContext _db;
    private readonly IDisburseCloudClient _disburseCloud;
    private readonly ILogger<IntermediaryCommissionDisburseTimerJob> _log;

    public IntermediaryCommissionDisburseTimerJob(
        InsureEdgeDbContext db, IDisburseCloudClient disburseCloud, ILogger<IntermediaryCommissionDisburseTimerJob> log)
    {
        _db = db;
        _disburseCloud = disburseCloud;
        _log = log;
    }

    private record IntermediaryRow(
        long Id, long ClientId, string IntermediaryName, string? FederalTaxId,
        string? ContactEmail, string? ContactFirstLastName, string? Phone,
        string? AddressLine1, string? AddressLine2, string? City, string? State, string? ZipCode, string? Country,
        string CommissionDisburseEmail);

    private record CommissionRow(long CommissionPaymentTransactionId, string? PolicyNumber, decimal CommissionAmount);
    private record StatusReference(string DisbursementUuid, string PayeeUuid);

    public async Task<bool> CancelDisbursementAsync(
        string disbursementUuid, string payeeUuid, CancellationToken cancellationToken = default)
    {
        var (isSuccess, rawJson) = await _disburseCloud.CancelDisbursementAsync(
            disbursementUuid, payeeUuid, cancellationToken);
        if (!isSuccess)
        {
            _log.LogWarning("DisburseCloud cancellation failed for {DisbursementUuid}/{PayeeUuid}",
                disbursementUuid, payeeUuid);
            return false;
        }

        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync(cancellationToken);
        await conn.ExecuteAsync(
            @"UPDATE commission_payment_transaction
              SET transaction_status = 'CANCELED', response_code = 'CANCELED',
                  response_json = @responseJson, cancelled_on = CURRENT_DATE,
                  is_paid = false, updated_on = now()
              WHERE customer_reference_id = @disbursementUuid AND payee_reference_id = @payeeUuid",
            new { disbursementUuid, payeeUuid, responseJson = TruncateResponse(rawJson) });
        return true;
    }

    public async Task SynchronizeStatusesAsync(CancellationToken cancellationToken = default)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync(cancellationToken);

        var references = (await conn.QueryAsync<StatusReference>(
            @"SELECT DISTINCT customer_reference_id AS ""DisbursementUuid"",
                              payee_reference_id AS ""PayeeUuid""
              FROM commission_payment_transaction
              WHERE customer_reference_id IS NOT NULL AND payee_reference_id IS NOT NULL
                AND COALESCE(is_paid, false) = false
                AND UPPER(COALESCE(transaction_status, '')) NOT IN
                    ('SUCCESS', 'FAILED', 'CANCELED', 'CANCELLED', 'CREATE_FAILED')")).ToList();

        foreach (var reference in references)
        {
            var (payee, rawJson, isError) = await _disburseCloud.GetDisbursementPayeeAsync(
                reference.DisbursementUuid, reference.PayeeUuid, cancellationToken);
            if (isError || string.IsNullOrWhiteSpace(payee?.Status))
            {
                _log.LogWarning("Unable to synchronize DisburseCloud status for {DisbursementUuid}/{PayeeUuid}",
                    reference.DisbursementUuid, reference.PayeeUuid);
                continue;
            }

            var normalizedStatus = NormalizeStatus(payee.Status);
            var paid = normalizedStatus == "SUCCESS";
            await conn.ExecuteAsync(
                @"UPDATE commission_payment_transaction
                  SET transaction_status = @normalizedStatus,
                      response_code = @normalizedStatus,
                      response_json = @responseJson,
                      is_paid = @paid,
                      transaction_payment_date = CASE WHEN @paid THEN CURRENT_DATE ELSE transaction_payment_date END,
                      cancelled_on = CASE WHEN @normalizedStatus IN ('CANCELED', 'CANCELLED') THEN CURRENT_DATE ELSE cancelled_on END,
                      updated_on = now()
                  WHERE customer_reference_id = @disbursementUuid AND payee_reference_id = @payeeUuid",
                new
                {
                    normalizedStatus,
                    responseJson = TruncateResponse(rawJson),
                    paid,
                    disbursementUuid = reference.DisbursementUuid,
                    payeeUuid = reference.PayeeUuid,
                });
        }
    }

    public async Task ExecuteAsync(CancellationToken cancellationToken = default)
    {
        await ExecuteAsync(DateOnly.FromDateTime(DateTime.UtcNow), cancellationToken);
    }

    public async Task ExecuteAsync(DateOnly commissionPeriod, CancellationToken cancellationToken = default)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync(cancellationToken);

        var periodStart = new DateOnly(commissionPeriod.Year, commissionPeriod.Month, 1);
        var periodEnd = periodStart.AddMonths(1);

        // GetIntermediariesByClientId: ACTIVE intermediaries with a primary contact, their
        // own address (ProducerId IS NULL), and a CommissionDisburseEmail set.
        var intermediaries = (await conn.QueryAsync<IntermediaryRow>(
            @"SELECT i.id AS ""Id"", i.client_id AS ""ClientId"", i.intermediary_name AS ""IntermediaryName"", i.federal_tax_id AS ""FederalTaxId"",
                     ic.email AS ""ContactEmail"", ic.name AS ""ContactFirstLastName"", ic.telephone_number AS ""Phone"",
                     ia.address_line1 AS ""AddressLine1"", ia.address_line2 AS ""AddressLine2"",
                     ia.city AS ""City"", ia.state AS ""State"", ia.zip_code AS ""ZipCode"", ia.country AS ""Country"",
                     i.commission_disburse_email AS ""CommissionDisburseEmail""
              FROM intermediary i
              INNER JOIN LATERAL (
                  SELECT contact.email, contact.name, contact.telephone_number
                  FROM intermediary_contact contact
                  WHERE contact.intermediary_id = i.id
                    AND contact.client_id = i.client_id
                    AND contact.is_primary = true
                  ORDER BY contact.id
                  LIMIT 1
              ) ic ON true
              LEFT JOIN intermediary_address ia ON ia.intermediary_id = i.id AND ia.client_id = i.client_id
              WHERE UPPER(i.status) = 'ACTIVE'
                AND i.commission_disburse_email IS NOT NULL AND i.commission_disburse_email <> ''
              ORDER BY i.client_id, i.intermediary_code")).ToList();

        _log.LogInformation("IntermediaryCommissionDisburse: {Count} eligible intermediaries across all clients", intermediaries.Count);

        foreach (var i in intermediaries)
        {
            var commissions = (await conn.QueryAsync<CommissionRow>(
                @"SELECT cpt.id AS ""CommissionPaymentTransactionId"", p.policy_number AS ""PolicyNumber"",
                         cpt.commission_amount_due AS ""CommissionAmount""
                  FROM commission_payment_transaction cpt
                  INNER JOIN policy_commission pc ON cpt.policy_commission_id = pc.id AND pc.intermediary_id = @intermediaryId
                  LEFT JOIN policy p ON p.id = pc.policy_id
                  WHERE cpt.due_date >= @periodStart AND cpt.due_date < @periodEnd
                    AND cpt.client_id = @clientId
                    AND COALESCE(cpt.is_paid, false) = false
                    AND cpt.transaction_status = 'PENDING'
                    AND (UPPER(p.policy_status) = 'ACTIVE' OR p.id IS NULL)
                  ORDER BY p.policy_number",
                new { intermediaryId = i.Id, clientId = i.ClientId, periodStart, periodEnd })).ToList();

            if (commissions.Count == 0) continue; // Payees.Empty? True → skip, not an error.

            var total = commissions.Sum(c => c.CommissionAmount);
            var (firstName, lastName) = SplitName(i.ContactFirstLastName);
            var disbursementUuid = Guid.NewGuid().ToString();
            var payeeUuid = Guid.NewGuid().ToString();
            var transactionIds = commissions.Select(c => c.CommissionPaymentTransactionId).ToArray();

            int claimed;
            bool batchClaimed;
            await using (var claimTransaction = await conn.BeginTransactionAsync(cancellationToken))
            {
                claimed = await conn.ExecuteAsync(new CommandDefinition(
                    @"UPDATE commission_payment_transaction
                      SET transaction_status = 'PROCESSING', customer_reference_id = @disbursementUuid,
                          payee_reference_id = @payeeUuid, updated_on = now()
                      WHERE id = ANY(@transactionIds) AND transaction_status = 'PENDING'
                        AND COALESCE(is_paid, false) = false",
                    new { transactionIds, disbursementUuid, payeeUuid },
                    transaction: claimTransaction,
                    cancellationToken: cancellationToken));
                batchClaimed = await FinalizeBatchClaimAsync(
                    claimTransaction, claimed, transactionIds.Length, cancellationToken);
            }

            if (!batchClaimed)
            {
                _log.LogWarning("DisburseCloud batch claim changed {Claimed} of {Expected} rows; skipping to prevent duplicates", claimed, transactionIds.Length);
                continue;
            }

            var request = new CreateDisbursementRequest(
                Disbursement_uuid: disbursementUuid,
                Large_disbursement: false,
                Authorization_parties: null,
                Payees: new List<DisbursementPayee>
                {
                    new(
                        // The generic OutSystems API sample uses 1, while the captured response
                        // fixture uses 3. The available monthly-flow artifact does not contain an
                        // executable assignment, so retain the existing value pending confirmation
                        // of DisburseCloud's numeric code for Agency.
                        Payee_type_id: 3,
                        Amount: total,
                        Payee_uuid: payeeUuid,
                        Email: i.CommissionDisburseEmail,
                        First_name: firstName,
                        Last_name: lastName,
                        Business_name: i.IntermediaryName,
                        Address_one: i.AddressLine1,
                        Address_two: i.AddressLine2,
                        City: i.City,
                        State: i.State,
                        Zip_code: i.ZipCode,
                        Country: NormalizeCountry(i.Country),
                        Phone: NormalizePhone(i.Phone),
                        Delivery_options: new DeliveryOptions(Email: true, Sms: false, Direct_disburse: false, Automatic_disburst: null),
                        Allowed_payment_method_ids: new List<int> { 1 },
                        Permission_required_from: null,
                        Field_values: null,
                        Payment_method_settings: null,
                        Attached_document_uuid: null,
                        Attached_document_ids: null,
                        Mail_to_name: i.IntermediaryName,
                        Issue_date: null,
                        Status: null,
                        Id: null,
                        Original_payee_id: null,
                        Is_scheduled: false,
                        Status_id: null,
                        Is_sent_to_thirdParty: false,
                        Is_it_international_payment: false,
                        Notify_payee: true,
                        Recipient_instructions: null,
                        Check_number: null,
                        Company_logo_url: null),
                },
                Payor_email: null,
                Super_payor_email: null,
                Support_employee_email: null,
                Created_at: null,
                Id: null,
                Company_id: null,
                IsCompanyAccountUsed: null,
                Is_dc_disbursement: null,
                Is_dc_disbursement_approved: null);

            CreateDisbursementResponse? response;
            string rawJson;
            bool isError;
            try
            {
                (response, rawJson, isError) = await _disburseCloud.CreateDisbursementAsync(request, cancellationToken);
            }
            catch (Exception ex)
            {
                // The network outcome is unknown. Do not retry automatically because the
                // vendor may have accepted the stable UUID before the connection failed.
                _log.LogError(ex, "DisburseCloud CreateDisbursement outcome is unknown for {DisbursementUuid}", disbursementUuid);
                await conn.ExecuteAsync(
                    @"UPDATE commission_payment_transaction
                      SET transaction_status = 'REVIEW_REQUIRED', response_code = 'UNKNOWN', updated_on = now()
                      WHERE id = ANY(@transactionIds) AND transaction_status = 'PROCESSING'",
                    new { transactionIds });
                continue;
            }
            if (isError)
            {
                _log.LogWarning("DisburseCloud API Response failed for Client ID {ClientId}, Intermediary {IntermediaryId}: {Json}",
                    i.ClientId, i.Id, rawJson);
                await conn.ExecuteAsync(
                    @"UPDATE commission_payment_transaction
                      SET transaction_status = 'CREATE_FAILED', response_code = 'ERROR',
                          response_json = @rawJson, updated_on = now()
                      WHERE id = ANY(@transactionIds) AND transaction_status = 'PROCESSING'",
                    new { transactionIds, rawJson = TruncateResponse(rawJson) });
                continue;
            }

            // Creation is not payment. Persist vendor references and await status polling.
            var vendorStatus = response?.Payees?.FirstOrDefault()?.Status ?? "CREATED";
            await conn.ExecuteAsync(
                @"UPDATE commission_payment_transaction
                  SET transaction_status = @vendorStatus,
                      transaction_id = @transactionId,
                      customer_reference_id = @disbursementUuid,
                      payee_reference_id = @payeeUuid,
                      response_code = 'CREATED',
                      response_json = @responseJson,
                      is_paid = false,
                      updated_on = now()
                  WHERE id = ANY(@transactionIds) AND transaction_status = 'PROCESSING'",
                new
                {
                    transactionIds,
                    vendorStatus,
                    transactionId = response?.Id,
                    disbursementUuid,
                    payeeUuid,
                    responseJson = TruncateResponse(rawJson),
                });

            _log.LogInformation("IntermediaryCommissionDisburse: created {Amount} for intermediary {IntermediaryId} ({Count} commission rows); awaiting payment status",
                total, i.Id, commissions.Count);
        }
    }

    private static (string? First, string? Last) SplitName(string? fullName)
    {
        if (string.IsNullOrWhiteSpace(fullName)) return (null, null);
        var parts = fullName.Trim().Split(' ', 2);
        return parts.Length == 2 ? (parts[0], parts[1]) : (parts[0], null);
    }

    private static string? NormalizePhone(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return null;
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        return digits.Length == 11 && digits.StartsWith('1') ? digits[1..] : digits;
    }

    private static string? NormalizeCountry(string? country)
    {
        if (string.IsNullOrWhiteSpace(country)) return null;
        return country.Equals("US", StringComparison.OrdinalIgnoreCase)
            || country.Equals("USA", StringComparison.OrdinalIgnoreCase)
            || country.Equals("United States", StringComparison.OrdinalIgnoreCase)
            ? null
            : country.Trim().ToUpperInvariant();
    }

    private static string NormalizeStatus(string status)
    {
        var normalized = new string(status.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();
        return normalized.StartsWith("DISBURSEMENT") ? normalized[12..] : normalized;
    }

    private static string TruncateResponse(string response) =>
        response.Length <= 2000 ? response : response[..2000];

    internal static async Task<bool> FinalizeBatchClaimAsync(
        DbTransaction transaction,
        int claimed,
        int expected,
        CancellationToken cancellationToken = default)
    {
        if (claimed != expected)
        {
            await transaction.RollbackAsync(cancellationToken);
            return false;
        }

        await transaction.CommitAsync(cancellationToken);
        return true;
    }
}
