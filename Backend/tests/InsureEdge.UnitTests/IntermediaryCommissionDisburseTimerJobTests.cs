using System.Data;
using System.Data.Common;
using InsureEdge.Infrastructure.BackgroundJobs;
using Xunit;

namespace InsureEdge.UnitTests;

public class IntermediaryCommissionDisburseTimerJobTests
{
    [Fact]
    public async Task PartialBatchClaim_RollsBackAndPreventsProcessing()
    {
        await using var transaction = new RecordingTransaction();

        var claimed = await IntermediaryCommissionDisburseTimerJob.FinalizeBatchClaimAsync(
            transaction, claimed: 1, expected: 2);

        Assert.False(claimed);
        Assert.Equal(0, transaction.CommitCount);
        Assert.Equal(1, transaction.RollbackCount);
    }

    [Fact]
    public async Task OnlyExactBatchClaim_CommitsForDuplicatePrevention()
    {
        await using var winningTransaction = new RecordingTransaction();
        await using var competingTransaction = new RecordingTransaction();

        var winningClaim = await IntermediaryCommissionDisburseTimerJob.FinalizeBatchClaimAsync(
            winningTransaction, claimed: 2, expected: 2);
        var competingClaim = await IntermediaryCommissionDisburseTimerJob.FinalizeBatchClaimAsync(
            competingTransaction, claimed: 0, expected: 2);

        Assert.True(winningClaim);
        Assert.False(competingClaim);
        Assert.Equal(1, winningTransaction.CommitCount);
        Assert.Equal(0, winningTransaction.RollbackCount);
        Assert.Equal(0, competingTransaction.CommitCount);
        Assert.Equal(1, competingTransaction.RollbackCount);
    }

    private sealed class RecordingTransaction : DbTransaction
    {
        public int CommitCount { get; private set; }
        public int RollbackCount { get; private set; }

        public override IsolationLevel IsolationLevel => IsolationLevel.ReadCommitted;
        protected override DbConnection DbConnection => null!;

        public override void Commit() => CommitCount++;
        public override void Rollback() => RollbackCount++;

        public override Task CommitAsync(CancellationToken cancellationToken = default)
        {
            CommitCount++;
            return Task.CompletedTask;
        }

        public override Task RollbackAsync(CancellationToken cancellationToken = default)
        {
            RollbackCount++;
            return Task.CompletedTask;
        }
    }
}
