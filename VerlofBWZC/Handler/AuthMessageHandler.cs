using System.Net;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Components;

namespace VerlofBWZC.Services
{
    // Stuurt het token mee bij elke API-oproep. Verlopen token: eerst ongemerkt vernieuwen (TokenService).
    // Toch 401 met een token: één keer vernieuwen en opnieuw proberen; lukt dat niet, dan naar de loginpagina.
    public sealed class AuthMessageHandler : DelegatingHandler
    {
        private readonly TokenService _tokens;
        private readonly NavigationManager _nav;

        public AuthMessageHandler(TokenService tokens, NavigationManager nav)
        {
            _tokens = tokens;
            _nav = nav;
        }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var token = await _tokens.GetAccessTokenAsync();

            if (!string.IsNullOrWhiteSpace(token) && TokenService.IsExpired(token))
            {
                var refreshed = await _tokens.RefreshAsync(token);
                if (refreshed.Outcome == TokenService.RefreshOutcome.NoSession)
                {
                    await SignOutAndRedirect();
                    return new HttpResponseMessage(HttpStatusCode.Unauthorized) { RequestMessage = request, ReasonPhrase = "Sessie verlopen" };
                }
                if (refreshed.DemoEnded)
                    _nav.NavigateTo(_nav.Uri, forceLoad: true); // demo modus is gestopt: pagina opnieuw laden
                if (refreshed.Token != null)
                    SetBearer(request, refreshed.Token, token);
                token = refreshed.Token ?? token;
            }
            else if (!string.IsNullOrWhiteSpace(token) && request.Headers.Authorization is null)
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            }

            // Eén keer bewaren om na een vernieuwing opnieuw te kunnen versturen
            var body = request.Content == null ? null : await request.Content.ReadAsByteArrayAsync(cancellationToken);
            var response = await base.SendAsync(request, cancellationToken);

            // 401 met een token (sessie verlopen of ongeldig): vernieuwen en opnieuw proberen.
            // Zonder token (bv. inloggen met een fout wachtwoord) niet: dan toont de pagina zelf de fout.
            if (response.StatusCode is HttpStatusCode.Unauthorized && request.Headers.Authorization is { } sent)
            {
                var refreshed = await _tokens.RefreshAsync(sent.Parameter);
                if (refreshed.Token != null && refreshed.Token != sent.Parameter)
                {
                    response.Dispose();
                    var retry = Clone(request, body);
                    retry.Headers.Authorization = new AuthenticationHeaderValue("Bearer", refreshed.Token);
                    response = await base.SendAsync(retry, cancellationToken);
                    if (response.StatusCode is not HttpStatusCode.Unauthorized)
                        return response;
                }
                if (refreshed.Outcome != TokenService.RefreshOutcome.Offline)
                    await SignOutAndRedirect();
            }

            return response;
        }

        // Header enkel vervangen als er (nog) geen of het verlopen token in staat (niet als een pagina bewust een ander token meestuurt)
        private static void SetBearer(HttpRequestMessage request, string token, string? oldToken)
        {
            if (request.Headers.Authorization is null || request.Headers.Authorization.Parameter == oldToken)
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        private static HttpRequestMessage Clone(HttpRequestMessage request, byte[]? body)
        {
            var clone = new HttpRequestMessage(request.Method, request.RequestUri) { Version = request.Version };
            foreach (var header in request.Headers)
                clone.Headers.TryAddWithoutValidation(header.Key, header.Value);
            if (body != null)
            {
                clone.Content = new ByteArrayContent(body);
                foreach (var header in request.Content!.Headers)
                    clone.Content.Headers.TryAddWithoutValidation(header.Key, header.Value);
            }
            foreach (var option in request.Options)
                ((IDictionary<string, object?>)clone.Options)[option.Key] = option.Value;
            return clone;
        }

        private async Task SignOutAndRedirect()
        {
            await _tokens.ClearAsync();
            // Forceer een reload zodat UI-state (layouts/menus) schoon is
            _nav.NavigateTo("/login", forceLoad: true);
        }
    }
}
