using Microsoft.JSInterop;

namespace VerlofBWZC.Services
{
    // App installeren op de gsm (PWA). Android/Chrome/Edge: de installatievraag van de browser (window.bwzcInstall
    // in index.html). iPhone/iPad: geen knop mogelijk, enkel uitleg (Delen > Zet op beginscherm).
    public class AppInstallService : IDisposable
    {
        private readonly IJSRuntime _js;
        private DotNetObjectReference<AppInstallService>? _ref;
        private const string LaterKey = "bwzcInstallLater";
        private static readonly TimeSpan LaterFor = TimeSpan.FromDays(14);

        public AppInstallService(IJSRuntime js) => _js = js;

        public record State(bool CanPrompt, bool Standalone, bool Ios, bool Mobile)
        {
            // Al geïnstalleerd (geopend als app) = niets tonen; anders installatievraag (CanPrompt) of uitleg
            public bool CanInstall => !Standalone;
        }

        public State Current { get; private set; } = new(false, false, false, false);
        public event Action? Changed;

        public async Task InitAsync()
        {
            try
            {
                if (_ref == null)
                {
                    _ref = DotNetObjectReference.Create(this);
                    await _js.InvokeVoidAsync("bwzcInstall.register", _ref);
                }
                Current = await _js.InvokeAsync<State>("bwzcInstall.state");
            }
            catch
            {
                // oudere browser of geen index.html-hulp: niets tonen
            }
        }

        [JSInvokable]
        public async Task OnInstallChanged()
        {
            await InitAsync();
            Changed?.Invoke();
        }

        // Android/Chrome: de installatievraag van de gsm. Geeft "accepted", "dismissed" of "unavailable".
        public async Task<string> PromptAsync()
        {
            string outcome;
            try { outcome = await _js.InvokeAsync<string>("bwzcInstall.prompt"); }
            catch { outcome = "unavailable"; }
            await OnInstallChanged();
            return outcome;
        }

        // "Later": de melding 2 weken niet meer tonen (enkel in deze browser)
        public async Task<bool> IsSnoozedAsync()
        {
            try
            {
                var value = await _js.InvokeAsync<string?>("localStorage.getItem", LaterKey);
                return long.TryParse(value, out var ticks) && DateTime.UtcNow - new DateTime(ticks, DateTimeKind.Utc) < LaterFor;
            }
            catch
            {
                return false;
            }
        }

        public async Task SnoozeAsync()
        {
            try { await _js.InvokeVoidAsync("localStorage.setItem", LaterKey, DateTime.UtcNow.Ticks.ToString()); }
            catch { /* niet bewaard: de melding komt de volgende keer terug */ }
        }

        public void Dispose() => _ref?.Dispose();
    }
}
