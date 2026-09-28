using System.Net.Http.Json;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using VerlofBWZC.DataContracts.DTO;
using VerlofBWZC.Handler;

namespace VerlofBWZC.Services
{
    // Demo modus (enkel Admin): de app bekijken als een gekozen rol, ploeg en specialiteit.
    // De echte admin-token wordt bewaard als "adminToken" en bij Stoppen teruggezet. De API laat in demo modus enkel lezen toe.
    public class DemoModeService
    {
        public const string AdminTokenKey = "adminToken";
        private const string AuthTokenKey = "authToken";

        private readonly IJSRuntime _js;
        private readonly HttpClient _http;
        private readonly NavigationManager _nav;

        public DemoModeService(IJSRuntime js, HttpClient http, NavigationManager nav)
        {
            _js = js;
            _http = http;
            _nav = nav;
        }

        // Extra: bij Manager de extra ploegen, bv. "Ploeg2 · IGS", "Ploeg3 · alle specialiteiten"
        public record DemoInfo(string Role, string Team, string Speciality, List<string> Extra);

        public async Task<DemoInfo?> GetActiveAsync()
        {
            var token = await _js.InvokeAsync<string?>("localStorage.getItem", AuthTokenKey);
            if (!JwtUtils.IsDemo(token))
                return null;

            return new DemoInfo(
                JwtUtils.GetUserRolFromToken(token) ?? "",
                JwtUtils.GetClaim(token, "team") ?? "",
                JwtUtils.GetClaim(token, "speciality") ?? "",
                (JwtUtils.GetClaim(token, "demo_scopes") ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries)
                    .Select(p => p.Split(':'))
                    .Where(b => b.Length == 2)
                    .Select(b => b[1] == "*" ? $"{b[0]} · alle specialiteiten" : $"{b[0]} · {b[1]}")
                    .ToList());
        }

        // Enkel een echte (niet-demo) admin kan de demo modus starten
        public async Task<bool> CanStartAsync()
        {
            var token = await _js.InvokeAsync<string?>("localStorage.getItem", AuthTokenKey);
            return !JwtUtils.IsDemo(token) && JwtUtils.GetUserRolFromToken(token) == "Admin";
        }

        public async Task<string?> StartAsync(string role, string team, string speciality, List<VerlofBWZC.DataContracts.DTO.Access.ScopeItemDTO>? scopes = null)
        {
            var adminToken = await _js.InvokeAsync<string?>("localStorage.getItem", AuthTokenKey);
            var response = await _http.PostAsJsonAsync("api/person/demo", new DemoRequestDTO { Role = role, Team = team, Speciality = speciality, Scopes = scopes ?? new() });
            if (!response.IsSuccessStatusCode)
                return "Demo modus starten mislukt.";

            var result = await response.Content.ReadFromJsonAsync<TokenDto>();
            if (string.IsNullOrWhiteSpace(result?.Token))
                return "Demo modus starten mislukt.";

            await _js.InvokeVoidAsync("localStorage.setItem", AdminTokenKey, adminToken);
            await _js.InvokeVoidAsync("localStorage.setItem", AuthTokenKey, result.Token);
            _nav.NavigateTo("/", forceLoad: true); // alles opnieuw laden als de gekozen rol
            return null;
        }

        public async Task StopAsync()
        {
            var adminToken = await _js.InvokeAsync<string?>("localStorage.getItem", AdminTokenKey);
            await _js.InvokeVoidAsync("localStorage.removeItem", AdminTokenKey);

            if (string.IsNullOrWhiteSpace(adminToken))
                await _js.InvokeVoidAsync("localStorage.removeItem", AuthTokenKey);
            else
                await _js.InvokeVoidAsync("localStorage.setItem", AuthTokenKey, adminToken);

            _nav.NavigateTo(string.IsNullOrWhiteSpace(adminToken) ? "/login" : "/", forceLoad: true);
        }

        private class TokenDto
        {
            public string? Token { get; set; }
        }
    }
}
