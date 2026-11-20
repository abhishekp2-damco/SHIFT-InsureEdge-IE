// DisburseCloud API v1.2.1 integration. Credentials are supplied through configuration.
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using InsureEdge.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace InsureEdge.Infrastructure.Services;

public class DisburseCloudClient : IDisburseCloudClient
{
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<DisburseCloudClient> _log;
    private readonly string _baseUrl;
    private readonly string _username;
    private readonly string _password;
    private readonly string? _companyApiKey;
    private readonly SemaphoreSlim _tokenLock = new(1, 1);
    private string? _accessToken;
    private DateTimeOffset _accessTokenExpiresAt;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public DisburseCloudClient(IHttpClientFactory httpFactory, IConfiguration config, ILogger<DisburseCloudClient> log)
    {
        _httpFactory = httpFactory;
        _log = log;
        _baseUrl = (config["DISBURSECLOUD_BASE_URL"] ?? "https://sandbox.services.disbursecloud.com").TrimEnd('/');
        _username = config["DISBURSECLOUD_USERNAME"] ?? "";
        _password = config["DISBURSECLOUD_PASSWORD"] ?? "";
        _companyApiKey = config["DISBURSECLOUD_COMPANY_API_KEY"];
    }

    private async Task<string?> AuthenticateAsync(HttpClient client, CancellationToken cancellationToken)
    {
        if (TokenIsUsable()) return _accessToken;
        await _tokenLock.WaitAsync(cancellationToken);
        try
        {
            if (TokenIsUsable()) return _accessToken;
            if (string.IsNullOrWhiteSpace(_username) || string.IsNullOrWhiteSpace(_password))
            {
                _log.LogWarning("DisburseCloud authentication is not configured");
                return null;
            }

            var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_username}:{_password}"));
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/api/v1/companies/authenticate");
            req.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);

            using var response = await client.SendAsync(req, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _log.LogWarning("DisburseCloud authentication failed with HTTP {Status}", response.StatusCode);
                return null;
            }

