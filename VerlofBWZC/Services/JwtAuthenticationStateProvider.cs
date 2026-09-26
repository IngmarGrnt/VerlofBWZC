using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace VerlofBWZC.Services
{
    public sealed class JwtAuthenticationStateProvider : AuthenticationStateProvider
    {
        private readonly IJSRuntime _js;
        private readonly NavigationManager _nav;
        private static readonly AuthenticationState Anonymous =
            new(new ClaimsPrincipal(new ClaimsIdentity()));

        public JwtAuthenticationStateProvider(IJSRuntime js, NavigationManager nav)
        {
            _js = js;
            _nav = nav;
        }

        public override async Task<AuthenticationState> GetAuthenticationStateAsync()
        {
            var token = await _js.InvokeAsync<string>("localStorage.getItem", "authToken");
            if (string.IsNullOrWhiteSpace(token) || IsExpired(token))
            {
                await SafeRemoveToken();
                return Anonymous;
            }

            var identity = new ClaimsIdentity(ParseClaims(token), authenticationType: "jwt");
            return new AuthenticationState(new ClaimsPrincipal(identity));
        }

        public async Task MarkUserAsAuthenticated(string token)
        {
            await _js.InvokeVoidAsync("localStorage.setItem", "authToken", token);
            var identity = new ClaimsIdentity(ParseClaims(token), authenticationType: "jwt");
            NotifyAuthenticationStateChanged(Task.FromResult(
                new AuthenticationState(new ClaimsPrincipal(identity))));
        }

        public async Task MarkUserAsLoggedOut()
        {
            await SafeRemoveToken();
            NotifyAuthenticationStateChanged(Task.FromResult(Anonymous));
        }

        private async Task SafeRemoveToken()
        {
            try
            {
                await _js.InvokeVoidAsync("localStorage.removeItem", "authToken");
                await _js.InvokeVoidAsync("localStorage.removeItem", "adminToken"); // demo modus
            }
            catch { /* ignore */ }
        }

        private static bool IsExpired(string jwt)
        {
            try
            {
                var parts = jwt.Split('.');
                if (parts.Length != 3) return true;

                var payload = parts[1];
                switch (payload.Length % 4)
                {
                    case 2: payload += "=="; break;
                    case 3: payload += "="; break;
                }

                var json = Encoding.UTF8.GetString(Convert.FromBase64String(payload));
                using var doc = JsonDocument.Parse(json);
                if (!doc.RootElement.TryGetProperty("exp", out var expProp)) return true;

                var exp = expProp.GetInt64(); // seconds since epoch
                var expiry = DateTimeOffset.FromUnixTimeSeconds(exp);
                // kleine clock skew marge
                return DateTimeOffset.UtcNow >= expiry.AddSeconds(-30);
            }
            catch
            {
                return true;
            }
        }

        private static IEnumerable<Claim> ParseClaims(string jwt)
        {
            var claims = new List<Claim>();
            try
            {
                var parts = jwt.Split('.');
                var payload = parts[1];
                switch (payload.Length % 4)
                {
                    case 2: payload += "=="; break;
                    case 3: payload += "="; break;
                }

                var json = Encoding.UTF8.GetString(Convert.FromBase64String(payload));
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                void AddIf(string claimType, string jsonProp)
                {
                    if (root.TryGetProperty(jsonProp, out var v) && v.ValueKind == JsonValueKind.String)
                        claims.Add(new Claim(claimType, v.GetString()!));
                }

                // Standaard claims
                AddIf(ClaimTypes.NameIdentifier, "sub");
                AddIf(ClaimTypes.NameIdentifier, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier");
                AddIf(ClaimTypes.Name, "name");
                AddIf(ClaimTypes.Name, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name");
                AddIf(ClaimTypes.Email, "email");
                AddIf(ClaimTypes.Email, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress");

                // Rollen: role/roles of MS-claimtype
                var roles = new List<string>();
                if (root.TryGetProperty("role", out var roleProp))
                {
                    if (roleProp.ValueKind == JsonValueKind.Array)
                        roles.AddRange(roleProp.EnumerateArray().Select(e => e.GetString()).Where(s => !string.IsNullOrWhiteSpace(s))!);
                    else if (roleProp.ValueKind == JsonValueKind.String)
                        roles.Add(roleProp.GetString()!);
                }
                if (root.TryGetProperty("roles", out var rolesProp))
                {
                    if (rolesProp.ValueKind == JsonValueKind.Array)
                        roles.AddRange(rolesProp.EnumerateArray().Select(e => e.GetString()).Where(s => !string.IsNullOrWhiteSpace(s))!);
                    else if (rolesProp.ValueKind == JsonValueKind.String)
                        roles.Add(rolesProp.GetString()!);
                }
                if (root.TryGetProperty("http://schemas.microsoft.com/ws/2008/06/identity/claims/role", out var msRole))
                {
                    if (msRole.ValueKind == JsonValueKind.Array)
                        roles.AddRange(msRole.EnumerateArray().Select(e => e.GetString()).Where(s => !string.IsNullOrWhiteSpace(s))!);
                    else if (msRole.ValueKind == JsonValueKind.String)
                        roles.Add(msRole.GetString()!);
                }

                foreach (var r in roles.Distinct(StringComparer.OrdinalIgnoreCase))
                    claims.Add(new Claim(ClaimTypes.Role, r));
            }
            catch
            {
                // bij parse-fout -> geen claims
            }
            return claims;
        }
    }
}