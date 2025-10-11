using System.Net.Http.Json;
using VerlofBWZC.DataContracts.DTO;
using static VerlofBWZC.Pages.Login;


namespace VerlofBWZC.Services
{
    public class PersonApiService
    {
        private readonly HttpClient _http;

        public PersonApiService(HttpClient http)
        {
            _http = http;
        }

        public async Task<PersonBaseDTO?> GetPersonByIdAsync(int id)
        {
            return await _http.GetFromJsonAsync<PersonBaseDTO>($"api/person/{id}");
        }



        public async Task<TokenResponse?> LoginAsync(LoginDTO login)
        {
            var response = await _http.PostAsJsonAsync("api/person/login", login);
            if (response.IsSuccessStatusCode)
                return await response.Content.ReadFromJsonAsync<TokenResponse>();
            return null;
        }
    }
}
