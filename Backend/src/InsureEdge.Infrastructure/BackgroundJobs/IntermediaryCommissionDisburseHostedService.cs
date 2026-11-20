// AI_GENERATED | HUMAN_VALIDATION_REQUIRED
// Hosted-service equivalent of OutSystems IntermediaryCommissionDisburseCloud's "last day
// of the month" wake timer.
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace InsureEdge.Infrastructure.BackgroundJobs
{
    public class IntermediaryCommissionDisburseHostedService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<IntermediaryCommissionDisburseHostedService> _logger;
        private readonly TimeProvider _timeProvider;
        private readonly SemaphoreSlim _executionLock = new(1, 1);

        // Runs at 3 AM UTC on the last day of each calendar month.
        private const int ScheduleHourUtc = 3;

        public IntermediaryCommissionDisburseHostedService(
            IServiceProvider serviceProvider,
            ILogger<IntermediaryCommissionDisburseHostedService> logger,
            TimeProvider? timeProvider = null)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
            _timeProvider = timeProvider ?? TimeProvider.System;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("IntermediaryCommissionDisburseHostedService starting");

            // Replaying the most recent scheduled period makes restarts safe. ExecuteAsync's
            // existing PENDING -> PROCESSING database claim makes the replay idempotent.
            var mostRecentRun = GetMostRecentScheduledRunUtc(_timeProvider.GetUtcNow());
            await ExecuteScheduledRunAsync(mostRecentRun, stoppingToken);

            var nextRun = GetNextScheduledRunUtc(_timeProvider.GetUtcNow());
            while (!stoppingToken.IsCancellationRequested)
            {
                var delay = nextRun - _timeProvider.GetUtcNow();
                if (delay > TimeSpan.Zero)
                {
                    _logger.LogInformation(
                        "Next IntermediaryCommissionDisburse execution is {ScheduledRunUtc}", nextRun);
                    await Task.Delay(delay, _timeProvider, stoppingToken);
                }

                await ExecuteScheduledRunAsync(nextRun, stoppingToken);
                nextRun = GetNextScheduledRunUtc(nextRun);
            }
        }

        internal async Task<bool> ExecuteScheduledRunAsync(
            DateTimeOffset scheduledRunUtc, CancellationToken stoppingToken)
        {
            if (!await _executionLock.WaitAsync(0, stoppingToken))
            {
                _logger.LogWarning(
                    "IntermediaryCommissionDisburse execution for {ScheduledRunUtc} skipped because another execution is active",
                    scheduledRunUtc);
                return false;
            }

            try
            {
                _logger.LogInformation(
                    "IntermediaryCommissionDisburseTimerJob execution triggered for period {CommissionPeriod:yyyy-MM}",
                    scheduledRunUtc);
                using var scope = _serviceProvider.CreateScope();
                var timerJob = scope.ServiceProvider.GetRequiredService<IIntermediaryCommissionDisburseTimerJob>();
                await timerJob.SynchronizeStatusesAsync(stoppingToken);
                await timerJob.ExecuteAsync(DateOnly.FromDateTime(scheduledRunUtc.UtcDateTime), stoppingToken);
                return true;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "IntermediaryCommissionDisburseTimerJob execution failed");
                return false;
            }
            finally
            {
                _executionLock.Release();
            }
        }

        internal static DateTimeOffset GetMostRecentScheduledRunUtc(DateTimeOffset nowUtc)
        {
            nowUtc = nowUtc.ToUniversalTime();
            var thisMonth = ScheduledRunUtc(nowUtc.Year, nowUtc.Month);
            if (nowUtc >= thisMonth) return thisMonth;

            var previousMonth = nowUtc.AddMonths(-1);
            return ScheduledRunUtc(previousMonth.Year, previousMonth.Month);
        }

        internal static DateTimeOffset GetNextScheduledRunUtc(DateTimeOffset afterUtc)
        {
            afterUtc = afterUtc.ToUniversalTime();
            var thisMonth = ScheduledRunUtc(afterUtc.Year, afterUtc.Month);
            if (afterUtc < thisMonth) return thisMonth;

            var nextMonth = afterUtc.AddMonths(1);
            return ScheduledRunUtc(nextMonth.Year, nextMonth.Month);
        }

        private static DateTimeOffset ScheduledRunUtc(int year, int month) =>
            new(year, month, DateTime.DaysInMonth(year, month), ScheduleHourUtc, 0, 0, TimeSpan.Zero);

        public override async Task StopAsync(CancellationToken cancellationToken)
        {
            _logger.LogInformation("IntermediaryCommissionDisburseHostedService stopping");
            await base.StopAsync(cancellationToken);
        }

        public override void Dispose()
        {
            _executionLock.Dispose();
            base.Dispose();
        }
    }
}
