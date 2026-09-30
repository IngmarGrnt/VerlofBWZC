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
        private readonly TokenService _tokens;
        private static readonly AuthenticationState Anonymous =
            new(new ClaimsPrincipal(new ClaimsIdentity()));

        public JwtAuthenticationStateProvider(IJSRuntime js, NavigationManager nav, TokenService tokens)
        {
            _js = js;
            _nav = nav;
            _tokens = tokens;
        }

        public override async Task<AuthenticationState> GetAuthenticationStateAsync()
        {
            // Verlopen token: eerst ongemerkt vernieuwen ("ingelogd blijven"); lukt dat niet, dan niet aangemeld
            var token = await _tokens.GetValidAccessTokenAsync();
            if (string.IsNullOrWhiteSpace(token))
            {
                var stored = await _tokens.GetAccessTokenAsync();
                // Verlopen token wissen; een vernieuwingstoken (bv. als er even geen netwerk was) blijft bewaard
                if (!string.IsNullOrWhiteSpace(stored))
                    await _js.InvokeVoidAsync("localStorage.removeItem", TokenService.AuthTokenKey);
                return Anonymous;
            }

            var identity = new ClaimsIdentity(ParseClaims(token), authenticationType: "jwt");
            return new AuthenticationState(new ClaimsPrincipal(identity));
        }

        public async Task MarkUserAsAuthenticated(string token, string? refreshToken = null, bool? remember = null)
        {
            await _tokens.StoreAsync(token, refreshToken, remember);
            var identity = new ClaimsIdentity(ParseClaims(token), authenticationType: "jwt");
            NotifyAuthenticationStateChanged(Task.FromResult(
                new AuthenticationState(new ClaimsPrincipal(identity))));
        }

        // Uitloggen: ook het vernieuwingstoken van dit toestel intrekken
        public async Task MarkUserAsLoggedOut()
        {
            await _tokens.LogoutAsync();
            NotifyAuthenticationStateChanged(Task.FromResult(Anonymous));
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