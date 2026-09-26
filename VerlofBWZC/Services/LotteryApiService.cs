using System.Net.Http.Json;
using VerlofBWZC.DataContracts.DTO.Lottery;

namespace VerlofBWZC.Services
{
    // Lotingen: gedeeld door de teamkalender (popup) en de loterijpagina
    public class LotteryApiService
    {
        private readonly HttpClient _http;

        public LotteryApiService(HttpClient http)
        {
            _http = http;
        }

        public record Result<T>(bool Ok, T? Value, string? Error);

        public async Task<List<LotteryDrawDTO>> GetDrawsAsync()
        {
            try
            {
                return await _http.GetFromJsonAsync<List<LotteryDrawDTO>>("api/lottery/draws") ?? new();
            }
            catch
            {
                return new();
            }
        }

        // Toegepast = er werd al verlof weggehaald bij een verliezer
        public static bool IsApplied(LotteryDrawDTO draw) =>
            draw.Losers.Any(l => l.RemovedDay || l.RemovedNight);

        // Bewaart de loting; geeft het (eventueel door de server aangepaste) volgnummer terug
        public async Task<Result<int>> CreateAsync(LotteryDrawDTO draw)
        {
            try
            {
                var resp = await _http.PostAsJsonAsync("api/lottery/draw", draw);
                if (!resp.IsSuccessStatusCode)
                    return new(false, 0, await ErrorAsync(resp, "Opslaan van de loting mislukt"));
                int number;
                try { number = await resp.Content.ReadFromJsonAsync<int>(); } catch { number = draw.DrawNumber; }
                return new(true, number, null);
            }
            catch (Exception ex)
            {
                return new(false, 0, ex.Message);
            }
        }

        // Verliezers verliezen hun verlof op de shift(en) van de loting; geeft het weggehaalde verlof terug
        public async Task<Result<List<RestoredDayOffDTO>>> ApplyAsync(int drawNumber)
        {
            try
            {
                var resp = await _http.PostAsync($"api/lottery/draw/{drawNumber}/apply", null);
                if (!resp.IsSuccessStatusCode)
                    return new(false, null, await ErrorAsync(resp, "Toepassen mislukt"));
                return new(true, await resp.Content.ReadFromJsonAsync<List<RestoredDayOffDTO>>() ?? new(), null);
            }
            catch (Exception ex)
            {
                return new(false, null, ex.Message);
            }
        }

        // Verwijdert de loting; toegepast verlof wordt teruggezet en teruggegeven
        public async Task<Result<List<RestoredDayOffDTO>>> DeleteAsync(int drawNumber)
        {
            try
            {
                var resp = await _http.DeleteAsync($"api/lottery/draw/{drawNumber}");
                if (!resp.IsSuccessStatusCode)
                    return new(false, null, await ErrorAsync(resp, "Verwijderen mislukt"));
                return new(true, await resp.Content.ReadFromJsonAsync<List<RestoredDayOffDTO>>() ?? new(), null);
            }
            catch (Exception ex)
            {
                return new(false, null, ex.Message);
            }
        }

        private static async Task<string> ErrorAsync(HttpResponseMessage resp, string fallback)
        {
            var text = await resp.Content.ReadAsStringAsync();
            if (resp.StatusCode == System.Net.HttpStatusCode.Forbidden && string.IsNullOrWhiteSpace(text))
                return "Je hebt hier geen rechten voor (of opslaan is momenteel niet toegelaten).";
            return string.IsNullOrWhiteSpace(text) || text.TrimStart().StartsWith("{") ? $"{fallback} ({(int)resp.StatusCode})." : text;
        }
    }
}
