using System.Net;
using System.Text;
using FluentAssertions;
using InsureEdge.Application.Interfaces;
using InsureEdge.Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace InsureEdge.UnitTests;

public class DisburseCloudClientTests
{
    [Fact]
    public async Task Create_authenticates_with_basic_auth_and_reuses_unexpired_token()
    {
        var handler = new QueueHandler(
            Json(HttpStatusCode.OK, """{"access_token":"token-1","token_type":"Bearer","expires_in":3600}"""),
            Json(HttpStatusCode.OK, CreateResponseJson),
            Json(HttpStatusCode.OK, CreateResponseJson));
        var client = CreateClient(handler);

        (await client.CreateDisbursementAsync(ValidRequest())).IsError.Should().BeFalse();
        (await client.CreateDisbursementAsync(ValidRequest())).IsError.Should().BeFalse();

        handler.Requests.Count(r => r.Path.EndsWith("/companies/authenticate")).Should().Be(1);
        handler.Requests[0].Authorization.Should().StartWith("Basic ");
        handler.Requests.Where(r => r.Path.EndsWith("/disbursements/create"))
            .Should().OnlyContain(r => r.Authorization == "Bearer token-1");
    }

    [Fact]
    public async Task Create_refreshes_an_expired_token()
    {
        var handler = new QueueHandler(
            Json(HttpStatusCode.OK, """{"access_token":"token-1","token_type":"Bearer","expires_in":0}"""),
            Json(HttpStatusCode.OK, CreateResponseJson),
            Json(HttpStatusCode.OK, """{"access_token":"token-2","token_type":"Bearer","expires_in":3600}"""),
            Json(HttpStatusCode.OK, CreateResponseJson));
        var client = CreateClient(handler);

        await client.CreateDisbursementAsync(ValidRequest());
        await client.CreateDisbursementAsync(ValidRequest());

        handler.Requests.Count(r => r.Path.EndsWith("/companies/authenticate")).Should().Be(2);
    }

    [Fact]
    public async Task Create_does_not_call_vendor_when_required_payee_fields_are_missing()
    {
        var handler = new QueueHandler();
        var request = ValidRequest() with
        {
            Payees = new List<DisbursementPayee> { ValidPayee() with { Phone = null } },
        };

        var result = await CreateClient(handler).CreateDisbursementAsync(request);

        result.IsError.Should().BeTrue();
        result.RawJson.Should().Contain("phone is required");
        handler.Requests.Should().BeEmpty();
    }

    [Fact]
    public async Task Create_treats_non_success_http_status_as_failure()
    {
        var handler = new QueueHandler(
            Json(HttpStatusCode.OK, """{"access_token":"token-1","token_type":"Bearer","expires_in":3600}"""),
            Json(HttpStatusCode.BadRequest, """{"name":"VALIDATION_ERROR","message":"Invalid payee"}"""));

        var result = await CreateClient(handler).CreateDisbursementAsync(ValidRequest());

        result.IsError.Should().BeTrue();
        result.RawJson.Should().Contain("VALIDATION_ERROR");
    }

    [Fact]
    public async Task Create_stops_when_authentication_fails()
    {
        var handler = new QueueHandler(Json(HttpStatusCode.Unauthorized, """{"name":"UNAUTHORIZED_ERROR"}"""));

        var result = await CreateClient(handler).CreateDisbursementAsync(ValidRequest());

        result.IsError.Should().BeTrue();
        handler.Requests.Should().ContainSingle();
        handler.Requests[0].Path.Should().EndWith("/companies/authenticate");
    }

    [Fact]
    public async Task Get_payee_returns_documented_status_for_synchronization()
    {
        var handler = new QueueHandler(
            Json(HttpStatusCode.OK, """{"access_token":"token-1","token_type":"Bearer","expires_in":3600}"""),
            Json(HttpStatusCode.OK, """{"payee_uuid":"payee-1","amount":100,"status":"Success"}"""));

        var result = await CreateClient(handler).GetDisbursementPayeeAsync("disb-1", "payee-1");

        result.IsError.Should().BeFalse();
        result.Response!.Status.Should().Be("Success");
    }

