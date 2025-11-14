//using Microsoft.JSInterop;

//public class AuthMessageHandler : DelegatingHandler
//{
//    private readonly IJSRuntime _js;

//    public AuthMessageHandler(IJSRuntime js)
//    {
//        _js = js;
//    }

//    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
//    {
//        var token = await _js.InvokeAsync<string>("localStorage.getItem", "authToken");
//        if (!string.IsNullOrEmpty(token))
//        {
//            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
//        }
//        return await base.SendAsync(request, cancellationToken);
//    }
//}

using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.JSInterop;
using Microsoft.AspNetCore.Components;

namespace VerlofBWZC.Services
{
    public sealed class AuthMessageHandler : DelegatingHandler
    {
        private readonly IJSRuntime _js;
        private readonly NavigationManager _nav;

        public AuthMessageHandler(IJSRuntime js, NavigationManager nav)
        {
            _js = js;
            _nav = nav;
        }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            // 1) Token ophalen
            var token = await _js.InvokeAsync<string>("localStorage.getItem", "authToken");

            // 2) Als er een token is: check expiratie en zet Authorization header
            if (!string.IsNullOrWhiteSpace(token))
            {
                if (IsExpired(token))
                {
                    await SignOutAndRedirect();
                    // Optioneel: voorkom nutteloze calls met verlopen token
                    return new HttpResponseMessage(HttpStatusCode.Unauthorized)
                    {
                        RequestMessage = request,
                        ReasonPhrase = "JWT expired"
                    };
                }

                if (request.Headers.Authorization is null)
                {
                    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                }
            }

            // 3) Call uitvoeren
            var response = await base.SendAsync(request, cancellationToken);

            // 4) Bij 401/403 -> uitloggen en redirecten naar /login
            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            {
                await SignOutAndRedirect();
            }

            return response;
        }

        private static bool IsExpired(string jwt)
        {
            try
            {
                var parts = jwt.Split('.');
                if (parts.Length != 3) return true;

                var payload = parts[1];
                // Base64 padding fix
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
                // Onzekerheid = behandelen als verlopen
                return true;
            }
        }

        private async Task SignOutAndRedirect()
        {
            try
            {
                await _js.InvokeVoidAsync("localStorage.removeItem", "authToken");
            }
            catch
            {
                // ignore
            }

            // Forceer een reload zodat UI-state (layouts/menus) schoon is
            _nav.NavigateTo("/login", forceLoad: true);
        }
    }
}
