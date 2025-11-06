using Microsoft.JSInterop;

namespace VerlofBWZC.Client.Services
{


    public sealed class ClientCleanupService : IClientCleanupService
    {
        private readonly IJSRuntime _js;
        private IJSObjectReference? _module;

        public ClientCleanupService(IJSRuntime js) => _js = js;

        private async Task<IJSObjectReference> GetModuleAsync()
            => _module ??= await _js.InvokeAsync<IJSObjectReference>("import", "./js/clientCleanup.js");

        public async Task ClearAsync(
            bool clearLocal = true,
            bool clearSession = true,
            bool clearHttpCaches = true,
            bool clearIndexedDb = true,
            bool unregisterSW = false)
        {
            var m = await GetModuleAsync();

            if (clearLocal)      await m.InvokeVoidAsync("clearLocalStorage");
            if (clearSession)    await m.InvokeVoidAsync("clearSessionStorage");
            if (clearIndexedDb)  await m.InvokeVoidAsync("clearIndexedDB");
            if (clearHttpCaches) await m.InvokeVoidAsync("clearAllCaches");
            if (unregisterSW)    await m.InvokeVoidAsync("unregisterServiceWorkers");
        }

        public async ValueTask DisposeAsync()
        {
            if (_module is not null)
            {
                await _module.DisposeAsync();
                _module = null;
            }
        }
    }
}