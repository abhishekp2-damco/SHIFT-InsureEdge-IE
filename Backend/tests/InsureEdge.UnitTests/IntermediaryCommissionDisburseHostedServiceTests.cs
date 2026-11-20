using InsureEdge.Infrastructure.BackgroundJobs;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace InsureEdge.UnitTests;

public class IntermediaryCommissionDisburseHostedServiceTests
{
    [Theory]
    [InlineData(2026, 2, 28)]
    [InlineData(2028, 2, 29)]
    [InlineData(2026, 4, 30)]
    [InlineData(2026, 12, 31)]
    public void NextRun_IsThreeAmUtcOnLastCalendarDay(int year, int month, int expectedDay)
    {
        var now = new DateTimeOffset(year, month, 1, 12, 0, 0, TimeSpan.Zero);

        var result = IntermediaryCommissionDisburseHostedService.GetNextScheduledRunUtc(now);

        Assert.Equal(new DateTimeOffset(year, month, expectedDay, 3, 0, 0, TimeSpan.Zero), result);
    }

    [Fact]
    public async Task Startup_ReplaysMostRecentMissedMonthlyPeriod()
    {
        var job = new RecordingJob();
        using var provider = CreateProvider(job);
        using var service = new IntermediaryCommissionDisburseHostedService(
            provider,
            NullLogger<IntermediaryCommissionDisburseHostedService>.Instance,
            new FixedTimeProvider(new DateTimeOffset(2026, 11, 3, 9, 0, 0, TimeSpan.Zero)));

        await service.StartAsync(CancellationToken.None);
        var period = await job.ExecutedPeriod.Task.WaitAsync(TimeSpan.FromSeconds(5));
        await service.StopAsync(CancellationToken.None);

        Assert.Equal(new DateOnly(2026, 10, 31), period);
        Assert.Equal(1, job.SynchronizeCount);
        Assert.Equal(1, job.ExecuteCount);
    }

    [Fact]
    public async Task ConcurrentTriggers_DoNotOverlapOrExecuteTwice()
    {
        var job = new BlockingJob();
        using var provider = CreateProvider(job);
        using var service = new IntermediaryCommissionDisburseHostedService(
            provider, NullLogger<IntermediaryCommissionDisburseHostedService>.Instance);
        var scheduledRun = new DateTimeOffset(2026, 10, 31, 3, 0, 0, TimeSpan.Zero);

        var first = service.ExecuteScheduledRunAsync(scheduledRun, CancellationToken.None);
        await job.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var secondResult = await service.ExecuteScheduledRunAsync(scheduledRun, CancellationToken.None);
        job.Release.TrySetResult();
        var firstResult = await first;

        Assert.True(firstResult);
        Assert.False(secondResult);
        Assert.Equal(1, job.ExecuteCount);
        Assert.Equal(1, job.MaximumConcurrency);
    }

    private static ServiceProvider CreateProvider(IIntermediaryCommissionDisburseTimerJob job) =>
        new ServiceCollection()
            .AddSingleton(job)
            .BuildServiceProvider();

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private class RecordingJob : IIntermediaryCommissionDisburseTimerJob
    {
        public int SynchronizeCount;
        public int ExecuteCount;
        public TaskCompletionSource<DateOnly> ExecutedPeriod { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public virtual Task SynchronizeStatusesAsync(CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref SynchronizeCount);
            return Task.CompletedTask;
        }

        public virtual Task ExecuteAsync(DateOnly commissionPeriod, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref ExecuteCount);
            ExecutedPeriod.TrySetResult(commissionPeriod);
            return Task.CompletedTask;
        }
    }

    private sealed class BlockingJob : RecordingJob
    {
        private int _concurrency;
        public int MaximumConcurrency;
        public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public override async Task SynchronizeStatusesAsync(CancellationToken cancellationToken = default)
        {
            var concurrency = Interlocked.Increment(ref _concurrency);
            MaximumConcurrency = Math.Max(MaximumConcurrency, concurrency);
            Started.TrySetResult();
            await Release.Task.WaitAsync(cancellationToken);
            Interlocked.Decrement(ref _concurrency);
        }
    }
}
