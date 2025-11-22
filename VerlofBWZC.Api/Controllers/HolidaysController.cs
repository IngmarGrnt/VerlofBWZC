

using Microsoft.AspNetCore.Mvc;
using System.Net.Http;
using System.Net.Http.Json;
using VerlofBWZC.DataContracts.DTO.Holiday;

namespace VerlofBWZC.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class HolidaysController : Controller
    {
        private readonly HttpClient _httpClient;
        public HolidaysController(IHttpClientFactory httpClientFactory)
        {
            _httpClient = httpClientFactory.CreateClient();
        }

        [HttpGet("public/{year}")]
        public async Task<IActionResult> GetPublicHolidays(int year)
        {
            var url = $"https://openholidaysapi.org/PublicHolidays?countryIsoCode=BE&subdivisionCode=BE&languageIsoCode=NL&validFrom={year}-01-01&validTo={year}-12-31";
            var result = await _httpClient.GetStringAsync(url);
            return Content(result, "application/json");
        }

        //[HttpGet("school/{year}")]
        //public async Task<IActionResult> GetSchoolHolidays(int year)
        //{
        //    var url = $"https://openholidaysapi.org/SchoolHolidays?countryIsoCode=BE&subdivisionCode=BE&languageIsoCode=NL&validFrom={year}-01-01&validTo={year}-12-31";
        //    var result = await _httpClient.GetStringAsync(url);
        //    return Content(result, "application/json");
        //}



        //[HttpGet("school/{year}")]
        //public async Task<IActionResult> GetSchoolHolidays(int year)
        //{
        //    //var url = $"https://openholidaysapi.org/SchoolHolidays?countryIsoCode=BE&subdivisionCode=BE&languageIsoCode=NL&validFrom={year}-01-01&validTo={year}-12-31";
        //    //https://openholidaysapi.org/SchoolHolidays?countryIsoCode=BE&languageIsoCode=NL&validFrom=
        //    var url = $"https://openholidaysapi.org/SchoolHolidays?countryIsoCode=BE&languageIsoCode=NL&validFrom={year}-01-01&validTo={year}-12-31";

        //    var result = await _httpClient.GetStringAsync(url);

        //    var allHolidays = System.Text.Json.JsonSerializer.Deserialize<List<SchoolHolidayDTO>>(result, new System.Text.Json.JsonSerializerOptions
        //    {
        //        PropertyNameCaseInsensitive = true
        //    }) ?? new();

        //    var holidays = allHolidays.ToList();

        //    // Corrigeer Kerstvakantie en Zomervakantie einddatums
        //    foreach (var holiday in holidays)
        //    {
        //        var name = holiday.Name?.FirstOrDefault(n => n.Language == "NL")?.Text
        //            ?? holiday.Name?.FirstOrDefault()?.Text
        //            ?? "";

        //        // Kerstvakantie maximaal tot 3 januari volgend jaar
        //        if (name.Contains("Kerstvakantie", StringComparison.OrdinalIgnoreCase))
        //        {
        //            var maxAllowed = new DateTime(year + 1, 1, 3);
        //            if (holiday.EndDate > maxAllowed)
        //                holiday.EndDate = maxAllowed;
        //        }

        //        // Zomervakantie maximaal tot 31 augustus van het jaar
        //        if (name.Contains("Zomervakantie", StringComparison.OrdinalIgnoreCase))
        //        {
        //            var maxAllowed = new DateTime(year, 8, 31);
        //            if (holiday.EndDate > maxAllowed)
        //                holiday.EndDate = maxAllowed;
        //        }
        //    }

        //    // Filter "Begin van de zomervakantie" als er een overlappende "Zomervakantie" is
        //    holidays = holidays.Where(h =>
        //    {
        //        var name = h.Name?.FirstOrDefault(n => n.Language == "NL")?.Text
        //            ?? h.Name?.FirstOrDefault()?.Text
        //            ?? "";

        //        if (name.StartsWith("Begin van de zomervakantie", StringComparison.OrdinalIgnoreCase))
        //        {
        //            // Zoek overlappende "Zomervakantie"
        //            return !holidays.Any(z =>
        //                (z.Name?.FirstOrDefault(n => n.Language == "NL")?.Text
        //                    ?? z.Name?.FirstOrDefault()?.Text
        //                    ?? "") == "Zomervakantie"
        //                && z.StartDate <= h.EndDate
        //                && z.EndDate >= h.StartDate
        //            );
        //        }
        //        return true;
        //    }).ToList();

        //    return Ok(holidays);
        //}

        [HttpGet("school/{year}")]
        public async Task<IActionResult> GetSchoolHolidays(int year)
        {
            // Haal ALLE data op (alle gemeenschappen) en filter lokaal op "groups" => "BE-NL"
            var url = $"https://openholidaysapi.org/SchoolHolidays?countryIsoCode=BE&languageIsoCode=NL&validFrom={year}-01-01&validTo={year}-12-31";

            var result = await _httpClient.GetStringAsync(url);

            // Filter de ruwe JSON op groups[].code == "BE-NL" zonder DTO-wijzigingen
            using var doc = System.Text.Json.JsonDocument.Parse(result);
            var filtered = new List<System.Text.Json.JsonElement>();

            foreach (var item in doc.RootElement.EnumerateArray())
            {
                if (item.TryGetProperty("groups", out var groups) && groups.ValueKind == System.Text.Json.JsonValueKind.Array)
                {
                    var isBeNl = groups
                        .EnumerateArray()
                        .Any(g => g.ValueKind == System.Text.Json.JsonValueKind.Object
                                  && g.TryGetProperty("code", out var codeProp)
                                  && string.Equals(codeProp.GetString(), "BE-NL", StringComparison.OrdinalIgnoreCase));

                    if (isBeNl)
                        filtered.Add(item);
                }
            }

            // Deserialize enkel de gefilterde items naar jouw bestaande DTO
            var filteredJson = System.Text.Json.JsonSerializer.Serialize(filtered);
            var holidays = System.Text.Json.JsonSerializer.Deserialize<List<SchoolHolidayDTO>>(filteredJson, new System.Text.Json.JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? new();

            // Corrigeer Kerstvakantie en Zomervakantie einddatums
            foreach (var holiday in holidays)
            {
                var name = holiday.Name?.FirstOrDefault(n => n.Language == "NL")?.Text
                    ?? holiday.Name?.FirstOrDefault()?.Text
                    ?? "";

                // Kerstvakantie maximaal tot 3 januari volgend jaar
                if (name.Contains("Kerstvakantie", StringComparison.OrdinalIgnoreCase))
                {
                    var maxAllowed = new DateTime(year + 1, 1, 3);
                    if (holiday.EndDate > maxAllowed)
                        holiday.EndDate = maxAllowed;
                }

                // Zomervakantie maximaal tot 31 augustus van het jaar
                if (name.Contains("Zomervakantie", StringComparison.OrdinalIgnoreCase))
                {
                    var maxAllowed = new DateTime(year, 8, 31);
                    if (holiday.EndDate > maxAllowed)
                        holiday.EndDate = maxAllowed;
                }
            }

            // Filter "Begin van de zomervakantie" als er een overlappende "Zomervakantie" is
            holidays = holidays.Where(h =>
            {
                var name = h.Name?.FirstOrDefault(n => n.Language == "NL")?.Text
                    ?? h.Name?.FirstOrDefault()?.Text
                    ?? "";

                if (name.StartsWith("Begin van de zomervakantie", StringComparison.OrdinalIgnoreCase))
                {
                    return !holidays.Any(z =>
                        (z.Name?.FirstOrDefault(n => n.Language == "NL")?.Text
                            ?? z.Name?.FirstOrDefault()?.Text
                            ?? "") == "Zomervakantie"
                        && z.StartDate <= h.EndDate
                        && z.EndDate >= h.StartDate
                    );
                }
                return true;
            }).ToList();

            return Ok(holidays);
        }

    }
}