    [Fact]
    public async Task Cancel_posts_to_documented_path_and_only_http_200_is_success()
    {
        var handler = new QueueHandler(
            Json(HttpStatusCode.OK, """{"access_token":"token-1","token_type":"Bearer","expires_in":3600}"""),
            Json(HttpStatusCode.OK, ""),
            Json(HttpStatusCode.BadRequest, """{"name":"VALIDATION_ERROR"}"""));
        var client = CreateClient(handler, companyApiKey: "company-key");

        var success = await client.CancelDisbursementAsync("disb-1", "payee-1");
        var failure = await client.CancelDisbursementAsync("disb-2", "payee-2");

        success.IsSuccess.Should().BeTrue();
        failure.IsSuccess.Should().BeFalse();
        handler.Requests[1].Method.Should().Be(HttpMethod.Post);
        handler.Requests[1].Path.Should().EndWith("/disbursements/disb-1/payees/payee-1/cancel");
        handler.Requests[1].CompanyApiKey.Should().Be("company-key");
    }

    private static DisburseCloudClient CreateClient(QueueHandler handler, string? companyApiKey = null)
    {
        var values = new Dictionary<string, string?>
        {
            ["DISBURSECLOUD_BASE_URL"] = "https://sandbox.services.disbursecloud.com",
            ["DISBURSECLOUD_USERNAME"] = "company-tin",
            ["DISBURSECLOUD_PASSWORD"] = "api-key",
            ["DISBURSECLOUD_COMPANY_API_KEY"] = companyApiKey,
        };
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        return new DisburseCloudClient(
            new TestHttpClientFactory(new HttpClient(handler)),
            configuration,
            NullLogger<DisburseCloudClient>.Instance);
    }

    private static CreateDisbursementRequest ValidRequest() => new(
        "disb-1", false, null, new List<DisbursementPayee> { ValidPayee() },
        null, null, null, null, null, null, null, null, null);

    private static DisbursementPayee ValidPayee() => new(
        Payee_type_id: 3,
        Amount: 100m,
        Payee_uuid: "payee-1",
        Email: "agency@example.com",
        First_name: "Jane",
        Last_name: "Doe",
        Business_name: "Agency LLC",
        Address_one: "123 Main St",
        Address_two: null,
        City: "Miami",
        State: "FL",
        Zip_code: "33101",
        Country: null,
        Phone: "3055550100",
        Delivery_options: new DeliveryOptions(true, false, false, null),
        Allowed_payment_method_ids: new List<int> { 1 },
        Permission_required_from: null,
        Field_values: null,
        Payment_method_settings: null,
        Attached_document_uuid: null,
        Attached_document_ids: null,
        Mail_to_name: null,
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
        Company_logo_url: null);

    private const string CreateResponseJson = """
        {"disbursement_uuid":"disb-1","large_disbursement":false,"created_at":"2026-11-02T10:00:00Z",
         "payees":[{"payee_type_id":3,"amount":100,"payee_uuid":"payee-1","email":"agency@example.com",
         "first_name":"Jane","address_one":"123 Main St","city":"Miami","state":"FL","zip_code":"33101",
         "phone":"3055550100","delivery_options":{"email":true},"allowed_payment_method_ids":[1],"status":"Pending"}]}
        """;

    private static HttpResponseMessage Json(HttpStatusCode status, string content) => new(status)
    {
        Content = new StringContent(content, Encoding.UTF8, "application/json"),
    };

    private sealed class TestHttpClientFactory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => client;
    }

    private sealed class QueueHandler(params HttpResponseMessage[] responses) : HttpMessageHandler
    {
        private readonly Queue<HttpResponseMessage> _responses = new(responses);
        public List<CapturedRequest> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(new CapturedRequest(
                request.Method,
                request.RequestUri!.AbsolutePath,
                request.Headers.Authorization?.ToString(),
                request.Headers.TryGetValues("CompanyApiKey", out var values) ? values.Single() : null,
                request.Content == null ? null : await request.Content.ReadAsStringAsync(cancellationToken)));
            return _responses.Dequeue();
        }
    }

    private record CapturedRequest(
        HttpMethod Method, string Path, string? Authorization, string? CompanyApiKey, string? Body);
}
