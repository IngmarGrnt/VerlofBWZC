using System.Net;
using System.Net.Http.Json;
using VerlofBWZC.DataContracts.DTO;


namespace VerlofBWZC.Services
{
    public class PersonApiService
    {
        private readonly HttpClient _http;

        public PersonApiService(HttpClient http)
        {
            _http = http;
        }

        // Resultaat met de foutmelding van de server (Nederlands) als het mislukt
        public record Result<T>(T? Value, string? Error)
        {
            public bool Ok => Error == null;
        }

        public async Task<PersonBaseDTO?> GetPersonByIdAsync(int id)
        {
            return await _http.GetFromJsonAsync<PersonBaseDTO>($"api/person/{id}");
        }

        public async Task<Result<LoginResultDTO>> LoginAsync(LoginDTO login)
        {
            try
            {
                var response = await _http.PostAsJsonAsync("api/person/login", login);
                if (response.IsSuccessStatusCode)
                    return new(await response.Content.ReadFromJsonAsync<LoginResultDTO>(), null);
                return new(null, await ErrorAsync(response, "Ongeldige inloggegevens."));
            }
            catch
            {
                return new(null, "De server is niet bereikbaar. Probeer het later opnieuw.");
            }
        }

        // Eigen wachtwoord wijzigen; geeft een nieuw token terug
        public async Task<Result<LoginResultDTO>> ChangePasswordAsync(ChangePasswordDTO dto)
        {
            try
            {
                var response = await _http.PostAsJsonAsync("api/person/change-password", dto);
                if (response.IsSuccessStatusCode)
                    return new(await response.Content.ReadFromJsonAsync<LoginResultDTO>(), null);
                return new(null, await ErrorAsync(response, "Wachtwoord wijzigen is mislukt."));
            }
            catch (Exception ex)
            {
                return new(null, ex.Message);
            }
        }

        // Admin/Manager: nieuw tijdelijk wachtwoord (eenmalig getoond)
        public async Task<Result<TemporaryPasswordDTO>> ResetPasswordAsync(int id)
        {
            try
            {
                var response = await _http.PostAsync($"api/person/{id}/reset-password", null);
                if (response.IsSuccessStatusCode)
                    return new(await response.Content.ReadFromJsonAsync<TemporaryPasswordDTO>(), null);
                return new(null, await ErrorAsync(response, "Wachtwoord resetten is mislukt."));
            }
            catch (Exception ex)
            {
                return new(null, ex.Message);
            }
        }

        public async Task<List<PersonBaseDTO>?> GetAllPersonsAsync()
        {
            return await _http.GetFromJsonAsync<List<PersonBaseDTO>>("api/allPersons");
        }

        // Nieuwe persoon; de server maakt een tijdelijk wachtwoord aan
        public async Task<Result<TemporaryPasswordDTO>> CreatePersonAsync(PersonCreateDTO person)
        {
            try
            {
                var response = await _http.PostAsJsonAsync("api/person", person);
                if (response.IsSuccessStatusCode)
                    return new(await response.Content.ReadFromJsonAsync<TemporaryPasswordDTO>(), null);
                return new(null, await ErrorAsync(response, "Toevoegen is mislukt."));
            }
            catch (Exception ex)
            {
                return new(null, ex.Message);
            }
        }

        public async Task<bool> UpdatePersonAsync(int id, PersonCreateDTO person)
        {
            var response = await _http.PostAsJsonAsync($"api/person/update/{id}", person);
            return response.IsSuccessStatusCode;
        }

        public async Task<bool> DeletePersonAsync(int id)
        {
            var response = await _http.DeleteAsync($"api/person/{id}");
            return response.IsSuccessStatusCode;
        }

        private static async Task<string> ErrorAsync(HttpResponseMessage response, string fallback)
        {
            if (response.StatusCode == HttpStatusCode.Forbidden)
                return "Je hebt hier geen rechten voor.";
            var text = (await response.Content.ReadAsStringAsync()).Trim().Trim('"');
            return string.IsNullOrWhiteSpace(text) || text.StartsWith("{") ? fallback : text;
        }
    }
}