            try
            {
                var auth = JsonSerializer.Deserialize<DisburseCloudAuthenticationResponse>(body, JsonOptions);
                if (string.IsNullOrWhiteSpace(auth?.AccessToken)) return null;
                _accessToken = auth.AccessToken;
                _accessTokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(Math.Max(0, auth.ExpiresIn - 60));
                return _accessToken;
            }
            catch (JsonException ex)
            {
                _log.LogWarning(ex, "DisburseCloud authenticate returned non-JSON body");
            }
            return null;
        }
        finally
        {
            _tokenLock.Release();
        }
    }

    public async Task<(CreateDisbursementResponse? Response, string RawJson, bool IsError)> CreateDisbursementAsync(
        CreateDisbursementRequest request, CancellationToken cancellationToken = default)
    {
        var validationError = Validate(request);
        if (validationError != null)
            return (null, JsonSerializer.Serialize(new { error = validationError }), true);

        var client = _httpFactory.CreateClient("disbursecloud");
        var token = await AuthenticateAsync(client, cancellationToken);
        if (string.IsNullOrEmpty(token))
            return (null, "{\"error\":\"authentication failed\"}", true);

        using var req = CreateAuthorizedRequest(HttpMethod.Post, $"{_baseUrl}/api/v1/disbursements/create", token);
        req.Content = JsonContent.Create(request, options: JsonOptions);

        using var response = await client.SendAsync(req, cancellationToken);
        var rawJson = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _log.LogWarning("DisburseCloud CreateDisbursement failed with HTTP {Status}", response.StatusCode);
            return (null, rawJson, true);
        }

        CreateDisbursementResponse? parsed = null;
        try
        {
            parsed = JsonSerializer.Deserialize<CreateDisbursementResponse>(rawJson, JsonOptions);
        }
        catch (JsonException ex)
        {
            _log.LogWarning(ex, "DisburseCloud CreateDisbursement returned unparseable body");
        }

        // A 2xx response must still contain the documented disbursement and payee references.
        var isError = parsed == null || string.IsNullOrWhiteSpace(parsed.Disbursement_uuid) || parsed.Payees is not { Count: > 0 };
        if (isError)
            _log.LogWarning("DisburseCloud API Response failed: {Json}", rawJson);

        return (parsed, rawJson, isError);
    }

    public async Task<(DisbursementPayee? Response, string RawJson, bool IsError)> GetDisbursementPayeeAsync(
        string disbursementUuid, string payeeUuid, CancellationToken cancellationToken = default)
    {
        if (!ReferencesAreValid(disbursementUuid, payeeUuid))
            return (null, "{\"error\":\"disbursement_uuid and payee_uuid are required\"}", true);

        var client = _httpFactory.CreateClient("disbursecloud");
        var token = await AuthenticateAsync(client, cancellationToken);
        if (string.IsNullOrWhiteSpace(token)) return (null, "{\"error\":\"authentication failed\"}", true);

        var url = $"{_baseUrl}/api/v1/disbursements/{Uri.EscapeDataString(disbursementUuid)}/payees/{Uri.EscapeDataString(payeeUuid)}";
        using var request = CreateAuthorizedRequest(HttpMethod.Get, url, token);
        using var response = await client.SendAsync(request, cancellationToken);
        var rawJson = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode) return (null, rawJson, true);

        try
        {
            var parsed = JsonSerializer.Deserialize<DisbursementPayee>(rawJson, JsonOptions);
            return (parsed, rawJson, parsed == null);
        }
        catch (JsonException ex)
        {
            _log.LogWarning(ex, "DisburseCloud GetDisbursementPayee returned invalid JSON");
            return (null, rawJson, true);
        }
    }

    public async Task<(bool IsSuccess, string RawJson)> CancelDisbursementAsync(
        string disbursementUuid, string payeeUuid, CancellationToken cancellationToken = default)
    {
        if (!ReferencesAreValid(disbursementUuid, payeeUuid))
            return (false, "{\"error\":\"disbursement_uuid and payee_uuid are required\"}");

        var client = _httpFactory.CreateClient("disbursecloud");
        var token = await AuthenticateAsync(client, cancellationToken);
        if (string.IsNullOrWhiteSpace(token)) return (false, "{\"error\":\"authentication failed\"}");

        var url = $"{_baseUrl}/api/v1/disbursements/{Uri.EscapeDataString(disbursementUuid)}/payees/{Uri.EscapeDataString(payeeUuid)}/cancel";
        using var request = CreateAuthorizedRequest(HttpMethod.Post, url, token);
        using var response = await client.SendAsync(request, cancellationToken);
        var rawJson = await response.Content.ReadAsStringAsync(cancellationToken);
        if (response.StatusCode != HttpStatusCode.OK)
            _log.LogWarning("DisburseCloud CancelDisbursement failed with HTTP {Status}", response.StatusCode);
        return (response.StatusCode == HttpStatusCode.OK, rawJson);
    }

    private bool TokenIsUsable() =>
        !string.IsNullOrWhiteSpace(_accessToken) && DateTimeOffset.UtcNow < _accessTokenExpiresAt;

    private HttpRequestMessage CreateAuthorizedRequest(HttpMethod method, string url, string token)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (!string.IsNullOrWhiteSpace(_companyApiKey))
            request.Headers.TryAddWithoutValidation("CompanyApiKey", _companyApiKey);
        return request;
    }

    private static bool ReferencesAreValid(string disbursementUuid, string payeeUuid) =>
        !string.IsNullOrWhiteSpace(disbursementUuid) && !string.IsNullOrWhiteSpace(payeeUuid);

    private static string? Validate(CreateDisbursementRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Disbursement_uuid)) return "disbursement_uuid is required";
        if (request.Large_disbursement == null) return "large_disbursement is required";
        if (request.Payees is not { Count: > 0 }) return "at least one payee is required";

        foreach (var payee in request.Payees)
        {
            if (payee.Payee_type_id is < 1 or > 4) return "payee_type_id must be between 1 and 4";
            if (payee.Amount <= 0) return "payee amount must be greater than zero";
            if (string.IsNullOrWhiteSpace(payee.Payee_uuid)) return "payee_uuid is required";
            if (string.IsNullOrWhiteSpace(payee.Email)) return "payee email is required";
            if (string.IsNullOrWhiteSpace(payee.First_name)) return "payee first_name is required";
            if (string.IsNullOrWhiteSpace(payee.Address_one)) return "payee address_one is required";
            if (string.IsNullOrWhiteSpace(payee.City)) return "payee city is required";
            if (string.IsNullOrWhiteSpace(payee.State)) return "payee state is required";
            if (payee.State.Length != 2) return "payee state must be a two-letter code";
            if (string.IsNullOrWhiteSpace(payee.Zip_code)) return "payee zip_code is required";
            if (payee.Zip_code.Length != 5) return "payee zip_code must contain five characters";
            if (string.IsNullOrWhiteSpace(payee.Phone)) return "payee phone is required";
            if (payee.Phone.Length != 10 || payee.Phone.Any(c => !char.IsDigit(c)))
                return "payee phone must contain ten digits";
            if (payee.Delivery_options == null) return "payee delivery_options is required";
            if (payee.Delivery_options.Email != true
                && payee.Delivery_options.Sms != true
                && payee.Delivery_options.Direct_disburse != true)
                return "at least one payee delivery option is required";
            if (payee.Allowed_payment_method_ids is not { Count: > 0 })
                return "payee allowed_payment_method_ids is required";
            if (payee.Allowed_payment_method_ids.Any(id => id is < 1 or > 7))
                return "payee allowed_payment_method_ids contains an unsupported value";
        }
        return null;
    }
}
