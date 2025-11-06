namespace VerlofBWZC.Services
{
    public interface IClientCleanupService : IAsyncDisposable
    {
        Task ClearAsync(
            bool clearLocal = true,
            bool clearSession = true,
            bool clearHttpCaches = true,
            bool clearIndexedDb = true,
            bool unregisterSW = false);
    }
}
