using Microsoft.JSInterop;
using VerlofBWZC.DataContracts.DTO;
using VerlofBWZC.Handler;

namespace VerlofBWZC.Services
{
    // De ingelogde persoon (rol, ploeg, specialiteit). In demo modus geeft de API de gekozen demo-waarden terug.
    public class CurrentPersonService
    {
        private readonly IJSRuntime _js;
        private readonly PersonApiService _personApi;

        public CurrentPersonService(IJSRuntime js, PersonApiService personApi)
        {
            _js = js;
            _personApi = personApi;
        }

        public async Task<PersonBaseDTO?> GetAsync()
        {
            var token = await _js.InvokeAsync<string?>("localStorage.getItem", "authToken");
            return int.TryParse(JwtUtils.GetUserIdFromToken(token), out var id)
                ? await _personApi.GetPersonByIdAsync(id)
                : null;
        }

        public static bool IsAdmin(PersonBaseDTO? p) => string.Equals(p?.Role, "Admin", StringComparison.OrdinalIgnoreCase);
    }
}
