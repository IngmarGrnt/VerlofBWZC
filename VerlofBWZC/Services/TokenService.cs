using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.JSInterop;
using VerlofBWZC.DataContracts.DTO;

namespace VerlofBWZC.Services
{
    // Token (1 uur) en vernieuwingstoken ("ingelogd blijven") van dit toestel, in localStorage.
    // Verlopen token: ongemerkt vernieuwen met het vernieuwingstoken. Eén vernieuwing tegelijk (ook bij veel
    // gelijktijdige API-oproepen). Vernieuwen gebeurt met een eigen HttpClient, zonder AuthMessageHandler.
    public class TokenService
    {
        public const string AuthTokenKey = "authToken";
        public const string RefreshTokenKey = "refreshToken";
        public const string RememberKey = "rememberMe";
        private const string AdminTokenKey = "adminToken"; // demo modus

        private static readonly SemaphoreSlim Gate = new(1, 1);
        private readonly IJSRuntime _js;
        private readonly HttpClient _raw;

        public enum RefreshOutcome { Refreshed, NoSession, Offline }
        public record RefreshResult(RefreshOutcome Outcome, string? Token = null, bool DemoEnded = false);

        public TokenService(IJSRuntime js, IConfiguration config)
        {
            _js = js;
            _raw = new HttpClient { BaseAddress = new Uri(config["ApiBaseAddress"]!) };
        }

        public Task<string?> GetAccessTokenAsync() => GetAsync(AuthTokenKey);

        // Na inloggen of wachtwoord wijzigen
        public async Task StoreAsync(string token, string? refreshToken, bool? remember = null)
        {
            await SetAsync(AuthTokenKey, token);
            if (!string.IsNullOrEmpty(refreshToken))
                await SetAsync(RefreshTokenKey, refreshToken);
            if (remember is bool r)
                await SetAsync(RememberKey, r ? "1" : "0");
        }

        public async Task<bool> GetRememberAsync() => await GetAsync(RememberKey) == "1";

        // Een geldig token: het huidige, of een vernieuwd. Null als er geen sessie (meer) is.
        public async Task<string?> GetValidAccessTokenAsync()
        {
            var token = await GetAccessTokenAsync();
            if (!string.IsNullOrWhiteSpace(token) && !IsExpired(token))
                return token;
            var result = await RefreshAsync(token);
            return result.Token;
        }

        // Vernieuwen. failedToken = het token dat verlopen of geweigerd is (heeft een andere oproep intussen al
        // vernieuwd, dan wordt dat nieuwe token gebruikt).
        public async Task<RefreshResult> RefreshAsync(string? failedToken)
        {
            await Gate.WaitAsync();
            try
            {
                var current = await GetAccessTokenAsync();
                if (!string.IsNullOrWhiteSpace(current) && current != failedToken && !IsExpired(current))
                    return new(RefreshOutcome.Refreshed, current);

                var refreshToken = await GetAsync(RefreshTokenKey);
                if (string.IsNullOrWhiteSpace(refreshToken))
                    return new(RefreshOutcome.NoSession);

                HttpResponseMessage response;
                try
                {
                    response = await _raw.PostAsJsonAsync("api/person/refresh", new RefreshRequestDTO { RefreshToken = refreshToken });
                }
                catch
                {
                    return new(RefreshOutcome.Offline); // geen netwerk: sessie niet weggooien
                }

                if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.BadRequest)
                {
                    await RemoveAsync(RefreshTokenKey);
                    return new(RefreshOutcome.NoSession);
                }
                if (!response.IsSuccessStatusCode)
                    return new(RefreshOutcome.Offline); // bv. te veel pogingen of server tijdelijk weg

                var result = await response.Content.ReadFromJsonAsync<LoginResultDTO>();
                if (result == null || string.IsNullOrWhiteSpace(result.Token))
                    return new(RefreshOutcome.Offline);

                await SetAsync(AuthTokenKey, result.Token);
                if (!string.IsNullOrWhiteSpace(result.RefreshToken))
                    await SetAsync(RefreshTokenKey, result.RefreshToken);

                // Demo modus: het vernieuwde token is dat van de admin zelf, dus de demo stopt
                var demoEnded = !string.IsNullOrWhiteSpace(await GetAsync(AdminTokenKey));
                if (demoEnded)
                    await RemoveAsync(AdminTokenKey);

                return new(RefreshOutcome.Refreshed, result.Token, demoEnded);
            }
            finally
            {
                Gate.Release();
            }
        }

        // Uitloggen op dit toestel: vernieuwingstoken intrekken op de server en alles lokaal wissen
        public async Task LogoutAsync()
        {
            var refreshToken = await GetAsync(RefreshTokenKey);
            if (!string.IsNullOrWhiteSpace(refreshToken))
            {
                try { await _raw.PostAsJsonAsync("api/person/logout", new RefreshRequestDTO { RefreshToken = refreshToken }); }
                catch { /* offline: het token verloopt vanzelf */ }
            }
            await ClearAsync();
        }

        public async Task ClearAsync()
        {
            await RemoveAsync(AuthTokenKey);
            await RemoveAsync(RefreshTokenKey);
            await RemoveAsync(AdminTokenKey);
        }

        // Token verlopen (of binnen de minuut)?
        public static bool IsExpired(string? jwt)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(jwt)) return true;
                var parts = jwt.Split('.');
                if (parts.Length != 3) return true;

                var payload = parts[1].Replace('-', '+').Replace('_', '/');
                switch (payload.Length % 4)
                {
                    case 2: payload += "=="; break;
                    case 3: payload += "="; break;
                }

                using var doc = JsonDocument.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(payload)));
                if (!doc.RootElement.TryGetProperty("exp", out var expProp)) return true;
                var expiry = DateTimeOffset.FromUnixTimeSeconds(expProp.GetInt64());
                return DateTimeOffset.UtcNow >= expiry.AddSeconds(-60);
            }
            catch
            {
                return true;
            }
        }

        private async Task<string?> GetAsync(string key)
        {
            try { return await _js.InvokeAsync<string?>("localStorage.getItem", key); }
            catch { return null; }
        }

        private async Task SetAsync(string key, string value)
        {
            try { await _js.InvokeVoidAsync("localStorage.setItem", key, value); }
            catch { /* opslag geblokkeerd: enkel deze sessie */ }
        }

        private async Task RemoveAsync(string key)
        {
            try { await _js.InvokeVoidAsync("localStorage.removeItem", key); }
            catch { /* negeren */ }
        }
    }
}
