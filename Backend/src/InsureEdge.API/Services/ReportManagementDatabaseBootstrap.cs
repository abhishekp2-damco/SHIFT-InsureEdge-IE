using InsureEdge.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InsureEdge.API.Services;

public static class ReportManagementDatabaseBootstrap
{
    public static async Task ApplyAsync(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<InsureEdgeDbContext>();
        var assembly = typeof(ReportManagementDatabaseBootstrap).Assembly;
        await using var resource = assembly.GetManifestResourceStream("InsureEdge.API.Database.050_report_management.sql")
            ?? throw new InvalidOperationException("Embedded Report Management database script was not found.");
        using var reader = new StreamReader(resource);
        var sql = await reader.ReadToEndAsync(cancellationToken);
        await db.Database.OpenConnectionAsync(cancellationToken);
        try
        {
            await using var command = new NpgsqlCommand(sql, (NpgsqlConnection)db.Database.GetDbConnection()) { CommandTimeout = 120 };
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        finally { await db.Database.CloseConnectionAsync(); }
    }
}
