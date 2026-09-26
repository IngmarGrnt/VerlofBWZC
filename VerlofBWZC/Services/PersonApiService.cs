using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
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

        public async Task<List<PersonBaseDTO>?> GetAllPersonsAsync()
        {
            return await _http.GetFromJsonAsync<List<PersonBaseDTO>>("api/allPersons");
        }   

        public async Task<bool> CreatePersonAsync(PersonCreateDTO person)
        {
            var response = await _http.PostAsJsonAsync("api/person", person);
            return response.IsSuccessStatusCode;
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
    }
}
